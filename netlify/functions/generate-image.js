

const { buildSecurityHeaders, guardRequest } = require('./_security');

const PROVIDER_TIMEOUT_MS = 18000;
const OPENAI_IMAGE_TIMEOUT_MS = 60000;

function corsJson(event, statusCode, bodyObj) {
  return {
    statusCode,
    headers: buildSecurityHeaders(event),
    body: JSON.stringify(bodyObj)
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyProviderHttpError(status, responseText) {
  const normalized = String(responseText || '').toLowerCase();
  if (status === 402 || /insufficientcredits|insufficient[_ -]?credits|billing_hard_limit|billing hard limit|credit balance|quota/.test(normalized)) {
    return 'insufficient_credits';
  }
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'quota_or_limit';
  return 'provider_error';
}

function pickOpenAIImageSize(width, height) {
  const ratio = width / height;
  if (ratio > 1.15) return '1536x1024';
  if (ratio < 0.87) return '1024x1536';
  return '1024x1024';
}

async function tryOpenAI(prompt, width, height) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  let resp;
  try {
    resp = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: 'gpt-image-1-mini',
        prompt,
        size: pickOpenAIImageSize(width, height),
        quality: 'low',
        output_format: 'jpeg',
        n: 1
      })
    }, OPENAI_IMAGE_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, error: classifyProviderHttpError(resp.status, text), status: resp.status, details: text.slice(0, 500) };
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const image = data && data.data && data.data[0];
  if (image && image.b64_json) return { ok: true, url: 'data:image/jpeg;base64,' + image.b64_json };
  if (image && image.url) return { ok: true, url: image.url };
  return { ok: false, error: 'empty_response', details: text.slice(0, 300) };
}

// Genişlik/yükseklikten sağlayıcıların kabul ettiği en yakın oranı seç
function pickAspectRatio(width, height) {
  const ratios = [
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
    { label: '9:16', value: 9 / 16 },
    { label: '3:2', value: 3 / 2 },
    { label: '2:3', value: 2 / 3 }
  ];
  const target = width / height;
  let best = ratios[0];
  for (const r of ratios) {
    if (Math.abs(r.value - target) < Math.abs(best.value - target)) best = r;
  }
  return best.label;
}

async function tryRunware(prompt, width, height) {
  const key = (process.env.RUNWARE_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  const taskUUID = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let resp;
  try {
    resp = await fetchWithTimeout('https://api.runware.ai/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify([{
        taskType: 'imageInference',
        taskUUID,
        positivePrompt: prompt,
        model: 'runware:100@1',
        width,
        height,
        numberResults: 1,
        outputType: ['URL']
      }])
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return {
      ok: false,
      error: classifyProviderHttpError(resp.status, text),
      status: resp.status,
      details: text.slice(0, 500)
    };
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const result = (data && data.data && data.data[0]) || (Array.isArray(data) && data[0]) || null;
  if (result && result.imageURL) return { ok: true, url: result.imageURL };
  return { ok: false, error: 'empty_response', details: text.slice(0, 500) };
}

async function tryFal(prompt, width, height) {
  const key = (process.env.FAL_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  let resp;
  try {
    resp = await fetchWithTimeout('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Key ' + key
      },
      body: JSON.stringify({
        prompt,
        image_size: { width, height },
        num_images: 1
      })
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, error: classifyProviderHttpError(resp.status, text), status: resp.status, details: text.slice(0, 500) };
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const url = data && data.images && data.images[0] && data.images[0].url;
  if (url) return { ok: true, url };
  return { ok: false, error: 'empty_response', details: text.slice(0, 500) };
}

async function tryReplicate(prompt, width, height) {
  const key = (process.env.REPLICATE_API_TOKEN || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  let resp;
  try {
    resp = await fetchWithTimeout('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs: 1,
          aspect_ratio: pickAspectRatio(width, height),
          output_format: 'jpg'
        }
      })
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, error: classifyProviderHttpError(resp.status, text), status: resp.status, details: text.slice(0, 500) };
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const output = data && data.output;
  const url = Array.isArray(output) ? output[0] : (typeof output === 'string' ? output : null);
  if (url) return { ok: true, url };
  return { ok: false, error: 'empty_response', details: text.slice(0, 500) };
}

