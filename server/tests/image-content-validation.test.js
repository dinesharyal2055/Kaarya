/**
 * Content (magic-byte) validation for image uploads.
 *
 * Upload routes accept JPEG/PNG/WebP but must not trust the client-declared
 * MIME type alone. These tests pin storage.sniffImageMime / validateImageContent:
 *   - real signatures are detected
 *   - mismatched declared types are rejected
 *   - garbage / non-image payloads are rejected
 */
const storage = require('../src/storage');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('rest of jpeg')]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('rest of png'),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from('VP8 rest'),
]);

describe('sniffImageMime', () => {
  test('detects JPEG', () => {
    expect(storage.sniffImageMime(JPEG)).toBe('image/jpeg');
  });

  test('detects PNG', () => {
    expect(storage.sniffImageMime(PNG)).toBe('image/png');
  });

  test('detects WebP', () => {
    expect(storage.sniffImageMime(WEBP)).toBe('image/webp');
  });

  test('returns null for non-image / garbage buffers', () => {
    expect(storage.sniffImageMime(Buffer.from('hello world'))).toBeNull();
    expect(storage.sniffImageMime(Buffer.alloc(64, 0x00))).toBeNull();
    expect(storage.sniffImageMime(Buffer.from('RIFF........WEBP'))).toBeNull();
  });

  test('returns null for buffers too small to hold a signature', () => {
    expect(storage.sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(storage.sniffImageMime(Buffer.from(''))).toBeNull();
  });

  test('returns null for a PNG signature shorter than the full 8 bytes', () => {
    const short = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    expect(storage.sniffImageMime(short)).toBeNull();
  });
});

describe('validateImageContent', () => {
  test('accepts JPEG bytes declared as image/jpeg', () => {
    expect(storage.validateImageContent(JPEG, 'image/jpeg')).toBe(true);
  });

  test('accepts PNG bytes declared as image/png', () => {
    expect(storage.validateImageContent(PNG, 'image/png')).toBe(true);
  });

  test('accepts WebP bytes declared as image/webp', () => {
    expect(storage.validateImageContent(WEBP, 'image/webp')).toBe(true);
  });

  test('rejects mismatched declared type vs actual bytes', () => {
    expect(storage.validateImageContent(JPEG, 'image/png')).toBe(false);
    expect(storage.validateImageContent(PNG, 'image/webp')).toBe(false);
    expect(storage.validateImageContent(WEBP, 'image/jpeg')).toBe(false);
  });

  test('rejects non-image bytes even if the declared type is allowed', () => {
    expect(storage.validateImageContent(Buffer.from('<html>...</html>'), 'image/jpeg')).toBe(false);
    expect(storage.validateImageContent(Buffer.alloc(8), 'image/png')).toBe(false);
  });

  test('rejects untyped payloads for any declared type', () => {
    expect(storage.validateImageContent(Buffer.from('plaintext'), 'image/webp')).toBe(false);
  });
});