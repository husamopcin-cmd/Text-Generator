const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/generate-image');

const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'RUNWARE_API_KEY',
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'STABILITY_API_KEY',
  'HUGGINGFACE_API_KEY',
  'POLLINATIONS_API_KEY'
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
    assert.equal(JSON.parse(body.details).length, 7);
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
    assert.equal(attempts[0].error, 'quota_or_limit');
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

test('uses OpenAI image generation with a supported size and returns base64 data', async () => {
  await withProviderEnvironment({ OPENAI_API_KEY: 'openai-test-key' }, async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: 'ZmFrZS1qcGVn' }] })
      };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'wide city skyline', width: 1600, height: 900, forceProvider: 'openai' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, 'openai');
    assert.deepEqual(body.images, ['data:image/jpeg;base64,ZmFrZS1qcGVn']);
    assert.equal(request.url, 'https://api.openai.com/v1/images/generations');
    assert.equal(request.options.headers.Authorization, 'Bearer openai-test-key');
    assert.equal(request.body.model, 'gpt-image-1-mini');
    assert.equal(request.body.size, '1536x1024');
    assert.equal(request.body.quality, 'low');
  });
});
test('classifies OpenAI billing limits as insufficient credits', async () => {
  await withProviderEnvironment({ OPENAI_API_KEY: 'openai-test-key' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: { type: 'billing_limit_user_error', code: 'billing_hard_limit_reached', message: 'Billing hard limit has been reached.' }
      })
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'openai' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'insufficient_credits');
    assert.equal(attempts[0].status, 400);
  });
});

test('retries the next pooled key on a rate limit instead of permanently killing it', async () => {
  await withProviderEnvironment({ RUNWARE_API_KEYS: 'runware-key-1,runware-key-2' }, async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      const auth = options && options.headers && options.headers.Authorization;
      calls.push(auth || url);
      if (auth === 'Bearer runware-key-1') {
        return { ok: false, status: 429, text: async () => 'rate limited' };
      }
      if (auth === 'Bearer runware-key-2') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: [{ imageURL: 'https://example.test/pool-success.jpg' }] })
        };
      }
      return { ok: false, status: 404, text: async () => 'not found' };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'runware' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, 'runware');
    assert.deepEqual(calls.slice(0, 2), ['Bearer runware-key-1', 'Bearer runware-key-2']);
  });

  await withProviderEnvironment({ RUNWARE_API_KEYS: 'runware-key-1' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ imageURL: 'https://example.test/still-alive.jpg' }] })
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image again', forceProvider: 'runware' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200, 'a temporary rate limit must not permanently blacklist the key');
    assert.equal(body.provider, 'runware');
  });
});

test('stops retrying once every pooled key has been rate limited (no infinite loop)', async () => {
  await withProviderEnvironment({ RUNWARE_API_KEYS: 'runware-key-a,runware-key-b' }, async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      const auth = options && options.headers && options.headers.Authorization;
      calls.push(auth);
      return { ok: false, status: 429, text: async () => 'rate limited' };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'runware' })
    });
    const body = parseBody(response);
    const attempts = JSON.parse(body.details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'quota_or_limit');
    assert.deepEqual(calls, ['Bearer runware-key-a', 'Bearer runware-key-b']);
  });
});

test('classifies Fal 403 responses as unauthorized', async () => {
  await withProviderEnvironment({ FAL_KEY: 'fal-test-key' }, async () => {
    global.fetch = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'fal' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'unauthorized');
    assert.equal(attempts[0].status, 403);
  });
});

// Pollinations-specific tests
test('Pollinations without key returns missing_env', async () => {
  await withProviderEnvironment({}, async () => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image', forceProvider: 'pollinations' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 502);
    assert.equal(body.error, 'missing_env');
  });
});

test('Pollinations with key uses correct endpoint and auth', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'pollinations-test-key' }, async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
        arrayBuffer: async () => Buffer.from('fake-image-bytes')
      };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'sunset over mountains', width: 1024, height: 768, forceProvider: 'pollinations' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, 'pollinations');
    assert.ok(body.images[0].startsWith('data:image/jpeg;base64,'));
    assert.ok(request.url.includes('gen.pollinations.ai/image'));
    assert.equal(request.options.headers.Authorization, 'Bearer pollinations-test-key');
  });
});

