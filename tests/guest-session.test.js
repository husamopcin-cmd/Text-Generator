'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resetRateLimits } = require('../netlify/functions/_security');

const MODULE_PATH = require.resolve('../netlify/functions/guest-session');
const DEVICE_ID = 'device_1234567890abcdef';
const GUEST_SECRET = 'g'.repeat(32);

function event(body, ip = '203.0.113.10', host = 'cinocode.example') {
  return {
    httpMethod: 'POST',
    headers: { host, 'x-nf-client-connection-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

async function withHandler(environment, fetchImpl, callback) {
  const originalFetch = global.fetch;
  const controlledEnvironment = { NETLIFY_DEV: undefined, ...environment };
  const previous = {};
  for (const [key, value] of Object.entries(controlledEnvironment)) {
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

test('guest session bypasses Turnstile only for a loopback Netlify dev request', async () => {
  await withHandler({
    NETLIFY_DEV: 'true',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET
  }, async () => assert.fail('Turnstile fetch must not run for trusted local dev'), async handler => {
    const response = await handler(event(
      { turnstileToken: 'netlify-dev-local-bypass', deviceId: DEVICE_ID },
      '127.0.0.1',
      'localhost:8888'
    ));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).ok, true);
  });
});

test('NETLIFY_DEV cannot bypass Turnstile for a non-loopback request', async () => {
  let verificationCalls = 0;
  await withHandler({
    NETLIFY_DEV: 'true',
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET
  }, async () => {
    verificationCalls += 1;
    return { ok: true, json: async () => ({ success: false }) };
  }, async handler => {
    const response = await handler(event(
      { turnstileToken: 'netlify-dev-local-bypass', deviceId: DEVICE_ID },
      '198.51.100.20',
      'cinocode.example'
    ));
    assert.equal(response.statusCode, 401);
    assert.equal(verificationCalls, 1);
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

test('guest session temporarily limits rapid device rotation before running another Turnstile challenge', async () => {
  const accessEnvironment = {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET,
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'p'.repeat(24),
    SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(24),
    CINOCODE_QUOTA_HASH_SECRET: 'q'.repeat(32)
  };
  await withHandler(accessEnvironment, async (url) => {
    assert.ok(url.endsWith('/rest/v1/rpc/record_cinocode_guest_abuse'));
    return { ok: true, json: async () => [{ limited: true, retry_after: 720, reset_at: 'tomorrow' }] };
  }, async handler => {
    const response = await handler(event({ turnstileToken: 'challenge-token', deviceId: DEVICE_ID }));
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 429);
    assert.equal(body.error, 'guest_session_temporarily_limited');
    assert.match(body.message, /bekle veya hesabınla giriş yap/);
    assert.equal(response.headers['Retry-After'], '720');
  });
});

test('guest session temporarily limits repeated failed Turnstile verifications', async () => {
  const accessEnvironment = {
    TURNSTILE_SECRET_KEY: 'turnstile-secret',
    CINOCODE_GUEST_TOKEN_SECRET: GUEST_SECRET,
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'p'.repeat(24),
    SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(24),
    CINOCODE_QUOTA_HASH_SECRET: 'q'.repeat(32)
  };
  const calls = [];
  await withHandler(accessEnvironment, async (url) => {
    calls.push(url);
    if (url.endsWith('/rest/v1/rpc/record_cinocode_guest_abuse')) {
      const isFailureEvent = calls.filter(call => call.endsWith('/rest/v1/rpc/record_cinocode_guest_abuse')).length === 2;
      return {
        ok: true,
        json: async () => [{ limited: isFailureEvent, retry_after: 540, reset_at: 'tomorrow' }]
      };
    }
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    return { ok: true, json: async () => ({ success: false, action: 'cinocode-guest' }) };
  }, async handler => {
    const response = await handler(event({ turnstileToken: 'challenge-token', deviceId: DEVICE_ID }));
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 429);
    assert.equal(body.error, 'guest_session_temporarily_limited');
    assert.equal(response.headers['Retry-After'], '540');
    assert.deepEqual(calls, [
      'https://project.supabase.co/rest/v1/rpc/record_cinocode_guest_abuse',
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      'https://project.supabase.co/rest/v1/rpc/record_cinocode_guest_abuse'
    ]);
  });
});
