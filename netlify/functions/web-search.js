'use strict';

const { buildSecurityHeaders, guardRequest } = require('./_security');
const SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/';
const SEARCH_TIMEOUT_MS = 12000;
const MAX_RESULTS = 4;

function jsonResponse(event, statusCode, body) {
  return { statusCode, headers: buildSecurityHeaders(event), body: JSON.stringify(body) };
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function safeResultUrl(value) {
  try {
    const parsed = new URL(String(value || '').replace(/&amp;/gi, '&'), SEARCH_ENDPOINT);
    const target = parsed.hostname.endsWith('duckduckgo.com') && parsed.pathname.startsWith('/l/')
      ? parsed.searchParams.get('uddg') : parsed.href;
    const result = new URL(target || parsed.href);
    return result.protocol === 'https:' || result.protocol === 'http:' ? result.href : '';
  } catch (_) { return ''; }
}

function parseResults(html) {
  const source = String(html || '');
  const titles = [...source.matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...source.matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*\bresult__snippet\b[^"']*["'])[^>]*>([\s\S]*?)<\/a>/gi)];
  const results = [];
  for (let index = 0; index < Math.min(titles.length, snippets.length, MAX_RESULTS); index += 1) {
    const url = safeResultUrl(titles[index][1]);
    const title = decodeHtml(titles[index][2]);
    const snippet = decodeHtml(snippets[index][1]);
    if (url && title && snippet) results.push({ title, snippet, url });
  }
  return results;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeoutId); }
}

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, { namespace: 'web-search', maxBodyBytes: 16 * 1024, rateLimit: 30, windowMs: 60 * 1000 });
  if (securityResponse) return securityResponse;
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { ok: false, error: 'method_not_allowed', message: 'Sadece POST desteklenir.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (_) { return jsonResponse(event, 400, { ok: false, error: 'bad_json', message: 'Geçersiz JSON.' }); }
  const query = String(body.query || '').trim();
  if (!query) return jsonResponse(event, 400, { ok: false, error: 'missing_query', message: 'Arama sorgusu (query) gerekli.' });
  if (query.length > 500) return jsonResponse(event, 413, { ok: false, error: 'query_too_long', message: 'Arama sorgusu en fazla 500 karakter olabilir.' });

  try {
    const response = await fetchWithTimeout(SEARCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (compatible; CinoCode/1.0)' },
      body: new URLSearchParams({ q: query }).toString()
    });
    if (!response.ok) return jsonResponse(event, 502, { ok: false, error: 'provider_error', message: 'Arama motoruna erişilemedi.' });
    return jsonResponse(event, 200, { ok: true, query, results: parseResults(await response.text()) });
  } catch (error) {
    return jsonResponse(event, 502, { ok: false, error: error && error.name === 'AbortError' ? 'timeout' : 'network_error', message: 'Arama sırasında sunucu hatası oluştu.' });
  }
};

module.exports._test = { decodeHtml, parseResults, safeResultUrl };
