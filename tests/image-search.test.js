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

// ─── Openverse query URL sent to upstream ───────────────────────────────────
// Helper: succeed with one safe result for regression checks.
function makeOpenverseSuccess(results) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ results: results || [] })
  });
}

const SAFE_RESULT = {
  id: 'r1',
  title: 'Mountain Lake',
  thumbnail: 'https://img.example.test/lake-thumb.jpg',
  url: 'https://img.example.test/lake.jpg',
  foreign_landing_url: 'https://source.example.test/lake',
  creator: 'TestCreator',
  license: 'cc-by',
  attribution: 'Mountain Lake by TestCreator (CC BY)'
};

// ─── Query sanitization ──────────────────────────────────────────────────────

test('query sanitization: leading and trailing whitespace is stripped', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    await handler({ httpMethod: 'POST', body: JSON.stringify({ query: '  elma  ' }) });
    assert.equal(capturedQuery, 'elma');
  });
});

test('query sanitization: multiple internal whitespace characters are collapsed', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'kırmızı   araba  görseli' }) });
    assert.equal(capturedQuery, 'kırmızı araba görseli');
  });
});

test('query sanitization: ASCII control characters are removed', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    // Embed NUL and ESC control characters around 'manzara'
    await handler({ httpMethod: 'POST', body: JSON.stringify({ query: '\x00manzara\x1B' }) });
    assert.equal(capturedQuery, 'manzara');
  });
});

test('query sanitization: a query that is only control characters becomes empty and is rejected', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: '\x00\x01\x1F' }) });
    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'missing_query');
  });
});

test('query sanitization: a query over 200 raw chars is rejected before processing', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'a'.repeat(201) }) });
    assert.equal(response.statusCode, 413);
    assert.equal(parseBody(response).error, 'query_too_long');
  });
});

test('query sanitization: a 200-char query is capped to 150 chars before reaching Openverse', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'a'.repeat(200) }) });
    assert.equal(capturedQuery.length, 150);
  });
});

test('query sanitization: normal Turkish query intent and keywords are preserved', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'İstanbul manzarası' }) });
    assert.equal(capturedQuery, 'İstanbul manzarası');
  });
});

// ─── Explicit query guard ────────────────────────────────────────────────────

test('explicit query guard: "porn" is rejected without network access', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'porn' }) });
    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'unsafe_query');
  });
});

test('explicit query guard: "porno video" is rejected', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'porno video izle' }) });
    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'unsafe_query');
  });
});

test('explicit query guard: "xxx" is rejected', async () => {
  await withFetch(async () => assert.fail('fetch must not be called'), async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'xxx film' }) });
    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'unsafe_query');
  });
});

// ─── URL validation ──────────────────────────────────────────────────────────

test('URL validation: valid https thumbnail URL is accepted', async () => {
  await withFetch(makeOpenverseSuccess([SAFE_RESULT]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'lake' }) }));
    assert.equal(body.ok, true);
    assert.ok(body.images[0].thumbnail.startsWith('https://'));
  });
});

test('URL validation: javascript: thumbnail URL causes result to be dropped', async () => {
  const jsResult = { ...SAFE_RESULT, id: 'js', thumbnail: 'javascript:alert(1)', url: 'javascript:alert(1)' };
  await withFetch(makeOpenverseSuccess([jsResult]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'lake' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

test('URL validation: data: thumbnail URL causes result to be dropped', async () => {
  const dataResult = { ...SAFE_RESULT, id: 'data', thumbnail: 'data:image/png;base64,abc', url: 'data:image/png;base64,abc' };
  await withFetch(makeOpenverseSuccess([dataResult]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'lake' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

test('URL validation: missing thumbnail causes result to be dropped', async () => {
  const noThumb = { ...SAFE_RESULT, id: 'nothumb', thumbnail: '', url: '' };
  await withFetch(makeOpenverseSuccess([noThumb]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'lake' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

test('URL validation: malformed URL causes result to be dropped', async () => {
  const badUrl = { ...SAFE_RESULT, id: 'bad', thumbnail: 'not-a-url', url: 'not-a-url' };
  await withFetch(makeOpenverseSuccess([badUrl]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'lake' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

// ─── Metadata filtering ──────────────────────────────────────────────────────

test('metadata filter: clean title and attribution pass through', async () => {
  await withFetch(makeOpenverseSuccess([SAFE_RESULT]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'mountain' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 1);
    assert.equal(body.images[0].title, 'Mountain Lake');
  });
});

test('metadata filter: explicit title causes result to be dropped', async () => {
  const explicitTitle = { ...SAFE_RESULT, id: 'et', title: 'Hot nude photo gallery' };
  await withFetch(makeOpenverseSuccess([explicitTitle]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'photo' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

test('metadata filter: explicit attribution causes result to be dropped', async () => {
  const explicitAttr = { ...SAFE_RESULT, id: 'ea', attribution: 'nudity art collection 2020' };
  await withFetch(makeOpenverseSuccess([explicitAttr]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'art' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 0);
  });
});

// ─── Result flow ─────────────────────────────────────────────────────────────

test('result flow: mixed safe and unsafe results — only safe ones are returned', async () => {
  const unsafeUrl = { ...SAFE_RESULT, id: 'unsafe-url', thumbnail: 'javascript:x', url: 'javascript:x' };
  const unsafeMeta = { ...SAFE_RESULT, id: 'unsafe-meta', title: 'xxx explicit' };
  const safe2 = { ...SAFE_RESULT, id: 'safe2', title: 'Forest Path', thumbnail: 'https://img.test/forest.jpg' };
  await withFetch(makeOpenverseSuccess([SAFE_RESULT, unsafeUrl, unsafeMeta, safe2]), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'nature' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 2);
    assert.ok(body.images.every(img => img.id !== 'unsafe-url' && img.id !== 'unsafe-meta'));
  });
});

test('result flow: all results filtered → ok:true with status no_safe_results', async () => {
  const allBad = [
    { ...SAFE_RESULT, id: 'b1', title: 'porno video' },
    { ...SAFE_RESULT, id: 'b2', thumbnail: 'javascript:x', url: 'javascript:x' }
  ];
  await withFetch(makeOpenverseSuccess(allBad), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'art' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.status, 'no_safe_results');
    assert.deepEqual(body.images, []);
  });
});

test('result flow: maximum 8 results are returned regardless of Openverse response size', async () => {
  const manyResults = Array.from({ length: 12 }, (_, i) => ({
    ...SAFE_RESULT,
    id: `r${i}`,
    title: `Image ${i}`,
    thumbnail: `https://img.test/img${i}.jpg`,
    url: `https://img.test/img${i}.jpg`,
    foreign_landing_url: `https://src.test/img${i}`
  }));
  await withFetch(makeOpenverseSuccess(manyResults), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'photos' }) }));
    assert.equal(body.ok, true);
    assert.equal(body.images.length, 8);
  });
});

test('result flow: provider error contract is preserved after sanitization changes', async () => {
  await withFetch(async () => ({ ok: false, status: 500, text: async () => 'server error' }), async () => {
    const body = parseBody(await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'city' }) }));
    assert.equal(body.ok, false);
    assert.equal(body.error, 'provider_error');
  });
});

test('regression: "elma görseli" normal query is not blocked and reaches Openverse', async () => {
  let capturedQuery = '';
  await withFetch(async (url) => {
    capturedQuery = new URL(url).searchParams.get('q');
    return makeOpenverseSuccess([SAFE_RESULT])();
  }, async () => {
    const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ query: 'elma görseli' }) });
    const body = parseBody(response);
    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(capturedQuery, 'elma görseli');
  });
});
