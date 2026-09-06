/**
 * XSS sanitization middleware — strips HTML/JS from user-controlled text fields.
 *
 * Usage: apply sanitize() as route-level middleware, passing a list of fields
 * from req.body to sanitize:
 *
 *   router.put('/profile', requireAuth, validate(updateProfile), sanitize('name', 'bio'), async (req, res) => { ... });
 *
 * Each listed field has all HTML tags and script-like content removed from its value.
 * The sanitized value replaces req.body[field] before the handler runs.
 */

'use strict';

const sanitizeHtml = require('sanitize-html');

// Allowed tags — plain-text fields get none (strip all markup).
// chat messages and comments allow newlines and basic inline formatting.
const PLAIN_OPTIONS = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'escape',
};

const CHAT_OPTIONS = {
  allowedTags: ['b', 'i', 'em', 'strong', 'br'],
  allowedAttributes: {},
  disallowedTagsMode: 'escape',
};

/**
 * Strip HTML/script content from a single value.
 * @param {unknown} value
 * @param {boolean} allowFormatting - allow b, i, em, strong, br
 * @returns {string}
 */
function sanitizeValue(value, allowFormatting = false) {
  if (value == null) return value;
  const str = String(value);
  if (str.trim() === '') return str;
  return sanitizeHtml(str, allowFormatting ? CHAT_OPTIONS : PLAIN_OPTIONS);
}

/**
 * Express middleware factory.
 * Returns middleware that sanitizes the named req.body fields in-place.
 * @param  {...string} fields - req.body field names to sanitize
 */
function sanitize(...fields) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') return next();
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        req.body[field] = sanitizeValue(req.body[field], false);
      }
    }
    next();
  };
}

module.exports = { sanitize, sanitizeValue };
