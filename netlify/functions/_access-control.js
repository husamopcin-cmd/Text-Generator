'use strict';

const crypto = require('node:crypto');
const { jsonResponse } = require('./_security');

const GUEST_TOKEN_VERSION = 1;
const GUEST_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_LIMITS = Object.freeze({
  anonymous: { chat: 20, image: 3 },
  authenticated: { chat: 150, image: 10 }
});
const DEFAULT_GUEST_ABUSE_LIMITS = Object.freeze({
  windowSeconds: 15 * 60,
  maxNewDevices: 6,
  maxFailedVerifications: 8
});

function getHeader(event, name) {
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const target = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) return String(value || '').trim();
  }
  return '';
}

function getClientIp(event) {
  const direct = getHeader(event, 'x-nf-client-connection-ip') || getHeader(event, 'client-ip');
  if (direct) return direct;
  return getHeader(event, 'x-forwarded-for').split(',')[0].trim();
}

function normalizeSupabaseUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') return '';
    return url.href.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function parsePositiveLimit(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : fallback;
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function getQuotaLimit(audience, usageKind) {
  if (!DEFAULT_LIMITS[audience] || !DEFAULT_LIMITS[audience][usageKind]) return 0;
  const prefix = audience === 'authenticated' ? 'AUTH' : 'ANON';
  const suffix = usageKind === 'image' ? 'IMAGE' : 'CHAT';
  return parsePositiveLimit(
    process.env[`CINOCODE_${prefix}_DAILY_${suffix}_LIMIT`],
    DEFAULT_LIMITS[audience][usageKind]
  );
}

function getGuestAbuseLimits() {
  return {
    windowSeconds: parseBoundedInteger(
      process.env.CINOCODE_GUEST_ABUSE_WINDOW_SECONDS,
      DEFAULT_GUEST_ABUSE_LIMITS.windowSeconds,
      5 * 60,
      60 * 60
    ),
    maxNewDevices: parseBoundedInteger(
      process.env.CINOCODE_GUEST_ABUSE_MAX_NEW_DEVICES,
      DEFAULT_GUEST_ABUSE_LIMITS.maxNewDevices,
      3,
      50
    ),
    maxFailedVerifications: parseBoundedInteger(
      process.env.CINOCODE_GUEST_ABUSE_MAX_FAILED_VERIFICATIONS,
      DEFAULT_GUEST_ABUSE_LIMITS.maxFailedVerifications,
      3,
      100
    )
  };
}

function getAccessConfig() {
  const config = {
    supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL),
    publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim(),
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    guestTokenSecret: String(process.env.CINOCODE_GUEST_TOKEN_SECRET || '').trim(),
    quotaHashSecret: String(process.env.CINOCODE_QUOTA_HASH_SECRET || '').trim()
  };
  config.ready = Boolean(
    config.supabaseUrl &&
    config.publishableKey.length >= 20 &&
    config.serviceRoleKey.length >= 20 &&
    config.guestTokenSecret.length >= 32 &&
    config.quotaHashSecret.length >= 32
  );
  return config;
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function hashIdentity(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value || '')).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createGuestToken(deviceId, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const normalizedDeviceId = String(deviceId || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(normalizedDeviceId) || String(secret || '').length < 32) return '';
  const payload = encodeBase64Url(JSON.stringify({
    v: GUEST_TOKEN_VERSION,
    did: hashIdentity(normalizedDeviceId, secret),
    iat: nowSeconds,
    exp: nowSeconds + GUEST_TOKEN_TTL_SECONDS
  }));
  return `${payload}.${signValue(payload, secret)}`;
}

