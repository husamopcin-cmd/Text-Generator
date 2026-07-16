'use strict';

const { guardRequest, jsonResponse } = require('./_security');

function normalizePublicUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) return '';
    return parsed.href.replace(/\/$/, '');
  } catch (error) {
    return '';
  }
}

exports.handler = async function(event) {
  const securityResponse = guardRequest(event, {
    namespace: 'auth-config',
    maxBodyBytes: 2048,
    rateLimit: 60,
    windowMs: 60 * 1000
  });
  if (securityResponse) return securityResponse;

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Sadece POST desteklenir.' });
  }

  const supabaseUrl = normalizePublicUrl(process.env.SUPABASE_URL);
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const configured = Boolean(supabaseUrl && publishableKey.length >= 20);
  const missing = [];
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');

  return jsonResponse(event, 200, {
    ok: true,
    configured,
    supabaseUrl: configured ? supabaseUrl : '',
    publishableKey: configured ? publishableKey : '',
    missing
  });
};
