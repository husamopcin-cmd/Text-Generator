const { buildSecurityHeaders, guardRequest } = require('./_security');

const PROXY_PROVIDERS = [
  'openai',
  'cerebras',
  'deepseek',
  'mistral',
  'openrouter',
  'gemini',
  'groq',
  'fireworks',
  'together',
  'xai',
  'anthropic'
];

const PROVIDER_KEYS = {
  openai: process.env.OPENAI_API_KEY || '',
  cerebras: process.env.CEREBRAS_API_KEY || '',
  deepseek: process.env.DEEPSEEK_API_KEY || '',
  mistral: process.env.MISTRAL_API_KEY || '',
  openrouter: process.env.OPENROUTER_API_KEY || '',
  gemini: process.env.GEMINI_API_KEY || '',
  groq: process.env.GROQ_API_KEY || '',
  fireworks: process.env.FIREWORKS_API_KEY || '',
  together: process.env.TOGETHER_API_KEY || '',
  xai: process.env.XAI_API_KEY || '',
  anthropic: process.env.ANTHROPIC_API_KEY || ''
};

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  cerebras: 'gemma-4-31b',
  deepseek: 'deepseek-chat',
  mistral: 'mistral-small-latest',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  gemini: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
  fireworks: 'accounts/fireworks/models/gpt-oss-120b',
  together: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
  xai: 'grok-3-mini',
  anthropic: 'claude-haiku-4-5-20251001'
};

const PROVIDER_TIMEOUTS = {
  chat: 15000,
  pdf: 30000,
  vision: 35000
};

function makeError(status, message, details = {}) {
  return {
    ok: false,
    error: message,
    details: { status, ...details }
  };
}

function limitMessages(messages, taskType) {
  if (!Array.isArray(messages)) return [];
  const count = taskType === 'pdf' ? 8 : 4;
  const maxLen = taskType === 'pdf' ? 40000 : 20000;
  return messages.slice(-count).map(msg => {
    const content = String(msg.content || '').substring(0, maxLen);
    const copy = { ...msg, content };
    if ('images' in copy && !Array.isArray(copy.images)) delete copy.images;
    return copy;
  });
}

function parseModelLabel(label) {
  const normalized = String(label || '').trim();
  const lower = normalized.toLowerCase();
  if (PROXY_PROVIDERS.includes(lower)) {
    return { provider: lower, modelId: DEFAULT_MODELS[lower] };
  }
  const provider = normalized.includes('-openai') ? 'openai'
    : normalized.includes('-cerebras') ? 'cerebras'
    : normalized.includes('-deepseek') ? 'deepseek'
    : normalized.includes('-mistral') ? 'mistral'
    : normalized.includes('-openrouter') ? 'openrouter'
    : normalized.includes('-gemini') ? 'gemini'
    : normalized.includes('-groq') ? 'groq'
    : normalized.includes('-fireworks') ? 'fireworks'
    : normalized.includes('-together') ? 'together'
    : normalized.includes('-xai') ? 'xai'
    : normalized.includes('-anthropic') ? 'anthropic'
    : null;
  const modelId = provider
    ? normalized.replace(new RegExp(`-${provider}$`, 'i'), '').trim() || DEFAULT_MODELS[provider]
    : normalized;
  return { provider, modelId };
}

function resolveModelId(provider, parsedSelection) {
  if (parsedSelection.provider === provider && parsedSelection.modelId) {
    return parsedSelection.modelId;
  }
  return DEFAULT_MODELS[provider] || provider;
}

function toOpenAiMessages(messages) {
  return messages.map(msg => {
    if (Array.isArray(msg.images) && msg.images.length > 0) {
      const contentParts = [];
      if (msg.content) contentParts.push({ type: 'text', text: msg.content });
      for (const img of msg.images) {
        contentParts.push({ type: 'image_url', image_url: { url: img } });
      }
      return { role: msg.role, content: contentParts };
    }
    return { role: msg.role, content: msg.content || '' };
  });
}

function buildGeminiContents(messages) {
  const contents = [];
  const systemText = messages.find(m => m.role === 'system')?.content || '';

  if (systemText) {
    contents.push({ role: 'user', parts: [{ text: '(Sistem Yönergesi: ' + systemText + ')' }] });
    contents.push({ role: 'model', parts: [{ text: 'Anlaştık, kurallara uyacağım!' }] });
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const parts = [];
    if (msg.content) parts.push({ text: msg.content });
    if (Array.isArray(msg.images)) {
      for (const img of msg.images) {
        const base64Data = String(img).split(',')[1] || img;
        const mimeType = String(img).match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
        parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
      }
    }
    const gemRole = msg.role === 'assistant' ? 'model' : 'user';
    if (contents.length && contents[contents.length - 1].role === gemRole) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role: gemRole, parts });
    }
  }
  return contents;
}

function extractContent(data, provider) {
  if (provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    return parts.filter(p => p.text).map(p => p.text).join('');
  }
  if (provider === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks.filter(b => b.type === 'text' && b.text).map(b => b.text).join('');
  }
  return data?.choices?.[0]?.message?.content
    || data?.completion?.content
    || data?.text
    || data?.output?.[0]?.content
    || data?.response
    || '';
}

