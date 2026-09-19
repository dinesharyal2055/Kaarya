/**
 * Expo push service send behavior — contract for the corrected pipeline:
 *   - pushes go to the Expo push API (https://exp.host/--/api/v2/push/send),
 *     never to Firebase messaging directly
 *   - non-Expo tokens are ignored without network calls
 *   - tokens Expo reports as DeviceNotRegistered are removed from the store
 *   - other/permanent-infra failures do NOT purge tokens
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const jwt = require('jsonwebtoken');

require('dotenv').config();

const ORIGINAL_FETCH = global.fetch;

const fcm = require('../src/fcm');
const { getDb, save } = require('../src/db');

const USER_ID = 13001;
const TOKEN = 'ExpoPushToken[testTokenAbc123]';
const PAYLOAD = { title: 'Test title', body: 'Test body', data: { type: 'new_offer', jobId: '5' } };

function mockFetchResponse(status, body) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

async function tokenCount() {
  const db = await getDb();
  const result = db.exec('SELECT token FROM fcm_tokens WHERE user_id = ?', [USER_ID]);
  return result.length > 0 ? result[0].values.length : 0;
}

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM fcm_tokens WHERE user_id = ?', [USER_ID]);
  save();
}

beforeEach(async () => {
  await resetFixture();
  process.env.EXPO_ACCESS_TOKEN = 'test-access-token';
  global.fetch = jest.fn();
});

afterAll(() => {
  delete process.env.EXPO_ACCESS_TOKEN;
  global.fetch = ORIGINAL_FETCH;
});

describe('sendPushNotification (Expo push service)', () => {
  test('sends an Expo push message with the correct endpoint, auth, and payload', async () => {
    await fcm.storeToken(USER_ID, TOKEN);
    global.fetch = mockFetchResponse(201, [{ status: 'ok', id: 'ticket-1' }]);

    const ok = await fcm.sendPushNotification(TOKEN, PAYLOAD);

    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://exp.host/--/api/v2/push/send');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-access-token');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual([{
      to: TOKEN,
      title: 'Test title',
      body: 'Test body',
      sound: 'default',
      badge: 1,
      priority: 'high',
      channelId: 'kaarya_default',
      data: { type: 'new_offer', jobId: '5' },
    }]);
    // No purge on success
    expect(await tokenCount()).toBe(1);
  });

  test('skips non-Expo tokens without any network call', async () => {
    const ok = await fcm.sendPushNotification('some-native-fcm-token', PAYLOAD);
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('skips sending when no EXPO_ACCESS_TOKEN is configured', async () => {
    delete process.env.EXPO_ACCESS_TOKEN;
    const ok = await fcm.sendPushNotification(TOKEN, PAYLOAD);
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('removes a token Expo reports as DeviceNotRegistered', async () => {
    await fcm.storeToken(USER_ID, TOKEN);
    global.fetch = mockFetchResponse(200, [{
      status: 'error',
      message: '"ExpoPushToken[testTokenAbc123]" is not a registered push notification recipient',
      details: { error: 'DeviceNotRegistered' },
    }]);

    const ok = await fcm.sendPushNotification(TOKEN, PAYLOAD);

    expect(ok).toBe(false);
    expect(await tokenCount()).toBe(0);
  });

  test('keeps the token for other message-level Expo errors', async () => {
    await fcm.storeToken(USER_ID, TOKEN);
    global.fetch = mockFetchResponse(200, [{
      status: 'error',
      message: 'Message too big',
      details: { error: 'MessageTooBig' },
    }]);

    const ok = await fcm.sendPushNotification(TOKEN, PAYLOAD);

    expect(ok).toBe(false);
    expect(await tokenCount()).toBe(1);
  });

  test('does not purge tokens when authorization is rejected', async () => {
    await fcm.storeToken(USER_ID, TOKEN);
    global.fetch = mockFetchResponse(401, { errors: [{ code: 'UNAUTHORIZED' }] });

    const ok = await fcm.sendPushNotification(TOKEN, PAYLOAD);

    expect(ok).toBe(false);
    expect(await tokenCount()).toBe(1);
  });
});