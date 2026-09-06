const express = require('express');
const { getDb, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { sendToUser } = require('../fcm');
const { validate, createOffer, updateOffer } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');

const router = express.Router();

// Fire-and-forget push notification helper (never blocks the response)
function pushNotify(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

// Re-export so other routes can use it
module.exports.notifyUser = createNotification;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Map a provider user row to API fields.
 * row: [id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at]
 */
function providerFromRow(row) {
  return {
    id: String(row[0]),
    name: row[1],
    avatarUrl: row[6] || null,
    rating: row[7] ?? null,
    reviewCount: row[8] ?? 0,
    providerCompletionRate: null,
    providerVerified: row[9] === 1,
  };
}

/**
 * Map a single offer row to API shape.
 * offerRow: [id, job_id, provider_id, amount, message, status, created_at, updated_at]
 */
function offerFromRow(offerRow, providerRow) {
  return {
    id: offerRow[0],
    jobId: offerRow[1],
    providerId: String(offerRow[2]),
    price: offerRow[3],
    message: offerRow[4] || null,
    status: offerRow[5],
    createdAt: offerRow[6],
    updatedAt: offerRow[7],
    providerName: providerRow ? providerRow[1] : null,
    providerAvatar: providerRow ? (providerRow[6] || null) : null,
    providerRating: providerRow ? (providerRow[7] ?? null) : null,
    providerReviewCount: providerRow ? (providerRow[8] ?? 0) : 0,
    providerCompletionRate: null,
    providerVerified: providerRow ? (providerRow[9] === 1) : false,
    negotiations: [],
  };
}

/**
 * Map a negotiation row to API shape.
 * negRow: [id, job_id, provider_id, seeker_id, proposed_amount, status, created_at, updated_at]
 */
function negotiationFromRow(negRow) {
  return {
    id: negRow[0],
    jobId: negRow[1],
    providerId: String(negRow[2]),
    seekerId: String(negRow[3]),
    price: negRow[4],
    status: negRow[5],
    createdAt: negRow[6],
    updatedAt: negRow[7],
  };
}

/**
 * Get provider info by ID.
 */
async function getProviderInfo(providerId) {
  const db = await getDb();
  const result = db.exec(
    'SELECT id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at FROM users WHERE id = ?',
    [providerId]
  );
  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values[0];
  }
  return null;
}

/**
 * Get a single offer + provider + negotiations.
 */
async function getOfferWithDetails(offerId) {
  const db = await getDb();

  const offerResult = db.exec('SELECT * FROM offers WHERE id = ?', [offerId]);
  if (offerResult.length === 0 || offerResult[0].values.length === 0) {
    return null;
  }

  const offerRow = offerResult[0].values[0];
  const providerRow = await getProviderInfo(offerRow[2]);
  const offer = offerFromRow(offerRow, providerRow);

  const negResult = db.exec(
    'SELECT * FROM negotiations WHERE job_id = ? AND provider_id = ? ORDER BY created_at ASC',
    [offerRow[1], offerRow[2]]
  );
  if (negResult.length > 0) {
    offer.negotiations = negResult[0].values.map(negotiationFromRow);
  }

  return offer;
}

// ─── Routes ────────────────────────────────────────────────────────────────

// POST /api/offers — submit offer (provider only)
router.post('/', requireAuth, sanitize('message'), validate(createOffer), async (req, res) => {
  try {
    const { jobId, price, message } = res.locals.parsedBody;

    const db = await getDb();

    // Verify the user is a provider
    const userResult = db.exec('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userResult[0].values[0][0] !== 'provider') {
      return res.status(403).json({ error: 'Only providers can submit offers' });
    }

    // Verify the job exists and is open
    const jobResult = db.exec('SELECT status FROM jobs WHERE id = ?', [jobId]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (jobResult[0].values[0][0] !== 'open') {
      return res.status(400).json({ error: 'Job is not open for offers' });
    }

    // Insert the offer
    db.run(
      'INSERT INTO offers (job_id, provider_id, amount, message, status) VALUES (?, ?, ?, ?, ?)',
      [jobId, req.userId, price, message || null, 'pending']
    );

    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    const offer = await getOfferWithDetails(newId);

    // Notify the seeker that a new offer was received
    const jobInfo = db.exec('SELECT seeker_id, title FROM jobs WHERE id = ?', [jobId]);
    if (jobInfo.length > 0 && jobInfo[0].values.length > 0) {
      const [seekerId, jobTitle] = jobInfo[0].values[0];
      createNotification(db, seekerId, 'new_offer',
        'New offer on your job',
        `${offer.providerName} submitted Rs. ${price.toLocaleString()} for "${jobTitle}"`,
        { jobId, offerId: String(newId) }
      );
      pushNotify(seekerId, {
        title: 'New offer on your job',
        body: `${offer.providerName} submitted Rs. ${price.toLocaleString()} for "${jobTitle}"`,
        data: { type: 'new_offer', jobId, offerId: String(newId) },
      });
      save();
    }

    res.status(201).json(offer);
  } catch (err) {
    console.error('[offers/submit]', err);
    res.status(500).json({ error: 'Failed to submit offer' });
  }
});

// GET /api/offers/mine — list offers submitted by the current provider
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const db = await getDb();

    const userResult = db.exec('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userResult[0].values[0][0] !== 'provider') {
      return res.status(403).json({ error: 'Only providers can view their offers' });
    }

    const result = db.exec(
      'SELECT * FROM offers WHERE provider_id = ? ORDER BY created_at DESC',
      [req.userId]
    );

    const offers = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        const providerRow = await getProviderInfo(row[2]);
        const offer = offerFromRow(row, providerRow);

        // Get job title for context
        const jobResult = db.exec('SELECT id, title, category, location, budget_min, budget_max, status FROM jobs WHERE id = ?', [row[1]]);
        if (jobResult.length > 0 && jobResult[0].values.length > 0) {
          const jobRow = jobResult[0].values[0];
          offer.job = {
            id: jobRow[0],
            title: jobRow[1],
            category: jobRow[2],
            area: jobRow[3],
            budgetMin: jobRow[4],
            budgetMax: jobRow[5],
            status: jobRow[6],
          };
        }
        offers.push(offer);
      }
    }

    res.json({ offers });
  } catch (err) {
    console.error('[offers/mine]', err);
    res.status(500).json({ error: 'Failed to list your offers' });
  }
});