function toAnthropicMessages(messages) {
  const system = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean).join('\n');
  const msgs = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    let content;
    if (Array.isArray(msg.images) && msg.images.length > 0) {
      content = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      for (const img of msg.images) {
        const match = String(img).match(/^data:([^;]+);base64,(.*)$/s);
        if (match) content.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
      }
    } else {
      content = msg.content || '';
    }
    // Anthropic ardışık aynı-rol mesajı kabul etmez; birleştir
    if (msgs.length && msgs[msgs.length - 1].role === role) {
      const prev = msgs[msgs.length - 1];
      const prevArr = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
      const currArr = Array.isArray(content) ? content : [{ type: 'text', text: content }];
      prev.content = prevArr.concat(currArr);
    } else {
      msgs.push({ role, content });
    }
  }
  // İlk mesaj user olmak zorunda
  if (msgs.length && msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '(önceki bağlam)' });
  }
  return { system, msgs };
}

function buildProviderPayload(provider, model, messages, temperature, maxTokens) {
  const chatMessages = toOpenAiMessages(messages);

  switch (provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.openai}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'cerebras':
      return {
        url: 'https://api.cerebras.ai/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.cerebras}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'deepseek':
      return {
        url: 'https://api.deepseek.com/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.deepseek}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'mistral':
      return {
        url: 'https://api.mistral.ai/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.mistral}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.openrouter}`,
            'HTTP-Referer': 'https://cinocode.app',
            'X-Title': 'CinoCode AI'
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'gemini': {
      const contents = buildGeminiContents(messages);
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${PROVIDER_KEYS.gemini}`,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: { temperature, maxOutputTokens: maxTokens }
          })
        }
      };
    }

    case 'groq':
      return {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.groq}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'fireworks':
      return {
        url: 'https://api.fireworks.ai/inference/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.fireworks}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'together':
      return {
        url: 'https://api.together.xyz/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.together}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'xai':
      return {
        url: 'https://api.x.ai/v1/chat/completions',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${PROVIDER_KEYS.xai}`
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
          })
        }
      };

    case 'anthropic': {
      const { system, msgs } = toAnthropicMessages(messages);
      const payload = {
        model,
        max_tokens: maxTokens,
        temperature,
        messages: msgs
      };
      if (system) payload.system = system;
      return {
        url: 'https://api.anthropic.com/v1/messages',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': PROVIDER_KEYS.anthropic,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify(payload)
        }
      };
    }

    default:
      return null;
  }
}

function getFallbackOrder(taskType) {
  if (taskType === 'pdf') {
    return ['gemini', 'openai', 'deepseek', 'cerebras', 'mistral', 'openrouter', 'anthropic'];
  }
  return ['openai', 'cerebras', 'deepseek', 'mistral', 'openrouter', 'gemini', 'groq', 'fireworks', 'together', 'xai', 'anthropic'];
}

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, {
    namespace: 'ai-chat',
    maxBodyBytes: 6 * 1024 * 1024,
    rateLimit: 60,
    windowMs: 60 * 1000
  });
  if (securityResponse) return securityResponse;

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify(makeError(405, 'Sadece POST desteklenir.'))
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers: buildSecurityHeaders(event),
      body: JSON.stringify(makeError(400, 'Geçersiz JSON.'))
    };
  }

  const taskType = body.taskType === 'pdf' ? 'pdf' : body.taskType === 'vision' ? 'vision' : 'chat';
  const messages = limitMessages(body.messages, taskType);
  const selectedModel = String(body.selectedModel || '').trim();
  const temperature = Number.isFinite(body.temperature) ? body.temperature : 0.7;
  const maxTokens = Number.isFinite(body.maxTokens) ? body.maxTokens : 1024;

  if (!messages.length) {
    return {
      statusCode: 400,
      headers: buildSecurityHeaders(event),
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
      headers: buildSecurityHeaders(event),
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
    const model = resolveModelId(provider, parsedSelection);
    const payload = buildProviderPayload(provider, model, allowedMessages, temperature, maxTokens);
    if (!payload) return null;

    const controller = new AbortController();
    const timeout = PROVIDER_TIMEOUTS[taskType] || 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let res;
    try {
      res = await fetch(payload.url, { ...payload.options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError') {
        return { error: 'timeout', provider, model, status: 'timeout' };
      }
      return { error: 'network', provider, model, status: 'network' };
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await res.text();
    if (!res.ok) {
      return { error: 'provider', provider, model, status: res.status, body: text };
    }

    let data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    const content = extractContent(data, provider);
    return { ok: true, provider, model, content: String(content || '').trim(), raw: data };
  };

  let lastError = null;
  for (const provider of providerOrder) {
    const result = await runProvider(provider);
    if (!result) continue;

    if (result.ok) {
      return {
        statusCode: 200,
        headers: buildSecurityHeaders(event),
        body: JSON.stringify({
          ok: true,
          provider: result.provider,
          model: result.model,
          content: result.content
        })
      };
    }

    lastError = result;
    if (result.error === 'timeout') continue;
    if (result.status === 401 || result.status === 403) continue;
    if (result.status === 429) continue;
    if (result.status === 413) break;
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
    headers: buildSecurityHeaders(event),
    body: JSON.stringify(makeError(lastError?.status || 502, genericMessage, {
      provider: lastError?.provider,
      model: lastError?.model,
      status: lastError?.status,
      error: lastError?.error
    }))
  };
};
