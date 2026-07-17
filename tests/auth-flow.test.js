const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const authCore = fs.readFileSync(path.join(root, 'assets', 'js', 'auth-core.js'), 'utf8');

test('auth-core.js exports required functions to window.CinoCodeAuth', () => {
  assert.match(authCore, /window\.CinoCodeAuth = \{/);
  assert.match(authCore, /getStoredUserName/);
  assert.match(authCore, /rememberLocalProfile/);
  assert.match(authCore, /getCloudAuthClient/);
  assert.match(authCore, /initializeAccountSession/);
  assert.match(authCore, /signOutAccountSession/);
  assert.match(authCore, /openAccountAuthModal/);
  assert.match(authCore, /openLocalProfileSetupModal/);
  assert.match(authCore, /translateAuthError/);
});

test('auth config endpoint is called securely', () => {
  assert.match(authCore, /\.netlify\/functions\/auth-config/);
  assert.match(authCore, /method: 'POST'/);
  assert.match(authCore, /signal: controller\.signal/);
  assert.match(authCore, /timeoutId = setTimeout\(\(\) => controller\.abort\(\), 8000\)/);
});

test('Supabase client is memoized to prevent duplicate creation', () => {
  assert.match(authCore, /let cloudAuthClient = null/);
  assert.match(authCore, /if \(cloudAuthClient\) return cloudAuthClient/);
  assert.match(authCore, /window\.supabase\.createClient/);
});

test('auth config promise is memoized', () => {
  assert.match(authCore, /let cloudAuthConfigPromise = null/);
  assert.match(authCore, /if \(cloudAuthConfigPromise\) return cloudAuthConfigPromise/);
});

test('Google OAuth is configured with correct provider', () => {
  assert.match(authCore, /provider: 'google'/);
  assert.match(authCore, /signInWithOAuth/);
});

test('password validation requires minimum length and character types', () => {
  assert.match(authCore, /password\.length < 8/);
  assert.match(authCore, /\[A-Za-zÇĞİÖŞÜçğıöşü\]/);
  assert.match(authCore, /\\d/);
});

test('Turkish error messages are defined for common auth errors', () => {
  assert.match(authCore, /E-posta veya şifre hatalı/);
  assert.match(authCore, /Bu e-posta ile zaten bir hesap var/);
  assert.match(authCore, /Önce e-posta adresini doğrulaman gerekiyor/);
  assert.match(authCore, /Şifre güvenlik koşullarını karşılamıyor/);
  assert.match(authCore, /Çok fazla deneme yapıldı/);
  assert.match(authCore, /Google ile giriş henüz etkin değil/);
  assert.match(authCore, /Sunucuya ulaşılamadı/);
  assert.match(authCore, /Yeni kayıt şu anda kapalı/);
  assert.match(authCore, /Geçerli bir e-posta adresi yaz/);
});

test('OAuth return URL cleanup removes sensitive parameters', () => {
  assert.match(authCore, /function cleanOAuthReturnUrl/);
  assert.match(authCore, /access_token/);
  assert.match(authCore, /refresh_token/);
  assert.match(authCore, /code/);
  assert.match(authCore, /state/);
  assert.match(authCore, /provider_token/);
  assert.match(authCore, /error/);
  assert.match(authCore, /window\.history\.replaceState/);
});

test('auth state change listener handles sign in and sign out events', () => {
  assert.match(authCore, /onAuthStateChange/);
  assert.match(authCore, /SIGNED_IN/);
  assert.match(authCore, /SIGNED_OUT/);
  assert.match(authCore, /INITIAL_SESSION/);
  assert.match(authCore, /USER_UPDATED/);
});

test('session persistence uses dedicated storage key', () => {
  assert.match(authCore, /const CLOUD_AUTH_STORAGE_KEY = 'cinocode_cloud_auth_v1'/);
  assert.match(authCore, /storageKey: CLOUD_AUTH_STORAGE_KEY/);
});

test('auto refresh token is enabled', () => {
  assert.match(authCore, /autoRefreshToken: true/);
});

test('session detection from URL is enabled', () => {
  assert.match(authCore, /detectSessionInUrl: true/);
});

test('cloud account markers are cleared on sign out', () => {
  assert.match(authCore, /function clearCloudAccountMarkers/);
  assert.match(authCore, /cinocode_auth_user_id/);
  assert.match(authCore, /cinocode_auth_email/);
  assert.match(authCore, /cinocode_auth_first_name/);
  assert.match(authCore, /cinocode_auth_last_name/);
});

test('local profile fallback is preserved', () => {
  assert.match(authCore, /function rememberLocalProfile/);
  assert.match(authCore, /function getLocalProfiles/);
  assert.match(authCore, /function localProfileExists/);
});

test('auth modal UI includes all required form fields', () => {
  assert.match(authCore, /id="cloudAuthFirstName"/);
  assert.match(authCore, /id="cloudAuthLastName"/);
  assert.match(authCore, /id="cloudAuthAge"/);
  assert.match(authCore, /id="cloudAuthEmail"/);
  assert.match(authCore, /id="cloudAuthPassword"/);
  assert.match(authCore, /id="cloudAuthPasswordConfirm"/);
  assert.match(authCore, /id="cloudAuthGoogleBtn"/);
});

test('password is never stored in localStorage', () => {
  assert.doesNotMatch(authCore, /localStorage\.setItem\([^\n]*(password|parola|şifre)/i);
});

test('service role key is not exposed in frontend code', () => {
  assert.doesNotMatch(authCore, /service_role/i);
  assert.doesNotMatch(authCore, /SERVICE_ROLE/i);
  assert.doesNotMatch(authCore, /serviceRole/i);
});

test('auth mode is tracked in localStorage', () => {
  assert.match(authCore, /const CLOUD_AUTH_MODE_KEY = 'cinocode_auth_mode'/);
  assert.match(authCore, /localStorage\.setItem\(CLOUD_AUTH_MODE_KEY/);
  assert.match(authCore, /localStorage\.getItem\(CLOUD_AUTH_MODE_KEY/);
});

test('redirect URL is generated safely', () => {
  assert.match(authCore, /function getAuthRedirectUrl/);
  assert.match(authCore, /window\.location\.origin/);
  assert.match(authCore, /window\.location\.pathname/);
});

test('auth modal has loading state handling', () => {
  assert.match(authCore, /let busy = false/);
  assert.match(authCore, /function setBusy/);
  assert.match(authCore, /İşleniyor\.\.\./);
});

test('auth modal has error message display', () => {
  assert.match(authCore, /id="localAuthError"/);
  assert.match(authCore, /role="alert"/);
  assert.match(authCore, /aria-live="polite"/);
});

test('auth modal has backend status indicator', () => {
  assert.match(authCore, /id="cloudAuthStatus"/);
  assert.match(authCore, /role="status"/);
  assert.match(authCore, /cc-auth-backend-status/);
});

test('local profile modal is password-free', () => {
  assert.match(authCore, /function openLocalProfileSetupModal/);
  assert.match(authCore, /Bu sürüm yereldir/);
  assert.match(authCore, /Şifre, e-posta doğrulaması ve bulut senkronizasyonu yoktur/);
});

test('auth-core.js is wrapped in IIFE to avoid global pollution', () => {
  assert.match(authCore, /\(function\(window\) \{/);
  assert.match(authCore, /\}\)\(window\);/);
});

test('resetPassword function is exported to window.CinoCodeAuth', () => {
  assert.match(authCore, /resetPassword/);
  assert.match(authCore, /window\.CinoCodeAuth = \{/);
});

test('resetPassword calls resetPasswordForEmail with correct parameters', () => {
  assert.match(authCore, /resetPasswordForEmail/);
  assert.match(authCore, /redirectTo/);
});

test('password reset link exists in auth modal UI', () => {
  assert.match(authCore, /forgotPasswordLink/);
  assert.match(authCore, /Şifremi unuttum/);
});

test('resetPassword uses generic success message to avoid account enumeration', () => {
  assert.match(authCore, /E-posta adresine şifre sıfırlama bağlantısı gönderildi/);
  // Check that we don't reveal account existence in error messages
  assert.doesNotMatch(authCore, /bu e-posta ile kayıtlı hesap yok|hesap bulunamadı|kayıtlı değil|kullanıcı bulunamadı/i);
});
