const { buildSecurityHeaders, guardRequest } = require('./_security');

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
const SEARCH_TIMEOUT_MS = 12000;

function jsonResponse(event, statusCode, body) {
  return {
    statusCode,
    headers: buildSecurityHeaders(event, { 'Cache-Control': 'no-store' }),
    body: JSON.stringify(body)
  };
}

function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch (err) {
    return '';
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, {
    namespace: 'image-search',
    maxBodyBytes: 16 * 1024,
    rateLimit: 30,
    windowMs: 60 * 1000
  });
  if (securityResponse) return securityResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Sadece POST desteklenir.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (err) {
    return jsonResponse(event, 400, { ok: false, error: 'bad_json', message: 'Geçersiz JSON.' });
  }

  const query = String(body.query || '').trim();
  if (!query) {
    return jsonResponse(event, 400, { ok: false, error: 'missing_query', message: 'Arama sorgusu gerekli.' });
  }
  if (query.length > 200) {
    return jsonResponse(event, 413, { ok: false, error: 'query_too_long', message: 'Arama sorgusu en fazla 200 karakter olabilir.' });
  }
  if (typeof fetch === 'undefined') {
    return jsonResponse(event, 500, { ok: false, error: 'runtime_fetch_missing', message: 'Sunucu arama desteği bulunamadı.' });
  }

  const url = new URL(OPENVERSE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', '8');
  url.searchParams.set('mature', 'false');

  try {
    const response = await fetchWithTimeout(url.href, {
      headers: { 'Accept': 'application/json' }
    });
    const text = await response.text();
    if (!response.ok) {
      return jsonResponse(event, 502, {
        ok: false,
        error: response.status === 429 ? 'rate_limited' : 'provider_error',
        message: 'İnternet görsel araması şu anda yanıt vermiyor.'
      });
    }

    let data;
    try { data = JSON.parse(text); } catch (err) { data = null; }
    const results = Array.isArray(data && data.results) ? data.results : [];
    const images = results.map((item) => {
      const thumbnail = safeExternalUrl(item.thumbnail || item.url);
      const imageUrl = safeExternalUrl(item.url);
      const landingUrl = safeExternalUrl(item.foreign_landing_url || item.detail_url || item.url);
      if (!thumbnail || !landingUrl) return null;
      return {
        id: String(item.id || '').slice(0, 120),
        title: String(item.title || 'İsimsiz görsel').trim().slice(0, 240),
        thumbnail,
        imageUrl,
        landingUrl,
        creator: String(item.creator || 'Bilinmeyen üretici').trim().slice(0, 160),
        creatorUrl: safeExternalUrl(item.creator_url),
        license: String(item.license || '').trim().slice(0, 40),
        licenseUrl: safeExternalUrl(item.license_url),
        attribution: String(item.attribution || '').trim().slice(0, 500),
        width: Number(item.width) || null,
        height: Number(item.height) || null,
        source: String(item.source || 'Openverse').trim().slice(0, 80)
      };
    }).filter(Boolean).slice(0, 8);

    return jsonResponse(event, 200, { ok: true, query, source: 'Openverse', images });
  } catch (err) {
    return jsonResponse(event, 502, {
      ok: false,
      error: err && err.name === 'AbortError' ? 'timeout' : 'network_error',
      message: 'İnternet görsel aramasına ulaşılamadı.'
    });
  }
};
