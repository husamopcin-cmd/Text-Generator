const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('../netlify/functions/ai-chat');
const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'CEREBRAS_API_KEY',
  'DEEPSEEK_API_KEY',
  'MISTRAL_API_KEY',
  'OPENROUTER_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'FIREWORKS_API_KEY',
  'TOGETHER_API_KEY',
  'XAI_API_KEY',
  'ANTHROPIC_API_KEY'
];

function parseBody(response) {
  return JSON.parse(response.body);
}

async function withFreshHandler(overrides, run) {
  const snapshot = new Map(PROVIDER_ENV_KEYS.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;

  try {
    for (const key of PROVIDER_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(overrides)) process.env[key] = value;
    delete require.cache[modulePath];
    const { handler } = require(modulePath);
    return await run(handler);
  } finally {
    delete require.cache[modulePath];
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = originalFetch;
  }
}

test('rejects invalid JSON before provider routing', async () => {
  await withFreshHandler({}, async (handler) => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({ httpMethod: 'POST', body: '{invalid' });

    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'Geçersiz JSON.');
  });
});

test('rejects an empty message list before provider routing', async () => {
  await withFreshHandler({}, async (handler) => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ messages: [] })
    });

    assert.equal(response.statusCode, 400);
    assert.equal(parseBody(response).error, 'Messages boş olamaz.');
  });
});

test('reports that no cloud provider is configured without touching the network', async () => {
  await withFreshHandler({}, async (handler) => {
    global.fetch = async () => assert.fail('fetch must not be called');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
    });

    assert.equal(response.statusCode, 503);
    assert.equal(parseBody(response).error, 'Hiçbir bulut sağlayıcı yapılandırılmamış.');
  });
});

test('tries the selected provider first and falls back after rate limiting', async () => {
  await withFreshHandler(
    { OPENAI_API_KEY: 'openai-test', DEEPSEEK_API_KEY: 'deepseek-test' },
    async (handler) => {
      const calls = [];
      global.fetch = async (url) => {
        calls.push(url);
        if (url.includes('deepseek.com')) {
          return { ok: false, status: 429, text: async () => 'rate limit' };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [{ message: { content: 'fallback ok' } }]
          })
        };
      };

      const response = await handler({
        httpMethod: 'POST',
        body: JSON.stringify({
          selectedModel: 'deepseek-chat-deepseek',
          messages: [{ role: 'user', content: 'hello' }]
        })
      });
      const body = parseBody(response);

      assert.equal(response.statusCode, 200);
      assert.equal(body.provider, 'openai');
      assert.equal(body.content, 'fallback ok');
      assert.deepEqual(calls, [
        'https://api.deepseek.com/v1/chat/completions',
        'https://api.openai.com/v1/chat/completions'
      ]);
    }
  );
});
