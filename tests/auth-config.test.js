const test = require('node:test');
const assert = require('node:assert/strict');

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const modulePath = require.resolve('../netlify/functions/auth-config');

function loadHandler() {
  delete require.cache[modulePath];
  return require('../netlify/functions/auth-config').handler;
}

function event(overrides = {}) {
  return {
    httpMethod: 'POST',
    body: '{}',
    headers: {
      origin: 'http://localhost:8899',
      host: 'localhost:8899',
      'x-forwarded-proto': 'http',
      'x-nf-client-connection-ip': '127.0.0.20'
    },
    ...overrides
  };
}

test.afterEach(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});

test('auth config only accepts POST', async () => {
  const response = await loadHandler()(event({ httpMethod: 'GET' }));
  assert.equal(response.statusCode, 405);
});

test('auth config reports missing public settings without leaking values', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  const response = await loadHandler()(event());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.configured, false);
  assert.equal(body.supabaseUrl, '');
  assert.equal(body.publishableKey, '');
  assert.deepEqual(body.missing.sort(), ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_URL']);
});

test('auth config returns only browser-safe Supabase settings', async () => {
  process.env.SUPABASE_URL = 'https://example-project.supabase.co/';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_public_key_123456789';
  const response = await loadHandler()(event());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.configured, true);
  assert.equal(body.supabaseUrl, 'https://example-project.supabase.co');
  assert.equal(body.publishableKey, process.env.SUPABASE_PUBLISHABLE_KEY);
  assert.deepEqual(body.missing, []);
  assert.equal(JSON.stringify(body).includes('service_role'), false);
});

test('auth config rejects untrusted origins', async () => {
  const response = await loadHandler()(event({
    headers: {
      origin: 'https://attacker.example',
      host: 'cinocode.example',
      'x-forwarded-proto': 'https',
      'x-nf-client-connection-ip': '198.51.100.10'
    }
  }));
  assert.equal(response.statusCode, 403);
});
