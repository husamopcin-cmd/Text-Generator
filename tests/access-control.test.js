const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const access = require('../netlify/functions/_access-control');

const originalFetch = global.fetch;
const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CINOCODE_GUEST_TOKEN_SECRET',
  'CINOCODE_QUOTA_HASH_SECRET',
  'CINOCODE_ANON_DAILY_CHAT_LIMIT',
  'CINOCODE_AUTH_DAILY_IMAGE_LIMIT',
  'NODE_ENV',
  'CINOCODE_TEST_ACCESS_BYPASS'
];
const originalEnv = new Map(ENV_KEYS.map(key => [key, process.env[key]]));

function configure() {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_12345678901234567890';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-12345678901234567890';
  process.env.CINOCODE_GUEST_TOKEN_SECRET = 'g'.repeat(32);
  process.env.CINOCODE_QUOTA_HASH_SECRET = 'q'.repeat(32);
  delete process.env.NODE_ENV;
  delete process.env.CINOCODE_TEST_ACCESS_BYPASS;
}

function event(headers = {}) {
  return {
    httpMethod: 'POST',
    body: '{}',
    headers: {
      origin: 'https://cinocode.example',
      host: 'cinocode.example',
      'x-forwarded-proto': 'https',
      'x-nf-client-connection-ip': '203.0.113.8',
      ...headers
    }
  };
}

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('guest tokens are signed, device-bound and expire after twelve hours', () => {
  const secret = 's'.repeat(32);
  const issuedAt = 1_700_000_000;
  const token = access.createGuestToken('device_1234567890', secret, issuedAt);
  assert.ok(token.includes('.'));
  assert.ok(access.verifyGuestToken(token, 'device_1234567890', secret, issuedAt + 60));
  assert.equal(access.verifyGuestToken(token, 'other_device_1234', secret, issuedAt + 60), null);
  assert.equal(access.verifyGuestToken(token, 'device_1234567890', secret, issuedAt + access.GUEST_TOKEN_TTL_SECONDS), null);
});

test('quota migration denies the request when the atomic increment cannot run', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '..', 'supabase', 'migrations', '202607220001_cinocode_usage_quotas.sql'
  ), 'utf8');
  assert.match(migration, /where public\.cinocode_usage_quotas\.request_count < p_limit/);
  assert.match(migration, /if current_count is null then\s+quota_allowed := false;/);
  assert.match(migration, /return query select\s+quota_allowed,/);
  assert.match(migration, /grant execute on function[\s\S]+to service_role/);
});

test('quota defaults and environment overrides stay bounded', () => {
  assert.equal(access.getQuotaLimit('anonymous', 'chat'), 20);
  assert.equal(access.getQuotaLimit('authenticated', 'image'), 10);
  process.env.CINOCODE_ANON_DAILY_CHAT_LIMIT = '25';
  process.env.CINOCODE_AUTH_DAILY_IMAGE_LIMIT = '-1';
  assert.equal(access.getQuotaLimit('anonymous', 'chat'), 25);
  assert.equal(access.getQuotaLimit('authenticated', 'image'), 10);
});

test('access control fails closed when server-side configuration is missing', async () => {
  for (const key of ENV_KEYS) delete process.env[key];
  const result = await access.authorizeUsage(event(), 'chat');
  assert.equal(result.ok, false);
  assert.equal(result.response.statusCode, 503);
  assert.equal(JSON.parse(result.response.body).error, 'access_control_not_configured');
});

test('authenticated access validates Supabase user then consumes an atomic quota', async () => {
  configure();
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer valid-user-token');
      return { ok: true, json: async () => ({ id: 'user-123' }) };
    }
    assert.ok(url.endsWith('/rest/v1/rpc/consume_cinocode_quota'));
    return {
      ok: true,
      json: async () => [{ allowed: true, used: 4, remaining: 96, reset_at: '2026-07-23T00:00:00Z' }]
    };
  };

  const result = await access.authorizeUsage(event({ authorization: 'Bearer valid-user-token' }), 'chat');
  assert.equal(result.ok, true);
  assert.deepEqual(result.principal, { type: 'authenticated', id: 'user-123' });
  assert.equal(result.quota.limit, 100);
  assert.equal(result.quota.remaining, 96);
  assert.equal(calls.length, 2);
});

test('anonymous access requires a valid device-bound guest token and applies the low quota', async () => {
  configure();
  const deviceId = 'device_1234567890';
  const token = access.createGuestToken(deviceId, process.env.CINOCODE_GUEST_TOKEN_SECRET);
  global.fetch = async (url, options) => {
    assert.ok(url.endsWith('/rest/v1/rpc/consume_cinocode_quota'));
    const body = JSON.parse(options.body);
    assert.equal(body.p_limit, 3);
    assert.equal(body.p_usage_kind, 'image');
    assert.match(body.p_identity_hash, /^[a-f0-9]{64}$/);
    return { ok: true, json: async () => [{ allowed: true, used: 1, remaining: 2, reset_at: 'tomorrow' }] };
  };

  const result = await access.authorizeUsage(event({
    'x-cinocode-device-id': deviceId,
    'x-cinocode-guest-token': token
  }), 'image');
  assert.equal(result.ok, true);
  assert.equal(result.principal.type, 'anonymous');
  assert.equal(result.quota.limit, 3);
});

test('invalid guest token is rejected before the quota service is called', async () => {
  configure();
  global.fetch = async () => assert.fail('quota service must not be called');
  const result = await access.authorizeUsage(event({
    'x-cinocode-device-id': 'device_1234567890',
    'x-cinocode-guest-token': 'invalid.token'
  }), 'chat');
  assert.equal(result.response.statusCode, 401);
  assert.equal(JSON.parse(result.response.body).error, 'guest_session_required');
});

test('quota denial returns 429 without exposing the identity hash', async () => {
  configure();
  global.fetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-123' }) };
    return { ok: true, json: async () => [{ allowed: false, used: 100, remaining: 0, reset_at: 'tomorrow' }] };
  };
  const result = await access.authorizeUsage(event({ authorization: 'Bearer valid-user-token' }), 'chat');
  const body = JSON.parse(result.response.body);
  assert.equal(result.response.statusCode, 429);
  assert.equal(body.error, 'daily_quota_exceeded');
  assert.equal(body.limit, 100);
  assert.equal(JSON.stringify(body).includes('identity'), false);
});

test('quota backend failures are fail-closed', async () => {
  configure();
  global.fetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-123' }) };
    throw new Error('database unavailable');
  };
  const result = await access.authorizeUsage(event({ authorization: 'Bearer valid-user-token' }), 'chat');
  assert.equal(result.response.statusCode, 503);
  assert.equal(JSON.parse(result.response.body).error, 'quota_service_unavailable');
});