// GET /api/offers/received — list all offers received on jobs posted by the current seeker
router.get('/received', requireAuth, async (req, res) => {
  try {
    const db = await getDb();

    const userResult = db.exec('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (userResult[0].values[0][0] !== 'seeker') {
      return res.status(403).json({ error: 'Only seekers can view received offers' });
    }

    const result = db.exec(
      `SELECT o.* FROM offers o
       JOIN jobs j ON o.job_id = j.id
       WHERE j.seeker_id = ?
       ORDER BY o.created_at DESC`,
      [req.userId]
    );

    const offers = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        const providerRow = await getProviderInfo(row[2]);
        const offer = offerFromRow(row, providerRow);

        // Get job info
        const jobResult = db.exec('SELECT id, title, category, location, budget_min, budget_max, status FROM jobs WHERE id = ?', [row[1]]);
        if (jobResult.length > 0 && jobResult[0].values.length > 0) {
          const jobRow = jobResult[0].values[0];
          offer.job = {
            id: jobRow[0],
            title: jobRow[1],
            category: jobRow[2],
            area: jobRow[3],
            budgetMin: jobRow[4],
            budgetMax: jobRow[5],
            status: jobRow[6],
          };
        }
        offers.push(offer);
      }
    }

    res.json({ offers });
  } catch (err) {
    console.error('[offers/received]', err);
    res.status(500).json({ error: 'Failed to list received offers' });
  }
});

// GET /api/offers/:id — get offer with negotiation history
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const offer = await getOfferWithDetails(req.params.id);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    res.json(offer);
  } catch (err) {
    console.error('[offers/get]', err);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
});