async function tryStability(prompt, width, height) {
  const key = (process.env.STABILITY_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'jpeg');
  form.append('aspect_ratio', pickAspectRatio(width, height));

  let resp;
  try {
    resp = await fetchWithTimeout('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Accept': 'application/json'
      },
      body: form
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  const text = await resp.text();
  if (!resp.ok) {
    return { ok: false, error: classifyProviderHttpError(resp.status, text), status: resp.status, details: text.slice(0, 500) };
  }

  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  if (data && data.image) return { ok: true, url: 'data:image/jpeg;base64,' + data.image };
  return { ok: false, error: 'empty_response', details: text.slice(0, 300) };
}

async function tryHuggingFace(prompt) {
  const key = (process.env.HUGGINGFACE_API_KEY || '').trim();
  if (!key) return { ok: false, error: 'missing_env' };

  let resp;
  try {
    resp = await fetchWithTimeout('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({ inputs: prompt })
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : 'network' };
  }

  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, error: classifyProviderHttpError(resp.status, text), status: resp.status, details: text.slice(0, 500) };
  }

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    const text = await resp.text();
    return { ok: false, error: 'unexpected_response', details: text.slice(0, 300) };
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  return { ok: true, url: 'data:' + contentType + ';base64,' + buffer.toString('base64') };
}

const PROVIDERS = [
  { name: 'openai', fn: tryOpenAI },
  { name: 'stability', fn: tryStability },
  { name: 'runware', fn: tryRunware },
  { name: 'fal', fn: tryFal },
  { name: 'replicate', fn: tryReplicate },
  { name: 'huggingface', fn: tryHuggingFace }
];

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, {
    namespace: 'generate-image',
    maxBodyBytes: 64 * 1024,
    rateLimit: 15,
    windowMs: 60 * 1000
  });
  if (securityResponse) return securityResponse;

  if (typeof fetch === 'undefined') {
    return corsJson(event, 500, {
      ok: false,
      error: 'runtime_fetch_missing',
      message: 'Netlify runtime fetch desteği bulunamadı.'
    });
  }


  if (event.httpMethod !== 'POST') {
    return corsJson(event, 405, { ok: false, error: 'Sadece POST desteklenir.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return corsJson(event, 400, { ok: false, error: 'bad_json', message: 'Geçersiz istek gövdesi.' });
  }

  const prompt = String(body.prompt || '').trim();
  const width = Math.min(2048, Math.max(256, parseInt(body.width, 10) || 1024));
  const height = Math.min(2048, Math.max(256, parseInt(body.height, 10) || 1024));
  const forceProvider = String(body.forceProvider || '').trim().toLowerCase();

  if (!prompt) {
    return corsJson(event, 400, { ok: false, error: 'missing_prompt', message: 'Prompt alanı zorunludur.' });
  }
  if (prompt.length > 8000) {
    return corsJson(event, 413, { ok: false, error: 'prompt_too_long', message: 'Prompt en fazla 8000 karakter olabilir.' });
  }

  const chain = forceProvider
    ? PROVIDERS.filter(p => p.name === forceProvider)
    : PROVIDERS;

  if (!chain.length) {
    return corsJson(event, 400, { ok: false, error: 'unknown_provider', message: 'Bilinmeyen sağlayıcı: ' + forceProvider });
  }

  const attempts = [];
  for (const provider of chain) {
    let result;
    try {
      result = await provider.fn(prompt, width, height);
    } catch (err) {
      result = { ok: false, error: 'internal', details: String(err && err.message || err).slice(0, 300) };
    }

    if (result.ok) {
      return corsJson(event, 200, {
        ok: true,
        provider: provider.name,
        images: [result.url],
        attempts
      });
    }

    attempts.push({
      provider: provider.name,
      error: result.error,
      status: result.status || null,
      details: result.details || null
    });
  }

  const configured = attempts.filter(a => a.error !== 'missing_env');
  const message = configured.length === 0
    ? 'Hiçbir görsel sağlayıcısı yapılandırılmamış (env anahtarları eksik).'
    : 'Tüm görsel sağlayıcıları başarısız oldu: ' + attempts.map(a => `${a.provider}=${a.error}`).join(', ');

  return corsJson(event, 502, {
    ok: false,
    error: configured.length === 0 ? 'missing_env' : 'all_providers_failed',
    message,
    details: JSON.stringify(attempts)
  });
};