test('Pollinations successful JPEG response', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
      arrayBuffer: async () => Buffer.from('jpeg-bytes')
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.ok(body.images[0].startsWith('data:image/jpeg;base64,'));
  });
});

test('Pollinations successful PNG response preserves MIME type', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => Buffer.from('png-bytes')
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.ok(body.images[0].startsWith('data:image/png;base64,'));
  });
});

test('Pollinations 401 returns unauthorized and marks key dead', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'bad-key' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'unauthorized');
    assert.equal(attempts[0].status, 401);
  });
});

test('Pollinations 402 returns insufficient credits', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'no-credits-key' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 402,
      text: async () => 'Insufficient credits'
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'insufficient_credits');
    assert.equal(attempts[0].status, 402);
  });
});

test('Pollinations 429 returns quota_or_limit', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'rate-limited-key' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Too many requests'
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'quota_or_limit');
    assert.equal(attempts[0].status, 429);
  });
});

test('Pollinations 500 returns provider_error', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal server error'
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'provider_error');
    assert.equal(attempts[0].status, 500);
  });
});

test('Pollinations timeout returns timeout error', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'timeout');
  });
});

test('Pollinations rejects text/html Content-Type', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'text/html' : null },
      arrayBuffer: async () => Buffer.from('<html>error</html>')
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'unexpected_response');
  });
});

test('Pollinations rejects application/json Content-Type', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'application/json' : null },
      arrayBuffer: async () => Buffer.from('{"error":"not an image"}')
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'unexpected_response');
  });
});

test('Pollinations rejects empty response body', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
      arrayBuffer: async () => Buffer.from('')
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'empty_response');
  });
});

test('Pollinations rejects oversized response', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB, over 10MB limit
    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
      arrayBuffer: async () => largeBuffer
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const attempts = JSON.parse(parseBody(response).details);

    assert.equal(response.statusCode, 502);
    assert.equal(attempts[0].error, 'response_too_large');
  });
});

test('Pollinations clamps width and height to safe ranges', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'test-key' }, async () => {
    let requestUrl;
    global.fetch = async (url) => {
      requestUrl = url;
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
        arrayBuffer: async () => Buffer.from('image-bytes')
      };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', width: 5000, height: 100, forceProvider: 'pollinations' })
    });

    assert.equal(response.statusCode, 200);
    assert.ok(requestUrl.includes('width=2048')); // clamped to max
    assert.ok(requestUrl.includes('height=256')); // clamped to min
  });
});

test('Pollinations fallback chain continues on failure', async () => {
  await withProviderEnvironment({
    OPENAI_API_KEY: 'openai-key',
    POLLINATIONS_API_KEY: 'pollinations-key'
  }, async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      if (url.includes('api.openai.com')) {
        return { ok: false, status: 500, text: async () => 'Server error' };
      }
      if (url.includes('gen.pollinations.ai')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === 'content-type' ? 'image/jpeg' : null },
          arrayBuffer: async () => Buffer.from('pollinations-image-bytes')
        };
      }
      return { ok: false, status: 500, text: async () => 'Server error' };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test image' })
    });
    const body = parseBody(response);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, 'pollinations');
    assert.ok(calls.some(url => url.includes('api.openai.com')));
    assert.ok(calls.some(url => url.includes('gen.pollinations.ai')));
  });
});

test('Pollinations does not leak API key in error details', async () => {
  await withProviderEnvironment({ POLLINATIONS_API_KEY: 'secret-key-12345' }, async () => {
    global.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    });

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ prompt: 'test', forceProvider: 'pollinations' })
    });
    const body = parseBody(response);
    const details = body.details;

    assert.equal(response.statusCode, 502);
    assert.ok(!details.includes('secret-key-12345'));
    assert.ok(!details.includes('Bearer'));
  });
});
