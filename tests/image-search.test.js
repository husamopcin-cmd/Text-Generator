const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/image-search');

function parseBody(response) {
  return JSON.parse(response.body);
}

async function withFetch(fetchImpl, run) {
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test('image search rejects GET requests', async () => {
  const response = await handler({ httpMethod: 'GET' });
  assert.equal(response.statusCode, 405);
});

test('image search rejects an empty query without network access', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: '{}' });
    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'missing_query');
  });
});

test('image search maps Openverse results and drops unsafe URLs', async () => {
  let requestedUrl = '';
  await withFetch(async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        results: [
          {
            id: 'one',
            title: 'Castle',
            thumbnail: 'https://images.example.test/castle-thumb.jpg',
            url: 'https://images.example.test/castle.jpg',
            foreign_landing_url: 'https://source.example.test/castle',
            creator: 'Ada',
            license: 'cc0'
          },
          {
            id: 'unsafe',
            thumbnail: 'javascript:alert(1)',
            foreign_landing_url: 'https://source.example.test/unsafe'
          }
        ]
      })
    };
  }, async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ query: 'fantasy castle' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 1);
    assert.equal(body.images[0].title, 'Castle');
    const url = new URL(requestedUrl);
    assert.equal(url.origin + url.pathname, 'https://api.openverse.org/v1/images/');
    assert.equal(url.searchParams.get('q'), 'fantasy castle');
    assert.equal(url.searchParams.get('page_size'), '8');
    assert.equal(url.searchParams.get('mature'), 'false');
  });
});

test('image search returns a controlled upstream failure', async () => {
  await withFetch(async () => ({
    ok: false,
    status: 429,
    text: async () => 'rate limited'
  }), async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ query: 'city' })
    });
    assert.equal(response.statusCode, 502);
    assert.equal(parseBody(response).error, 'rate_limited');
  });
});
