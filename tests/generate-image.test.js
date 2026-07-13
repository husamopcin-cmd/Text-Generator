const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/generate-image');

const PROVIDER_ENV_KEYS = [
  'RUNWARE_API_KEY',
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'STABILITY_API_KEY',
  'HUGGINGFACE_API_KEY'
];

function parseBody(response) {
  return JSON.parse(response.body);
}

async function withProviderEnvironment(overrides, run) {
  const snapshot = new Map(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;

  try {
    for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
    return await run();
  } finally {
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
  }
}

test('rejects a missing image prompt without touching the network', async () => {
  await withProviderEnvironment({}, async () => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({ httpMethod: 'POST', body: '{}' });

    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'missing_prompt');
  });
});

test('rejects an unknown forced provider without touching the network', async () => {
  await withProviderEnvironment({}, async () => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'unknown' })
    });

    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'unknown_provider');
  });
});

test('reports missing provider configuration without touching the network', async () => {
  await withProviderEnvironment({}, async () => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 502);
    assert.equal(body.error, 'missing_env');
    assert.equal(JSON.parse(body.details).length, 5);
  });
});

test('returns a controlled failure when a configured provider rejects the request', async () => {
  await withProviderEnvironment({ RUNWARE_API_KEY: 'test-key' }, async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return {
        ok: false,
        status: 429,
        text: async () => 'rate limit'
      };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'runware' })
    });
    const body = parseBody(response);
    const attempts = JSON.parse(body.details);

    assert.equal(response.statusCode, 502);
    assert.equal(body.error, 'all_providers_failed');
    assert.deepEqual(calls, ['https://api.runware.ai/v1']);
    assert.equal(attempts[0].provider, 'runware');
    assert.equal(attempts[0].error, 'provider_error');
  });
});

test('routes a forced provider success into the public response shape', async () => {
  await withProviderEnvironment({ RUNWARE_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [{ imageURL: 'https://example.test/generated.jpg' }]
      })
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'runware' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.provider, 'runware');
    assert.deepEqual(body.images, ['https://example.test/generated.jpg']);
  });
});
