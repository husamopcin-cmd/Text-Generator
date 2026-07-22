'use strict';

const rateBuckets = new Map();

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

function checkOrigin(event) {
  const origin = getHeader(event, 'origin').replace(/\/$/, '');
  if (!origin) return { allowed: true, origin: '' };

  const host = getHeader(event, 'x-forwarded-host') || getHeader(event, 'host');
  const proto = getHeader(event, 'x-forwarded-proto') || 'https';
  const sameSiteOrigin = host ? `${proto}://${host}`.replace(/\/$/, '') : '';
  const isLocalOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);

  return {
    allowed: isLocalOrigin || (!!sameSiteOrigin && origin === sameSiteOrigin),
    origin
  };
}

function buildSecurityHeaders(event, extraHeaders = {}) {
  const originCheck = checkOrigin(event);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
    ...extraHeaders
  };

  if (originCheck.allowed && originCheck.origin) {
    headers['Access-Control-Allow-Origin'] = originCheck.origin;
  }
  return headers;
}

function jsonResponse(event, statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: buildSecurityHeaders(event, extraHeaders),
    body: JSON.stringify(body)
  };
}

function preflightResponse(event) {
  return {
    statusCode: 204,
    headers: buildSecurityHeaders(event, {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CinoCode-Guest-Token, X-CinoCode-Device-Id',
      'Access-Control-Max-Age': '600'
    }),
    body: ''
  };
}

function getBodySize(event) {
  const body = String(event && event.body || '');
  if (!body) return 0;
  if (event && event.isBase64Encoded) {
    try { return Buffer.from(body, 'base64').length; } catch (_) { return Number.MAX_SAFE_INTEGER; }
  }
  return Buffer.byteLength(body, 'utf8');
}

function getClientIp(event) {
  const direct = getHeader(event, 'x-nf-client-connection-ip') || getHeader(event, 'client-ip');
  if (direct) return direct;
  const forwarded = getHeader(event, 'x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : '';
}

function checkRateLimit(event, namespace, limit, windowMs) {
  const clientIp = getClientIp(event);
  if (!clientIp || !Number.isFinite(limit) || limit <= 0) return { allowed: true, retryAfter: 0 };

  const now = Date.now();
  const key = `${namespace}:${clientIp}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 10000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (now >= value.resetAt) rateBuckets.delete(bucketKey);
    }
  }

  return { allowed: true, retryAfter: 0 };
}

function guardRequest(event, options = {}) {
  const originCheck = checkOrigin(event);
  if (!originCheck.allowed) {
    return jsonResponse(event, 403, { ok: false, error: 'origin_not_allowed' });
  }

  if (String(event && event.httpMethod || '').toUpperCase() === 'OPTIONS') {
    return preflightResponse(event);
  }

  const maxBodyBytes = Number(options.maxBodyBytes) || 0;
  if (maxBodyBytes > 0 && getBodySize(event) > maxBodyBytes) {
    return jsonResponse(event, 413, { ok: false, error: 'request_too_large' });
  }

  const rate = checkRateLimit(
    event,
    options.namespace || 'default',
    Number(options.rateLimit) || 0,
    Number(options.windowMs) || 60000
  );
  if (!rate.allowed) {
    return jsonResponse(event, 429, { ok: false, error: 'rate_limited' }, {
      'Retry-After': String(rate.retryAfter)
    });
  }

  return null;
}

function resetRateLimits() {
  rateBuckets.clear();
}

module.exports = {
  buildSecurityHeaders,
  checkOrigin,
  guardRequest,
  jsonResponse,
  resetRateLimits
};
