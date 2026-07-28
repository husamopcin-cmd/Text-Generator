'use strict';

const { createGuestToken, getAccessConfig, GUEST_TOKEN_TTL_SECONDS, getClientIp, recordGuestAbuseEvent } = require('./_access-control');
const { guardRequest, isTrustedLocalDevRequest, jsonResponse } = require('./_security');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function guestAbuseResponse(event, abuse) {
  const retryAfter = Math.max(1, Number(abuse && abuse.retryAfter) || 60);
  return jsonResponse(event, 429, {
    ok: false,
    error: 'guest_session_temporarily_limited',
    message: 'Kısa sürede çok fazla misafir doğrulaması denendi. Birkaç dakika bekle veya hesabınla giriş yap.',
    resetAt: String(abuse && abuse.resetAt || '')
  }, { 'Retry-After': String(retryAfter) });
}

async function verifyTurnstile(token, remoteIp, secret) {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

exports.handler = async event => {
  const guarded = guardRequest(event, {
    namespace: 'guest-session',
    maxBodyBytes: 8 * 1024,
    rateLimit: 10,
    windowMs: 60 * 1000
  });
  if (guarded) return guarded;

  if (String(event && event.httpMethod || '').toUpperCase() !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'POST, OPTIONS' });
  }

  let payload;
  try {
    payload = JSON.parse(String(event.body || '{}'));
  } catch (_) {
    return jsonResponse(event, 400, { ok: false, error: 'invalid_json' });
  }

  const turnstileToken = String(payload.turnstileToken || '').trim();
  const deviceId = String(payload.deviceId || '').trim();
  if (!turnstileToken || turnstileToken.length > 4096 || !DEVICE_ID_PATTERN.test(deviceId)) {
    return jsonResponse(event, 400, { ok: false, error: 'invalid_guest_request' });
  }

  const turnstileSecret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  const guestTokenSecret = String(process.env.CINOCODE_GUEST_TOKEN_SECRET || '').trim();
  if (!turnstileSecret || guestTokenSecret.length < 32) {
    return jsonResponse(event, 503, { ok: false, error: 'guest_access_not_configured' });
  }

  const clientIp = getClientIp(event);
  const abuseConfig = getAccessConfig();
  const attemptAbuse = await recordGuestAbuseEvent(clientIp, deviceId, 'attempt', abuseConfig);
  if (attemptAbuse.limited) return guestAbuseResponse(event, attemptAbuse);

  // Local bypass requires both the Netlify CLI marker and a loopback request.
  const isLocalDev = isTrustedLocalDevRequest(event);
  const verification = isLocalDev
    ? { success: true, action: 'cinocode-guest' }
    : await verifyTurnstile(turnstileToken, clientIp, turnstileSecret);
  if (!verification) {
    return jsonResponse(event, 503, { ok: false, error: 'turnstile_unavailable' });
  }
  if (verification.success !== true || verification.action !== 'cinocode-guest') {
    const failureAbuse = await recordGuestAbuseEvent(clientIp, deviceId, 'failure', abuseConfig);
    if (failureAbuse.limited) return guestAbuseResponse(event, failureAbuse);
    return jsonResponse(event, 401, { ok: false, error: 'turnstile_verification_failed' });
  }

  const guestToken = createGuestToken(deviceId, guestTokenSecret);
  if (!guestToken) {
    return jsonResponse(event, 500, { ok: false, error: 'guest_token_failed' });
  }

  return jsonResponse(event, 200, {
    ok: true,
    guestToken,
    expiresIn: GUEST_TOKEN_TTL_SECONDS
  });
};

exports._test = { verifyTurnstile };
