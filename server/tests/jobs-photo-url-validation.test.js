/**
 * Job photo URL validation — regression test for the "Invalid photo URL"
 * blocker on task posting.
 *
 * The job schema requires ABSOLUTE http(s) URLs (z.string().url()). The
 * mobile client previously stored the upload endpoint's relative path
 * (/uploads/jobs/...) verbatim, which always failed validation. The client
 * fix absolutizes the URL before createJob/updateJob; these tests lock the
 * server contract so the guard is never silently weakened.
 */
const { createJob, updateJob } = require('../src/middleware/validate');

const BASE = {
  title: 'Fix leaking kitchen tap',
  description: 'The kitchen tap is leaking and needs replacing as soon as possible.',
  category: 'plumbing',
  location: 'Tokha',
};

describe('job photo URL validation', () => {
  test('createJob rejects a relative photo URL', () => {
    const res = createJob.safeParse({ ...BASE, photoUrls: ['/uploads/jobs/img.jpg'] });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].message).toBe('Invalid photo URL');
  });

  test('createJob rejects a scheme-less photo URL', () => {
    const res = createJob.safeParse({ ...BASE, photoUrls: ['www.example.com/img.jpg'] });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].message).toBe('Invalid photo URL');
  });

  test('createJob accepts an absolute https photo URL', () => {
    const res = createJob.safeParse({
      ...BASE,
      photoUrls: ['https://kaarya-4qft.onrender.com/uploads/jobs/img.jpg'],
    });
    expect(res.success).toBe(true);
  });

  test('createJob accepts absolute http photo URLs (local dev server)', () => {
    const res = createJob.safeParse({
      ...BASE,
      photoUrls: ['http://192.168.1.79:5000/uploads/jobs/img.jpg', 'http://localhost:5000/uploads/jobs/img2.jpg'],
    });
    expect(res.success).toBe(true);
  });

  test('updateJob applies the same URL guard', () => {
    const res = updateJob.safeParse({ photoUrls: ['/uploads/jobs/img.jpg'] });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].message).toBe('Invalid photo URL');
  });
});