// POST /api/offers/:id/accept — accept offer (seeker only)
router.post('/:id/accept', requireAuth, async (req, res) => {
  try {
    const offerId = req.params.id;
    const db = await getDb();

    // Get the offer
    const offerResult = db.exec('SELECT job_id, provider_id, status FROM offers WHERE id = ?', [offerId]);
    if (offerResult.length === 0 || offerResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const offerRow = offerResult[0].values[0];
    const jobId = offerRow[0];
    const providerId = offerRow[1];
    const currentStatus = offerRow[2];

    // Get the job to verify seeker
    const jobResult = db.exec('SELECT seeker_id FROM jobs WHERE id = ?', [jobId]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const seekerId = jobResult[0].values[0][0];

    if (seekerId !== req.userId) {
      return res.status(403).json({ error: 'Only the job seeker can accept offers' });
    }

    if (currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Only pending offers can be accepted' });
    }

    // Update this offer to accepted
    db.run(
      'UPDATE offers SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['accepted', offerId]
    );

    // Update job status to assigned
    db.run(
      'UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['assigned', jobId]
    );

    // Reject all other pending offers on this job
    db.run(
      'UPDATE offers SET status = ?, updated_at = datetime("now") WHERE job_id = ? AND id != ? AND status = ?',
      ['rejected', jobId, offerId, 'pending']
    );

    // Get job title for notification
    const jobTitleResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
    const jobTitle = jobTitleResult.length > 0 ? jobTitleResult[0].values[0][0] : 'your job';

    // Get provider info for notification
    const providerResult = db.exec('SELECT name FROM users WHERE id = ?', [providerId]);
    const providerName = providerResult.length > 0 ? providerResult[0].values[0][0] : 'The provider';

    // Get offer amount (before updating)
    const offerAmtResult = db.exec('SELECT amount FROM offers WHERE id = ?', [offerId]);
    const offerAmount = offerAmtResult.length > 0 ? offerAmtResult[0].values[0][0] : 0;

    // Notify accepted provider
    createNotification(db, providerId, 'offer_accepted',
      'Offer accepted! 🎉',
      `Your Rs. ${offerAmount.toLocaleString()} offer for "${jobTitle}" was accepted`,
      { jobId, offerId }
    );
    pushNotify(providerId, {
      title: 'Offer accepted! 🎉',
      body: `Your Rs. ${offerAmount.toLocaleString()} offer for "${jobTitle}" was accepted`,
      data: { type: 'offer_accepted', jobId, offerId },
    });

    // Reject all other pending offers and notify their providers
    const otherPending = db.exec(
      'SELECT provider_id FROM offers WHERE job_id = ? AND id != ? AND status = ?',
      [jobId, offerId, 'pending']
    );
    if (otherPending.length > 0) {
      for (const row of otherPending[0].values) {
        const otherProviderId = row[0];
        createNotification(db, otherProviderId, 'offer_rejected',
          'Offer not selected',
          `Your offer for "${jobTitle}" was not selected`,
          { jobId }
        );
        pushNotify(otherProviderId, {
          title: 'Offer not selected',
          body: `Your offer for "${jobTitle}" was not selected`,
          data: { type: 'offer_rejected', jobId },
        });
      }
    }

    // Auto-create conversation for this job if it doesn't already exist
    const existingConv = db.exec(
      'SELECT id FROM conversations WHERE job_id = ?',
      [jobId]
    );
    let conversationId = null;
    if (existingConv.length === 0 || existingConv[0].values.length === 0) {
      db.run('INSERT INTO conversations (job_id) VALUES (?)', [jobId]);
      const newConvResult = db.exec('SELECT last_insert_rowid()');
      conversationId = newConvResult[0].values[0][0];
      db.run(
        'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
        [conversationId, seekerId]
      );
      db.run(
        'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
        [conversationId, providerId]
      );
      // Store the conversation ID on the job
      db.run('UPDATE jobs SET conversation_id = ? WHERE id = ?', [conversationId, jobId]);
    } else {
      conversationId = existingConv[0].values[0][0];
    }

    save();

    res.json({ message: 'Offer accepted', status: 'accepted', conversationId: String(conversationId) });
  } catch (err) {
    console.error('[offers/accept]', err);
    res.status(500).json({ error: 'Failed to accept offer' });
  }
});

// POST /api/offers/:id/reject — reject offer (seeker only)
router.post('/:id/reject', requireAuth, async (req, res) => {
  try {
    const offerId = req.params.id;
    const db = await getDb();

    // Get the offer
    const offerResult = db.exec('SELECT job_id, status FROM offers WHERE id = ?', [offerId]);
    if (offerResult.length === 0 || offerResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const offerRow = offerResult[0].values[0];
    const jobId = offerRow[0];

    // Get the job to verify seeker
    const jobResult = db.exec('SELECT seeker_id FROM jobs WHERE id = ?', [jobId]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const seekerId = jobResult[0].values[0][0];

    if (seekerId !== req.userId) {
      return res.status(403).json({ error: 'Only the job seeker can reject offers' });
    }

    db.run(
      'UPDATE offers SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['rejected', offerId]
    );

    // Notify the provider their offer was rejected
    const offerInfo = db.exec('SELECT provider_id FROM offers WHERE id = ?', [offerId]);
    const jobTitleResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
    const jobTitle = jobTitleResult.length > 0 ? jobTitleResult[0].values[0][0] : 'your job';
    if (offerInfo.length > 0 && offerInfo[0].values.length > 0) {
      const providerId = offerInfo[0].values[0][0];
      createNotification(db, providerId, 'offer_rejected',
        'Offer not selected',
        `Your offer for "${jobTitle}" was not selected`,
        { jobId }
      );
      pushNotify(providerId, {
        title: 'Offer not selected',
        body: `Your offer for "${jobTitle}" was not selected`,
        data: { type: 'offer_rejected', jobId },
      });
    }

    save();

    res.json({ message: 'Offer rejected', status: 'rejected' });
  } catch (err) {
    console.error('[offers/reject]', err);
    res.status(500).json({ error: 'Failed to reject offer' });
  }
});

// POST /api/offers/:id/withdraw — withdraw offer (provider only)
router.post('/:id/withdraw', requireAuth, async (req, res) => {
  try {
    const offerId = req.params.id;
    const db = await getDb();

    const offerResult = db.exec('SELECT provider_id, status FROM offers WHERE id = ?', [offerId]);
    if (offerResult.length === 0 || offerResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const offerRow = offerResult[0].values[0];
    const providerId = offerRow[0];
    const currentStatus = offerRow[1];

    if (providerId !== req.userId) {
      return res.status(403).json({ error: 'Only the provider can withdraw this offer' });
    }
    if (currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Only pending offers can be withdrawn' });
    }

    db.run(
      'UPDATE offers SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['withdrawn', offerId]
    );

    res.json({ message: 'Offer withdrawn', status: 'withdrawn' });
  } catch (err) {
    console.error('[offers/withdraw]', err);
    res.status(500).json({ error: 'Failed to withdraw offer' });
  }
});

// POST /api/offers/:id/counter — counter-offer (seeker only)
router.post('/:id/counter', requireAuth, sanitize('message'), validate(updateOffer), async (req, res) => {
  try {
    const { price, message } = res.locals.parsedBody;

    const offerId = req.params.id;
    const db = await getDb();

    // Get the offer
    const offerResult = db.exec('SELECT job_id, provider_id, status FROM offers WHERE id = ?', [offerId]);
    if (offerResult.length === 0 || offerResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const offerRow = offerResult[0].values[0];
    const jobId = offerRow[0];
    const providerId = offerRow[1];
    const currentStatus = offerRow[2];

    if (currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Only pending offers can be countered' });
    }

    // Get the job to verify seeker
    const jobResult = db.exec('SELECT seeker_id FROM jobs WHERE id = ?', [jobId]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const seekerId = jobResult[0].values[0][0];

    if (seekerId !== req.userId) {
      return res.status(403).json({ error: 'Only the job seeker can make a counter-offer' });
    }

    // Update original offer status to countered
    db.run(
      'UPDATE offers SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['countered', offerId]
    );

    // Insert into negotiations
    db.run(
      'INSERT INTO negotiations (job_id, provider_id, seeker_id, proposed_amount, status) VALUES (?, ?, ?, ?, ?)',
      [jobId, providerId, seekerId, price, 'open']
    );

    const negId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    // Return the new negotiation as a counter-offer
    const negResult = db.exec('SELECT * FROM negotiations WHERE id = ?', [negId]);
    const negRow = negResult[0].values[0];
    const negotiation = negotiationFromRow(negRow);

    // Build a response object similar to an offer
    const counterOffer = {
      id: negId,
      jobId: parseInt(jobId),
      providerId: String(providerId),
      price: parseFloat(price),
      message: message || null,
      status: 'pending',
      createdAt: negRow[6],
      updatedAt: negRow[7],
      isCounter: true,
      originalOfferId: parseInt(offerId),
      negotiations: [negotiation],
    };

    // Add provider info
    const providerRow = await getProviderInfo(providerId);
    if (providerRow) {
      counterOffer.providerName = providerRow[1];
      counterOffer.providerAvatar = providerRow[6] || null;
      counterOffer.providerRating = providerRow[7] ?? null;
      counterOffer.providerCompletionRate = null;
      counterOffer.providerVerified = providerRow[9] === 1;
    }

    res.status(201).json(counterOffer);
  } catch (err) {
    console.error('[offers/counter]', err);
    res.status(500).json({ error: 'Failed to create counter-offer' });
  }
});

// GET /api/offers/job/:jobId — list offers for a job
router.get('/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const db = await getDb();

    const result = db.exec(
      'SELECT * FROM offers WHERE job_id = ? ORDER BY created_at ASC',
      [jobId]
    );

    const offers = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        const providerRow = await getProviderInfo(row[2]);
        offers.push(offerFromRow(row, providerRow));
      }
    }

    res.json({ offers });
  } catch (err) {
    console.error('[offers/job]', err);
    res.status(500).json({ error: 'Failed to list offers' });
  }
});

module.exports = router;
