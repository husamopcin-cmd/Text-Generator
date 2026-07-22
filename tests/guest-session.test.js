'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resetRateLimits } = require('../netlify/functions/_security');

const MODULE_PATH = require.resolve('../netlify/functions/guest-session');
const DEVICE_ID = 'device_1234567890abcdef';
const GUEST_SECRET = 'g'.repeat(32);

function event(body, ip = '203.0.113.10') {
  return {
    httpMethod: 'POST',
    headers: { 'x-nf-client-connection-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

async function withHandler(environment, fetchImpl, callback) {
  const originalFetch = global.fetch;
  const previous = {};
  for (const [key, value] of Object.entries(environment)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = fetchImpl;
  resetRateLimits();
  delete require.cache[MODULE_PATH];

  try {
    await callback(require(MODULE_PATH).handler);
  } finally {
    global.fetch = originalFetch;
    delete require.cache[MODULE_PATH];
    resetRateLimits();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('guest session rejects malformed input before verification', async () => {
  await withHandler({}, async () => assert.fail('fetch must not run'), async handler => {
    const response = await handler(event({ turnstileToken: 'token', deviceId: 'short' }));
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error, 'invalid_guest_request');
  });
});

test('guest session fails closed when secrets are missing', async () => {
  await withHandler({ TURNSTILE_SECRET_KEY: undefined, CINOCODE_GUEST_TOKEN_SECRET: undefined },
    async () => assert.fail('fetch must not run'), async handler => {
      const response = await handler(event({ turnstileToken: 'token', deviceId: DEVICE_ID }));
      assert.equal(response.statusCode, 503);
      assert.equal(JSON.parse(response.body).error, 'guest_access_not_configured');
    });
});

test('guest session rejects a Turnstile result with the wrong action', async () => {
  await withHandler({ TURNSTILE_SECRET_KEY: 'turnstile-secret', CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET },
    async () => ({ ok: true, json: async () => ({ success: true, action: 'other-action' }) }),
    async handler => {
      const response = await handler(event({ turnstileToken: 'token', deviceId: DEVICE_ID }));
      assert.equal(response.statusCode, 401);
      assert.equal(JSON.parse(response.body).error, 'turnstile_verification_failed');
    });
});

test('guest session returns a bound token without exposing secrets', async () => {
  let verificationRequest;
  await withHandler({ TURNSTILE_SECRET_KEY: 'turnstile-secret', CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET },
    async (url, options) => {
      verificationRequest = { url, options };
      return { ok: true, json: async () => ({ success: true, action: 'cinocode-guest' }) };
    }, async handler => {
      const response = await handler(event({ turnstileToken: 'challenge-token', deviceId: DEVICE_ID }));
      const body = JSON.parse(response.body);
      assert.equal(response.statusCode, 200);
      assert.equal(body.ok, true);
      assert.equal(body.expiresIn, 12 * 60 * 60);
      assert.match(body.guestToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      assert.doesNotMatch(response.body, /turnstile-secret|gggggggg/);
      assert.equal(verificationRequest.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.match(verificationRequest.options.body, /response=challenge-token/);
      assert.match(verificationRequest.options.body, /remoteip=203\.0\.113\.10/);
    });
});

test('guest session rate limits repeated attempts before Turnstile verification', async () => {
  let calls = 0;
  await withHandler({ TURNSTILE_SECRET_KEY: 'turnstile-secret', CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET },
    async () => {
      calls += 1;
      return { ok: true, json: async () => ({ success: false }) };
    }, async handler => {
      let response;
      for (let index = 0; index < 11; index += 1) {
        response = await handler(event({ turnstileToken: 'token', deviceId: DEVICE_ID }));
      }
      assert.equal(response.statusCode, 429);
      assert.equal(JSON.parse(response.body).error, 'rate_limited');
      assert.equal(calls, 10);
    });
});
