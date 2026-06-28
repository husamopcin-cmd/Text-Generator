const PROVIDERS = [
  'cerebras',
  'deepseek',
  'mistral',
  'openrouter'
];

const PROVIDER_KEYS = {
  cerebras: process.env.CEREBRAS_API_KEY || '',
  deepseek: process.env.DEEPSEEK_API_KEY || '',
  mistral: process.env.MISTRAL_API_KEY || '',
  openrouter: process.env.OPENROUTER_API_KEY || ''
};

const PROVIDER_TIMEOUTS = {
  chat: 15000,
  pdf: 30000,
  vision: 30000
};

function makeError(status, message, details = {}) {
  return {
    ok: false,
    error: message,
    details: { status, ...details }
  };
}

function limitMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const trimmed = messages.slice(-4).map(msg => {
    const content = String(msg.content || '').substring(0, 4000);
    const copy = { ...msg, content };
    if ('images' in copy && !Array.isArray(copy.images)) delete copy.images;
    return copy;
  });
  return trimmed;
}

function safeJson(body) {
  try { return JSON.parse(body); } catch(e) { return null; }
}

function parseModelLabel(label) {
  const normalized = String(label || '').trim();
  const provider = normalized.includes('-cerebras') ? 'cerebras'
    : normalized.includes('-deepseek') ? 'deepseek'
    : normalized.includes('-mistral') ? 'mistral'
    : normalized.includes('-openrouter') ? 'openrouter'
    : null;
  const modelId = provider ? normalized.replace(`-${provider}`, '').trim() : normalized;
  return { provider, modelId };
}

function buildProviderPayload(provider, model, messages, taskType, temperature, maxTokens) {
  const systemMessage = messages.find(m => m.role === 'system');
  const contentMessages = messages.filter(m => m.role !== 'system');

  switch (provider) {
    case 'cerebras':
      return {
        url: `https://api.cerebras.net/v1/chat/completions`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PROVIDER_KEYS.cerebras}`
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'deepseek':
      return {
        url: `https://api.deepseek.ai/v1/chat/completions`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PROVIDER_KEYS.deepseek}`
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'mistral':
      return {
        url: `https://api.mistral.ai/v1/chat/completions`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PROVIDER_KEYS.mistral}`
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'openrouter':
      return {
        url: `https://openrouter.ai/api/v1/chat/completions`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PROVIDER_KEYS.openrouter}`
          },
          body: JSON.stringify({
            model,
            messages: messages.map(msg => {
              if (Array.isArray(msg.images) && msg.images.length > 0) {
                const contentParts = [];
                if (msg.content) contentParts.push({ type: 'text', text: msg.content });
                for (const img of msg.images) {
                  contentParts.push({ type: 'image_url', image_url: { url: img } });
                }
                return { role: msg.role, content: contentParts };
              }
              return { role: msg.role, content: msg.content || '' };
            }),
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    default:
      return null;
  }
}

function getFallbackOrder(taskType) {
  if (taskType === 'pdf' || taskType === 'vision') {
    return ['deepseek', 'cerebras', 'mistral', 'openrouter'];
  }
  return ['cerebras', 'deepseek', 'mistral', 'openrouter'];
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: 'OK'
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(makeError(405, 'Only POST is allowed.'))
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(makeError(400, 'Geçersiz JSON.'))
    };
  }

  const messages = limitMessages(body.messages);
  const taskType = body.taskType === 'pdf' ? 'pdf' : body.taskType === 'vision' ? 'vision' : 'chat';
  const selectedModel = String(body.selectedModel || '').trim();
  const temperature = Number.isFinite(body.temperature) ? body.temperature : 0.7;
  const maxTokens = Number.isFinite(body.maxTokens) ? body.maxTokens : 1024;

  if (!messages.length) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(makeError(400, 'Messages boş olamaz.'))
    };
  }

  const allowedMessages = messages.map(m => {
    const item = { role: String(m.role || 'user'), content: String(m.content || '') };
    if (Array.isArray(m.images)) item.images = m.images;
    return item;
  });
  const parsedSelection = parseModelLabel(selectedModel);
  const fallback = getFallbackOrder(taskType);
  const candidates = fallback.filter(provider => PROVIDER_KEYS[provider]);
  if (!candidates.length) {
    return {
      statusCode: 503,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(makeError(503, 'Hiçbir bulut sağlayıcı yapılandırılmamış.'))
    };
  }

  const providerOrder = [];
  if (parsedSelection.provider && PROVIDER_KEYS[parsedSelection.provider]) {
    providerOrder.push(parsedSelection.provider);
  }
  for (const provider of candidates) {
    if (!providerOrder.includes(provider)) providerOrder.push(provider);
  }

  const runProvider = async (provider) => {
    const selectedModelLabel = provider === parsedSelection.provider ? selectedModel : selectedModel;
    const payload = buildProviderPayload(provider, selectedModelLabel, allowedMessages, taskType, temperature, maxTokens);
    if (!payload) return null;
    const controller = new AbortController();
    const timeout = PROVIDER_TIMEOUTS[taskType] || 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let res;
    try {
      res = await fetch(payload.url, { ...payload.options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        return { error: 'timeout', provider, model: selectedModel, status: 'timeout' };
      }
      return { error: 'network', provider, model: selectedModel, status: 'network' };
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    if (!res.ok) {
      const status = res.status;
      return { error: 'provider', provider, model: selectedModel, status, body: text };
    }

    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    const content = data?.choices?.[0]?.message?.content || data?.completion?.content || data?.text || data?.output?.[0]?.content || data?.response || '';
    return { ok: true, provider, model: selectedModel, content: String(content || '').trim(), raw: data };
  };

  let lastError = null;
  for (const provider of providerOrder) {
    const result = await runProvider(provider);
    if (!result) continue;

    if (result.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, provider: result.provider, model: result.model, content: result.content })
      };
    }

    lastError = result;
    if (result.error === 'timeout') {
      continue;
    }
    if (result.status === 401 || result.status === 403) {
      continue;
    }
    if (result.status === 429) {
      continue;
    }
    if (result.status === 413) {
      break;
    }
  }

  const genericMessage = lastError?.status === 401 || lastError?.status === 403
    ? 'API anahtarı geçersiz veya yetkisiz.'
    : lastError?.status === 429
      ? 'Kota/rate limit doldu, yedek sağlayıcı deneniyor.'
      : lastError?.status === 413
        ? 'İstek çok büyük.'
        : lastError?.error === 'timeout'
          ? 'Model zaman aşımına uğradı.'
          : 'Tüm bulut sağlayıcılar şu an yanıt vermiyor. Yerel Qwen 7B seç veya biraz bekle.';

  return {
    statusCode: 502,
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(makeError(lastError?.status || 502, genericMessage, {
      provider: lastError?.provider,
      model: lastError?.model,
      status: lastError?.status,
      error: lastError?.error
    }))
  };
};
