const test = require('node:test');
const assert = require('node:assert/strict');

const security = require('../netlify/functions/_security');

function event(overrides = {}) {
  return {
    httpMethod: 'POST',
    headers: {},
    body: '{}',
    ...overrides
  };
}

test.beforeEach(() => security.resetRateLimits());
test.after(() => security.resetRateLimits());

test('rejects an untrusted cross-origin request', () => {
  const response = security.guardRequest(event({
    headers: {
      origin: 'https://evil.example',
      host: 'cinocode.example',
      'x-forwarded-proto': 'https'
    }
  }), { namespace: 'test' });

  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, 'origin_not_allowed');
  assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
});

test('reflects the same-site origin without a wildcard', () => {
  const request = event({
    headers: {
      origin: 'https://cinocode.example',
      host: 'cinocode.example',
      'x-forwarded-proto': 'https'
    }
  });

  assert.equal(security.guardRequest(request, { namespace: 'test' }), null);
  assert.equal(security.buildSecurityHeaders(request)['Access-Control-Allow-Origin'], 'https://cinocode.example');
});

test('allows local development origins', () => {
  const request = event({ headers: { origin: 'http://localhost:8888' } });
  assert.equal(security.guardRequest(request, { namespace: 'test' }), null);
  assert.equal(security.buildSecurityHeaders(request)['Access-Control-Allow-Origin'], 'http://localhost:8888');
});

test('rejects oversized bodies before handler parsing', () => {
  const response = security.guardRequest(event({ body: '123456' }), {
    namespace: 'test',
    maxBodyBytes: 5
  });

  assert.equal(response.statusCode, 413);
  assert.equal(JSON.parse(response.body).error, 'request_too_large');
});

test('rate limits requests with a stable Netlify client IP', () => {
  const request = event({ headers: { 'x-nf-client-connection-ip': '203.0.113.5' } });
  const options = { namespace: 'test', rateLimit: 2, windowMs: 60000 };

  assert.equal(security.guardRequest(request, options), null);
  assert.equal(security.guardRequest(request, options), null);
  const response = security.guardRequest(request, options);

  assert.equal(response.statusCode, 429);
  assert.equal(JSON.parse(response.body).error, 'rate_limited');
  assert.ok(Number(response.headers['Retry-After']) >= 1);
});

test('answers allowed preflight requests with strict CORS headers', () => {
  const response = security.guardRequest(event({
    httpMethod: 'OPTIONS',
    headers: { origin: 'http://127.0.0.1:8000' }
  }), { namespace: 'test' });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['Access-Control-Allow-Origin'], 'http://127.0.0.1:8000');
  assert.equal(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});

test('public functions no longer emit wildcard CORS headers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const name of ['ai-chat.js', 'generate-image.js', 'web-search.js', 'auth-config.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', name), 'utf8');
    assert.doesNotMatch(source, /Access-Control-Allow-Origin['"]?\s*:\s*['"]\*['"]/);
    assert.match(source, /guardRequest\(event/);
  }
});
