'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handler, _test } = require('../netlify/functions/web-search');

async function withFetch(fetchImpl, run) {
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try { return await run(); } finally { global.fetch = originalFetch; }
}

test('web search rejects unsupported methods and invalid queries', async () => {
  assert.equal((await handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.equal((await handler({ httpMethod: 'POST', body: '{}' })).statusCode, 400);
  assert.equal((await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'x'.repeat(501) }) })).statusCode, 413);
});

test('web search returns sanitized titles, snippets and destination URLs', async () => {
  const html = '<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Farticle%3Fa%3D1">Test &amp; title</a><a class="result__snippet">A <b>useful</b> snippet &amp; context</a><a class="result__a" href="javascript:alert(1)">Unsafe</a><a class="result__snippet">Must not be returned</a>';
  await withFetch(async () => ({ ok: true, text: async () => html }), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'test query' }) });
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(body.results, [{ title: 'Test & title', snippet: 'A useful snippet & context', url: 'https://example.com/article?a=1' }]);
  });
});

test('web search exposes a controlled upstream failure', async () => {
  await withFetch(async () => ({ ok: false, status: 503, text: async () => '' }), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'test' }) });
    assert.equal(response.statusCode, 502);
    assert.equal(JSON.parse(response.body).error, 'provider_error');
  });
});

test('web search parser drops non-http result URLs', () => assert.equal(_test.safeResultUrl('javascript:alert(1)'), ''));
