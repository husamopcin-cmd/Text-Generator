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
test('vision tasks use Gemini 3.5 Flash and cap image inputs at five', async () => {
  await withFreshHandler({ GEMINI_API_KEY: 'gemini-test' }, async (handler) => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'vision ok' }] } }]
        })
      };
    };

    const images = Array.from({ length: 6 }, (_, index) => `data:image/png;base64,aW1hZ2Ut${index}`);
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        taskType: 'vision',
        selectedModel: 'gemini',
        messages: [{ role: 'user', content: 'describe', images }]
      })
    });
    const body = parseBody(response);
    const imageParts = request.body.contents.flatMap(item => item.parts || []).filter(part => part.inline_data);

    assert.equal(response.statusCode, 200);
    assert.equal(body.provider, 'gemini');
    assert.equal(body.model, 'gemini-3.5-flash');
    assert.match(request.url, /models\/gemini-3\.5-flash:generateContent/);
    assert.equal(imageParts.length, 5);
  });
});

test('vision routing excludes configured text-only providers', async () => {
  await withFreshHandler({ DEEPSEEK_API_KEY: 'deepseek-test' }, async (handler) => {
    global.fetch = async () => assert.fail('text-only provider must not receive vision input');
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        taskType: 'vision',
        selectedModel: 'deepseek',
        messages: [{ role: 'user', content: 'describe', images: ['data:image/png;base64,aW1hZ2U='] }]
      })
    });

    assert.equal(response.statusCode, 503);
    assert.match(parseBody(response).error, /Görsel analizi için/);
  });
});

test('preserves the system prompt while trimming recent chat history', async () => {
  await withFreshHandler({ OPENAI_API_KEY: 'openai-test' }, async (handler) => {
    let requestBody;
    global.fetch = async (url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] })
      };
    };

    // system + 7 sohbet turu (>4): eski slice(-4) mantığı system mesajını tamamen düşürürdü.
    const conversation = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `mesaj-${index}`
    }));
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        selectedModel: 'gpt-4o-mini-openai',
        messages: [{ role: 'system', content: 'SERBEST USLUP FINAL OVERRIDE' }, ...conversation]
      })
    });

    assert.equal(response.statusCode, 200);
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[0].content, 'SERBEST USLUP FINAL OVERRIDE');
    // Sadece son 4 sohbet mesajı korunmalı (system hariç), toplam 5 mesaj.
    assert.equal(requestBody.messages.length, 5);
    assert.deepEqual(requestBody.messages.slice(1).map(m => m.content), ['mesaj-3', 'mesaj-4', 'mesaj-5', 'mesaj-6']);
  });
});

test('Groq vision routing uses Llama 4 Scout', async () => {
  await withFreshHandler({ GROQ_API_KEY: 'groq-test' }, async (handler) => {
    let requestBody;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'groq vision ok' } }] })
      };
    };

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({
        taskType: 'vision',
        selectedModel: 'groq',
        messages: [{ role: 'user', content: 'describe', images: ['data:image/png;base64,aW1hZ2U='] }]
      })
    });

    assert.equal(response.statusCode, 200);
    assert.equal(requestBody.model, 'meta-llama/llama-4-scout-17b-16e-instruct');
    assert.ok(Array.isArray(requestBody.messages[0].content));
  });
});