function verifyGuestToken(token, deviceId, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || String(secret || '').length < 32) return null;
  if (!safeEqual(parts[1], signValue(parts[0], secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (payload.v !== GUEST_TOKEN_VERSION || !Number.isInteger(payload.exp) || payload.exp <= nowSeconds) return null;
    if (!safeEqual(payload.did, hashIdentity(String(deviceId || '').trim(), secret))) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

async function verifySupabaseUser(accessToken, config) {
  if (!accessToken) return null;
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && typeof user.id === 'string' && user.id ? user : null;
  } catch (_) {
    return null;
  }
}

async function consumeQuota(identityHash, usageKind, limit, config) {
  try {
    const headers = {
      apikey: config.serviceRoleKey,
      'Content-Type': 'application/json'
    };
    // New sb_secret keys are opaque API keys, while legacy service_role keys are JWTs.
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(config.serviceRoleKey)) {
      headers.Authorization = `Bearer ${config.serviceRoleKey}`;
    }
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/consume_cinocode_quota`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_identity_hash: identityHash,
        p_usage_kind: usageKind,
        p_limit: limit
      })
    });
    if (!response.ok) return null;
    const body = await response.json();
    const result = Array.isArray(body) ? body[0] : body;
    if (!result || typeof result.allowed !== 'boolean') return null;
    return {
      allowed: result.allowed,
      used: Number(result.used) || 0,
      remaining: Math.max(0, Number(result.remaining) || 0),
      resetAt: String(result.reset_at || result.resetAt || '')
    };
  } catch (_) {
    return null;
  }
}

async function recordGuestAbuseEvent(clientIp, deviceId, eventType, config = getAccessConfig()) {
  if (!config.ready || !clientIp || !deviceId || !['attempt', 'failure'].includes(eventType)) {
    return { available: false, limited: false };
  }

  const limits = getGuestAbuseLimits();
  const headers = {
    apikey: config.serviceRoleKey,
    'Content-Type': 'application/json'
  };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(config.serviceRoleKey)) {
    headers.Authorization = `Bearer ${config.serviceRoleKey}`;
  }

  try {
    // Ham IP veya cihaz kimliği veritabanına gitmez. Bu değerler yalnızca
    // kısa süreli anomali penceresini eşleştirmek için ayrı namespace'lerde
    // HMAC ile hash'lenir.
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/record_cinocode_guest_abuse`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_ip_hash: hashIdentity(`guest-ip:${clientIp}`, config.quotaHashSecret),
        p_device_hash: hashIdentity(`guest-device:${deviceId}`, config.quotaHashSecret),
        p_event_type: eventType,
        p_window_seconds: limits.windowSeconds,
        p_max_new_devices: limits.maxNewDevices,
        p_max_failed_verifications: limits.maxFailedVerifications
      })
    });
    if (!response.ok) return { available: false, limited: false };
    const body = await response.json();
    const result = Array.isArray(body) ? body[0] : body;
    if (!result || typeof result.limited !== 'boolean') return { available: false, limited: false };
    return {
      available: true,
      limited: result.limited,
      resetAt: String(result.reset_at || result.resetAt || ''),
      retryAfter: Math.max(1, Number(result.retry_after || result.retryAfter) || 1)
    };
  } catch (_) {
    // Bu ikincil abuse sinyali geçici olarak erişilemezse mevcut imzalı token,
    // Turnstile ve zorunlu kota katmanı çalışmaya devam eder.
    return { available: false, limited: false };
  }
}

function errorResponse(event, statusCode, error, extra = {}) {
  return jsonResponse(event, statusCode, { ok: false, error, ...extra });
}

async function authorizeUsage(event, usageKind) {
  if (usageKind !== 'chat' && usageKind !== 'image') {
    return { ok: false, response: errorResponse(event, 500, 'invalid_usage_kind') };
  }

  if (process.env.NODE_ENV === 'test' && process.env.CINOCODE_TEST_ACCESS_BYPASS === '1') {
    return {
      ok: true,
      principal: { type: 'test', id: 'test-user' },
      quota: { allowed: true, used: 0, remaining: 99999, resetAt: '' }
    };
  }

  const config = getAccessConfig();
  if (!config.ready) {
    return { ok: false, response: errorResponse(event, 503, 'access_control_not_configured') };
  }

  const authorization = getHeader(event, 'authorization');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  let principal;

  if (bearer) {
    const user = await verifySupabaseUser(bearer[1].trim(), config);
    if (!user) return { ok: false, response: errorResponse(event, 401, 'invalid_access_token') };
    principal = { type: 'authenticated', id: user.id };
  } else {
    const guestToken = getHeader(event, 'x-cinocode-guest-token');
    const deviceId = getHeader(event, 'x-cinocode-device-id');
    const guest = verifyGuestToken(guestToken, deviceId, config.guestTokenSecret);
    if (!guest) return { ok: false, response: errorResponse(event, 401, 'guest_session_required') };
    const clientIp = getClientIp(event);
    if (!clientIp) return { ok: false, response: errorResponse(event, 401, 'guest_identity_unavailable') };
    principal = { type: 'anonymous', id: `${clientIp}:${guest.did}` };
  }

  const identityHash = hashIdentity(`${principal.type}:${principal.id}`, config.quotaHashSecret);
  const limit = getQuotaLimit(principal.type, usageKind);
  const quota = await consumeQuota(identityHash, usageKind, limit, config);
  if (!quota) {
    return { ok: false, response: errorResponse(event, 503, 'quota_service_unavailable') };
  }
  if (!quota.allowed) {
    return {
      ok: false,
      response: errorResponse(event, 429, 'daily_quota_exceeded', {
        usageKind,
        limit,
        remaining: 0,
        resetAt: quota.resetAt
      })
    };
  }

  return { ok: true, principal, quota: { ...quota, limit } };
}

module.exports = {
  GUEST_TOKEN_TTL_SECONDS,
  authorizeUsage,
  consumeQuota,
  createGuestToken,
  getAccessConfig,
  getGuestAbuseLimits,
  getClientIp,
  getHeader,
  getQuotaLimit,
  hashIdentity,
  recordGuestAbuseEvent,
  verifyGuestToken,
  verifySupabaseUser
};
