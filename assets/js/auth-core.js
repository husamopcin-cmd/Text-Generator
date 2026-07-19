// CinoCode Auth Core - Shared Authentication Module
// Provides Supabase Auth + Google OAuth functionality
// Used by main.js and sinavkocu.js

(function(window) {
    'use strict';

    // Constants
    const CLOUD_AUTH_MODE_KEY = 'cinocode_auth_mode';
    const CLOUD_AUTH_STORAGE_KEY = 'cinocode_cloud_auth_v1';

    // State
    let cloudAuthClient = null;
    let cloudAuthConfigPromise = null;

    // Helper functions (shared with sinavkocu.js)
    function normalizeLocalProfileName(name) {
        if (!name) return '';
        return String(name)
            .replace(/[\u0000-\u001f\u007f<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
    }

    function getStoredUserName() {
        let name = null;
        try { name = localStorage.getItem('cinocode_user'); } catch (e) {}
        const normalized = String(name || '')
            .replace(/[\u0000-\u001f\u007f<>]/g, '')
            .replace(/\s+/g, ' ').trim().slice(0, 40);
        return normalized || null;
    }

    function rememberLocalProfile(name) {
        if (!name) return;
        try {
            const LOCAL_PROFILE_REGISTRY_KEY = 'cinocode_local_profiles_v1';
            const normalized = normalizeLocalProfileName(name);
            if (!normalized) return;
            const profiles = getLocalProfiles().filter(item => item.toLocaleLowerCase('tr-TR') !== normalized.toLocaleLowerCase('tr-TR'));
            profiles.unshift(normalized);
            localStorage.setItem(LOCAL_PROFILE_REGISTRY_KEY, JSON.stringify(profiles.slice(0, 10)));
        } catch (e) {}
    }

    function getLocalProfiles() {
        try {
            const LOCAL_PROFILE_REGISTRY_KEY = 'cinocode_local_profiles_v1';
            const stored = localStorage.getItem(LOCAL_PROFILE_REGISTRY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!Array.isArray(parsed)) return [];
                const seen = new Set();
                return parsed.map(normalizeLocalProfileName).filter(name => {
                    const key = name.toLocaleLowerCase('tr-TR');
                    if (!name || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }
        } catch (e) {}
        return [];
    }

    function localProfileExists(name) {
        return getLocalProfiles().includes(name);
    }

    // Auth functions
    function getAuthRedirectUrl() {
        if (!window.location || !window.location.origin || window.location.origin === 'null') return '';
        return window.location.origin + window.location.pathname;
    }

    function cleanOAuthReturnUrl() {
        try {
            if (!window.history || typeof window.history.replaceState !== 'function') return;
            const url = new URL(window.location.href);
            ['code', 'state', 'access_token', 'refresh_token', 'expires_in', 'expires_at',
             'token_type', 'type', 'provider_token', 'provider_refresh_token',
             'error', 'error_code', 'error_description'].forEach(param => url.searchParams.delete(param));
            window.history.replaceState({}, document.title, url.pathname + url.search);
        } catch (e) {}
    }

    function refreshAccountHeaderUi() {
        const nameEl = document.getElementById('loggedInUser');
        const wrapEl = document.getElementById('loggedInUserWrapper');
        if (!nameEl || !wrapEl) return;
        const loggedUser = getStoredUserName();
        if (loggedUser) {
            nameEl.innerText = loggedUser;
            wrapEl.style.display = 'inline';
        } else {
            wrapEl.style.display = 'none';
        }
    }

    function clearCloudAccountMarkers(clearUser = true) {
        const keys = [
            CLOUD_AUTH_MODE_KEY,
            'cinocode_auth_user_id',
            'cinocode_auth_email',
            'cinocode_auth_first_name',
            'cinocode_auth_last_name'
        ];
        keys.forEach(key => localStorage.removeItem(key));
        if (clearUser) localStorage.removeItem('cinocode_user');
    }

    async function loadCloudAuthConfig() {
        if (cloudAuthConfigPromise) return cloudAuthConfigPromise;
        cloudAuthConfigPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            try {
                const response = await fetch('/.netlify/functions/auth-config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                    signal: controller.signal
                });
                const data = await response.json().catch(() => null);
                if (!response.ok || !data || !data.ok) throw new Error('Auth yapılandırması alınamadı.');
                return data;
            } finally {
                clearTimeout(timeoutId);
            }
        })().catch(error => ({ configured: false, missing: [], error }));
        return cloudAuthConfigPromise;
    }

    async function getCloudAuthClient() {
        if (cloudAuthClient) return cloudAuthClient;
        const config = await loadCloudAuthConfig();
        if (!config.configured) return null;
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('Supabase istemcisi yüklenemedi. İnternet bağlantısını kontrol et.');
        }
        cloudAuthClient = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                storageKey: CLOUD_AUTH_STORAGE_KEY
            }
        });
        // Client memoize edildiği için bu dinleyici yalnızca bir kez kaydedilir.
        cloudAuthClient.auth.onAuthStateChange((event, session) => {
            if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') && session && session.user) {
                applyCloudAccount(session.user);
                refreshAccountHeaderUi();
                const overlay = document.getElementById('localAuthOverlay');
                if (overlay) {
                    overlay.remove();
                    document.body.classList.remove('cc-auth-open');
                }
            } else if (event === 'SIGNED_OUT') {
                clearCloudAccountMarkers(true);
                refreshAccountHeaderUi();
            }
        });
        return cloudAuthClient;
    }

    function applyCloudAccount(user) {
        if (!user) return null;
        const metadata = user.user_metadata || {};
        const firstName = normalizeLocalProfileName(metadata.first_name || metadata.given_name || '');
        const lastName = normalizeLocalProfileName(metadata.last_name || metadata.family_name || '');
        const fallbackName = String(user.email || '').split('@')[0];
        const displayName = normalizeLocalProfileName(metadata.full_name || metadata.name || [firstName, lastName].filter(Boolean).join(' ') || fallbackName || 'CinoCode Kullanıcısı');
        const age = Number(metadata.age);

        localStorage.setItem('cinocode_user', displayName);
        localStorage.setItem(CLOUD_AUTH_MODE_KEY, 'cloud');
        localStorage.setItem('cinocode_auth_user_id', String(user.id || ''));
        localStorage.setItem('cinocode_auth_email', String(user.email || ''));
        if (firstName) localStorage.setItem('cinocode_auth_first_name', firstName);
        if (lastName) localStorage.setItem('cinocode_auth_last_name', lastName);
        if (Number.isFinite(age) && age >= 1 && age <= 120) localStorage.setItem('cinocode_user_age', String(age));
        rememberLocalProfile(displayName);
        return { displayName, email: String(user.email || '') };
    }

    async function initializeAccountSession() {
        const mode = localStorage.getItem(CLOUD_AUTH_MODE_KEY) || '';
        const hasOAuthReturn = /(?:^|[?#&])(access_token|refresh_token|code)=/i.test(window.location.href);
        const loggedUser = getStoredUserName();
        
        if (loggedUser && mode !== 'cloud' && mode !== 'cloud-pending' && !hasOAuthReturn) {
            localStorage.setItem(CLOUD_AUTH_MODE_KEY, 'local');
            return { configured: null, authenticated: true, mode: 'local' };
        }

        const client = await getCloudAuthClient();
        if (!client) return { configured: false, authenticated: Boolean(loggedUser), mode: mode || 'none' };
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const user = data && data.session && data.session.user;
        if (hasOAuthReturn) cleanOAuthReturnUrl();
        if (user) {
            applyCloudAccount(user);
            return { configured: true, authenticated: true, mode: 'cloud' };
        }
        if (mode === 'cloud' || mode === 'cloud-pending') {
            clearCloudAccountMarkers(true);
        }
        return { configured: true, authenticated: false, mode: 'cloud' };
    }

    async function signOutAccountSession() {
        const mode = localStorage.getItem(CLOUD_AUTH_MODE_KEY) || 'local';
        const loggedUser = getStoredUserName();
        
        if (mode === 'cloud' || mode === 'cloud-pending') {
            try {
                const client = await getCloudAuthClient();
                if (client) await client.auth.signOut();
            } catch (error) {
                console.warn('Cloud sign-out failed', error);
                localStorage.removeItem(CLOUD_AUTH_STORAGE_KEY);
            }
            clearCloudAccountMarkers(true);
        } else {
            if (loggedUser) rememberLocalProfile(loggedUser);
            localStorage.removeItem('cinocode_user');
            localStorage.removeItem(CLOUD_AUTH_MODE_KEY);
        }
        window.location.reload();
    }

    async function resetPassword(email) {
        if (!email || typeof email !== 'string') {
            throw new Error('Geçerli bir e-posta adresi gerekli.');
        }
        const client = await getCloudAuthClient();
        if (!client) {
            throw new Error('Bulut hesap sistemi kullanılamıyor.');
        }
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: getAuthRedirectUrl() || undefined
        });
        if (error) throw error;
        return { success: true };
    }

    function translateAuthError(error) {
        const message = String(error && error.message || error || 'Kimlik doğrulama başarısız.');
        if (/invalid login credentials/i.test(message)) return 'E-posta veya şifre hatalı.';
        if (/user already registered/i.test(message)) return 'Bu e-posta ile zaten bir hesap var. Giriş Yap sekmesini kullan.';
        if (/email not confirmed/i.test(message)) return 'Önce e-posta adresini doğrulaman gerekiyor.';
        if (/password should be/i.test(message)) return 'Şifre güvenlik koşullarını karşılamıyor.';
        if (/rate limit|too many requests/i.test(message)) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
        if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google ile giriş henüz etkin değil. Supabase panelinde Google sağlayıcısının yapılandırılması gerekiyor.';
        if (/failed to fetch|networkerror|load failed|abort/i.test(message)) return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dene.';
        if (/signup.*disabled|signups not allowed/i.test(message)) return 'Yeni kayıt şu anda kapalı.';
        if (/invalid email/i.test(message)) return 'Geçerli bir e-posta adresi yaz.';
        return message;
    }

    function openAccountAuthModal(initialMode) {
        const existing = document.getElementById('localAuthOverlay');
        if (existing) existing.remove();
        let mode = initialMode === 'signin' ? 'signin' : 'register';
        let authReady = false;
        let busy = false;

        const overlay = document.createElement('div');
        overlay.id = 'localAuthOverlay';
        overlay.className = 'cc-auth-overlay';
        overlay.innerHTML = `
            <section class="cc-auth-modal cc-auth-cloud" role="dialog" aria-modal="true" aria-labelledby="localAuthTitle">
                <div class="cc-auth-brand"><span class="cc-auth-brand-mark" aria-hidden="true">C</span><span>CinoCode</span><span id="cloudAuthBadge" class="cc-auth-local-badge">Kontrol ediliyor</span></div>
                <h1 id="localAuthTitle">Hesabını Oluştur</h1>
                <p id="localAuthLead" class="cc-auth-lead">Çalışmalarını güvenli bir hesapla başlat.</p>
                <div class="cc-auth-tabs" role="tablist" aria-label="Hesap işlemi">
                    <button type="button" id="localAuthSigninTab" role="tab">Giriş Yap</button>
                    <button type="button" id="localAuthRegisterTab" role="tab">Kayıt Ol</button>
                </div>
                <button type="button" id="cloudAuthGoogleBtn" class="cc-auth-google" disabled><span aria-hidden="true">G</span> Google ile devam et</button>
                <div class="cc-auth-divider"><span>veya e-posta ile</span></div>
                <form id="localAuthForm" novalidate>
                    <div id="cloudAuthNameFields" class="cc-auth-name-grid">
                        <div><label for="cloudAuthFirstName">İsim</label><input id="cloudAuthFirstName" type="text" maxlength="40" autocomplete="given-name" placeholder="CinoCan"></div>
                        <div><label for="cloudAuthLastName">Soyisim</label><input id="cloudAuthLastName" type="text" maxlength="40" autocomplete="family-name" placeholder="Test"></div>
                    </div>
                    <div id="cloudAuthAgeGroup" class="cc-auth-field-group">
                        <label for="cloudAuthAge">Yaş</label>
                        <input id="cloudAuthAge" type="number" min="1" max="120" inputmode="numeric" placeholder="24">
                    </div>
                    <label for="cloudAuthEmail">E-posta <span>(Gmail dahil)</span></label>
                    <input id="cloudAuthEmail" type="email" maxlength="254" autocomplete="email" inputmode="email" placeholder="cino219k@gmail.com" required>
                    <label for="cloudAuthPassword">Şifre</label>
                    <div class="cc-auth-password-row"><input id="cloudAuthPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="En az 8 karakter" required><button type="button" id="cloudAuthPasswordToggle" aria-label="Şifreyi göster" title="Şifreyi göster">Göster</button></div>
                    <button id="forgotPasswordLink" type="button" class="cc-auth-forgot-password">Şifremi unuttum</button>
                    <div id="cloudAuthConfirmGroup" class="cc-auth-field-group">
                        <label for="cloudAuthPasswordConfirm">Şifre tekrarı</label>
                        <input id="cloudAuthPasswordConfirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Şifreni tekrar yaz">
                    </div>
                    <div id="cloudAuthStatus" class="cc-auth-backend-status" role="status">Bulut hesap sistemi kontrol ediliyor...</div>
                    <div id="localAuthError" class="cc-auth-error" role="alert" aria-live="polite"></div>
                    <button id="localAuthSubmit" class="cc-auth-submit" type="submit" disabled>Kayıt Ol ve Başla</button>
                </form>
                <button id="localProfileFallbackBtn" class="cc-auth-secondary" type="button">Bu cihazda yerel profil kullan</button>
                <div class="cc-auth-privacy"><strong>Güvenlik:</strong> Şifren CinoCode koduna veya localStorage'a kaydedilmez; doğrudan Supabase Auth tarafından işlenir. Sohbetlerin bulut senkronizasyonu ayrıca yapılandırılana kadar bu cihazda kalır.</div>
            </section>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('cc-auth-open');

        const title = document.getElementById('localAuthTitle');
        const lead = document.getElementById('localAuthLead');
        const signinTab = document.getElementById('localAuthSigninTab');
        const registerTab = document.getElementById('localAuthRegisterTab');
        const nameFields = document.getElementById('cloudAuthNameFields');
        const ageGroup = document.getElementById('cloudAuthAgeGroup');
        const confirmGroup = document.getElementById('cloudAuthConfirmGroup');
        const emailInput = document.getElementById('cloudAuthEmail');
        const passwordInput = document.getElementById('cloudAuthPassword');
        const passwordConfirm = document.getElementById('cloudAuthPasswordConfirm');
        const error = document.getElementById('localAuthError');
        const status = document.getElementById('cloudAuthStatus');
        const badge = document.getElementById('cloudAuthBadge');
        const submit = document.getElementById('localAuthSubmit');
        const googleButton = document.getElementById('cloudAuthGoogleBtn');
        const forgotPasswordLink = document.getElementById('forgotPasswordLink');

        function setBusy(nextBusy) {
            busy = nextBusy;
            submit.disabled = busy || !authReady;
            googleButton.disabled = busy || !authReady;
            submit.textContent = busy ? 'İşleniyor...' : (mode === 'signin' ? 'Giriş Yap' : 'Kayıt Ol ve Başla');
        }

        function setMode(nextMode) {
            mode = nextMode;
            const signingIn = mode === 'signin';
            signinTab.classList.toggle('active', signingIn);
            registerTab.classList.toggle('active', !signingIn);
            signinTab.setAttribute('aria-selected', String(signingIn));
            registerTab.setAttribute('aria-selected', String(!signingIn));
            title.textContent = signingIn ? 'Tekrar Hoş Geldin' : 'Hesabını Oluştur';
            lead.textContent = signingIn ? 'E-posta adresin veya Google hesabınla devam et.' : 'İsim, iletişim ve güvenlik bilgilerini tamamla.';
            nameFields.hidden = signingIn;
            ageGroup.hidden = signingIn;
            confirmGroup.hidden = signingIn;
            forgotPasswordLink.hidden = !signingIn;
            passwordInput.autocomplete = signingIn ? 'current-password' : 'new-password';
            error.textContent = '';
            setBusy(false);
        }

        signinTab.onclick = () => setMode('signin');
        registerTab.onclick = () => setMode('register');
        document.getElementById('cloudAuthPasswordToggle').onclick = () => {
            const showing = passwordInput.type === 'text';
            passwordInput.type = showing ? 'password' : 'text';
            passwordConfirm.type = showing ? 'password' : 'text';
            document.getElementById('cloudAuthPasswordToggle').textContent = showing ? 'Göster' : 'Gizle';
        };
        document.getElementById('localProfileFallbackBtn').onclick = () => {
            overlay.remove();
            openLocalProfileSetupModal(mode);
        };
        forgotPasswordLink.onclick = async () => {
            if (!authReady || busy) return;
            const email = emailInput.value.trim().toLowerCase();
            if (!emailInput.checkValidity()) {
                error.textContent = 'Geçerli bir e-posta adresi yaz.';
                return;
            }
            setBusy(true);
            error.textContent = '';
            try {
                await resetPassword(email);
                status.className = 'cc-auth-backend-status success';
                status.textContent = 'E-posta adresine şifre sıfırlama bağlantısı gönderildi. Kutunu kontrol et.';
                setBusy(false);
            } catch (resetError) {
                error.textContent = translateAuthError(resetError);
                setBusy(false);
            }
        };

        googleButton.onclick = async () => {
            if (!authReady || busy) return;
            setBusy(true);
            error.textContent = '';
            try {
                const client = await getCloudAuthClient();
                localStorage.setItem(CLOUD_AUTH_MODE_KEY, 'cloud-pending');
                const redirectTo = getAuthRedirectUrl();
                const { error: oauthError } = await client.auth.signInWithOAuth({
                    provider: 'google',
                    options: redirectTo ? { redirectTo } : {}
                });
                if (oauthError) throw oauthError;
            } catch (oauthError) {
                localStorage.removeItem(CLOUD_AUTH_MODE_KEY);
                error.textContent = translateAuthError(oauthError);
                setBusy(false);
            }
        };

        document.getElementById('localAuthForm').onsubmit = async event => {
            event.preventDefault();
            if (!authReady || busy) return;
            error.textContent = '';
            const email = emailInput.value.trim().toLowerCase();
            const password = passwordInput.value;
            if (!emailInput.checkValidity()) {
                error.textContent = 'Geçerli bir e-posta adresi yaz.';
                return;
            }
            if (password.length < 8 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
                error.textContent = 'Şifre en az 8 karakter olmalı ve en az bir harf ile bir rakam içermeli.';
                return;
            }

            setBusy(true);
            try {
                const client = await getCloudAuthClient();
                if (mode === 'signin') {
                    const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
                    if (signInError) throw signInError;
                    applyCloudAccount(data.user);
                    window.location.reload();
                    return;
                }

                const firstName = normalizeLocalProfileName(document.getElementById('cloudAuthFirstName').value);
                const lastName = normalizeLocalProfileName(document.getElementById('cloudAuthLastName').value);
                const age = Number(document.getElementById('cloudAuthAge').value);
                if (firstName.length < 2 || lastName.length < 2) {
                    error.textContent = 'İsim ve soyisim en az 2 karakter olmalı.';
                    setBusy(false);
                    return;
                }
                if (!Number.isFinite(age) || age < 1 || age > 120) {
                    error.textContent = 'Yaş 1 ile 120 arasında olmalı.';
                    setBusy(false);
                    return;
                }
                if (password !== passwordConfirm.value) {
                    error.textContent = 'Şifreler aynı değil.';
                    setBusy(false);
                    return;
                }

                const { data, error: signUpError } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: getAuthRedirectUrl() || undefined,
                        data: { first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`, age }
                    }
                });
                if (signUpError) throw signUpError;
                if (data.session && data.user) {
                    applyCloudAccount(data.user);
                    window.location.reload();
                    return;
                }
                status.className = 'cc-auth-backend-status success';
                status.textContent = 'Kayıt oluşturuldu. E-posta kutundaki doğrulama bağlantısını aç, sonra Giriş Yap sekmesine dön.';
                passwordInput.value = '';
                passwordConfirm.value = '';
                setBusy(false);
            } catch (submitError) {
                error.textContent = translateAuthError(submitError);
                setBusy(false);
            }
        };

        setMode(mode);
        getCloudAuthClient().then(client => {
            authReady = Boolean(client);
            badge.textContent = authReady ? 'Güvenli bulut hesap' : 'Kurulum gerekli';
            badge.classList.toggle('warning', !authReady);
            status.className = 'cc-auth-backend-status' + (authReady ? ' success' : ' warning');
            status.textContent = authReady
                ? 'E-posta/şifre ve Google hesabı kullanıma hazır.'
                : 'Bulut hesap için Netlify\'da SUPABASE_URL ve SUPABASE_PUBLISHABLE_KEY yapılandırılmalı.';
            setBusy(false);
        }).catch(configError => {
            authReady = false;
            badge.textContent = 'Bağlantı hatası';
            badge.classList.add('warning');
            status.className = 'cc-auth-backend-status warning';
            status.textContent = translateAuthError(configError);
            setBusy(false);
        });
    }

    function openLocalProfileSetupModal(initialMode) {
        const existing = document.getElementById('localAuthOverlay');
        if (existing) existing.remove();
        const profiles = getLocalProfiles();
        let mode = initialMode === 'register' || initialMode === 'signin'
            ? initialMode
            : (profiles.length ? 'signin' : 'register');

        const overlay = document.createElement('div');
        overlay.id = 'localAuthOverlay';
        overlay.className = 'cc-auth-overlay';
        overlay.innerHTML = `
            <section class="cc-auth-modal" role="dialog" aria-modal="true" aria-labelledby="localAuthTitle">
                <div class="cc-auth-brand"><span class="cc-auth-brand-mark" aria-hidden="true">C</span><span>CinoCode</span><span class="cc-auth-local-badge">Yerel profil</span></div>
                <h1 id="localAuthTitle">CinoCode'a Başla</h1>
                <p id="localAuthLead" class="cc-auth-lead">Bu cihazdaki çalışma alanına giriş yap.</p>
                <div class="cc-auth-tabs" role="tablist" aria-label="Profil işlemi">
                    <button type="button" id="localAuthSigninTab" role="tab">Giriş Yap</button>
                    <button type="button" id="localAuthRegisterTab" role="tab">Kayıt Ol</button>
                </div>
                <form id="localAuthForm" novalidate>
                    <label for="localAuthName">Görünen isim</label>
                    <input id="localAuthName" name="displayName" type="text" minlength="2" maxlength="40" autocomplete="name" placeholder="Örn: CinoCan" required>
                    <div id="localAuthAgeGroup" class="cc-auth-field-group">
                        <label for="localAuthAge">Yaş <span>(isteğe bağlı)</span></label>
                        <input id="localAuthAge" name="age" type="number" min="1" max="120" inputmode="numeric" placeholder="Örn: 20">
                    </div>
                    <div id="localAuthProfiles" class="cc-auth-profiles" aria-label="Bu cihazdaki profiller"></div>
                    <div id="localAuthError" class="cc-auth-error" role="alert" aria-live="polite"></div>
                    <button id="localAuthSubmit" class="cc-auth-submit" type="submit">Devam Et</button>
                </form>
                <div class="cc-auth-privacy"><strong>Bu sürüm yereldir.</strong> Şifre, e-posta doğrulaması ve bulut senkronizasyonu yoktur. Veriler bu tarayıcıda saklanır.</div>
            </section>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('cc-auth-open');

        const title = document.getElementById('localAuthTitle');
        const lead = document.getElementById('localAuthLead');
        const signinTab = document.getElementById('localAuthSigninTab');
        const registerTab = document.getElementById('localAuthRegisterTab');
        const ageGroup = document.getElementById('localAuthAgeGroup');
        const profileList = document.getElementById('localAuthProfiles');
        const nameInput = document.getElementById('localAuthName');
        const error = document.getElementById('localAuthError');
        const submit = document.getElementById('localAuthSubmit');

        function setMode(nextMode) {
            mode = nextMode;
            const signingIn = mode === 'signin';
            signinTab.classList.toggle('active', signingIn);
            registerTab.classList.toggle('active', !signingIn);
            signinTab.setAttribute('aria-selected', String(signingIn));
            registerTab.setAttribute('aria-selected', String(!signingIn));
            title.textContent = signingIn ? 'Tekrar Hoş Geldin' : 'Yerel Profil Oluştur';
            lead.textContent = signingIn ? 'Bu cihazdaki profilini seç veya görünen ismini yaz.' : 'CinoCode çalışma alanın için bir görünen isim belirle.';
            ageGroup.hidden = signingIn;
            profileList.hidden = !signingIn || profiles.length === 0;
            submit.textContent = signingIn ? 'Giriş Yap' : 'Kayıt Ol ve Başla';
            error.textContent = '';
            nameInput.focus();
        }

        profileList.innerHTML = profiles.length
            ? '<span>Bu cihazdaki profiller</span>' + profiles.map((name, index) => `<button type="button" data-profile-index="${index}">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</button>`).join('')
            : '';
        profileList.addEventListener('click', event => {
            const button = event.target.closest('[data-profile-index]');
            if (!button) return;
            nameInput.value = profiles[Number(button.dataset.profileIndex)] || '';
            nameInput.focus();
        });
        signinTab.onclick = () => setMode('signin');
        registerTab.onclick = () => setMode('register');

        document.getElementById('localAuthForm').onsubmit = event => {
            event.preventDefault();
            const name = normalizeLocalProfileName(nameInput.value);
            if (name.length < 2) {
                error.textContent = 'Görünen isim en az 2 karakter olmalı.';
                return;
            }
            const exists = localProfileExists(name);
            if (mode === 'signin' && !exists) {
                error.textContent = 'Bu cihazda bu isimle kayıtlı profil yok. Kayıt Ol sekmesini kullan.';
                return;
            }
            if (mode === 'register' && exists) {
                error.textContent = 'Bu isimle yerel profil zaten var. Giriş Yap sekmesini kullan.';
                return;
            }
            const age = document.getElementById('localAuthAge').value;
            if (mode === 'register' && age && (Number(age) < 1 || Number(age) > 120)) {
                error.textContent = 'Yaş 1 ile 120 arasında olmalı.';
                return;
            }
            try {
                localStorage.setItem('cinocode_user', name);
                if (mode === 'register' && age) localStorage.setItem('cinocode_user_age', String(Number(age)));
                localStorage.setItem(CLOUD_AUTH_MODE_KEY, 'local');
                rememberLocalProfile(name);
                window.location.reload();
            } catch (storageError) {
                console.error('Local auth failed', storageError);
                error.textContent = 'Tarayıcı yerel depolamaya izin vermedi. Site verisi izinlerini kontrol et.';
            }
        };

        setMode(mode);
    }

    // Export public API
    window.CinoCodeAuth = {
        getStoredUserName,
        rememberLocalProfile,
        getLocalProfiles,
        localProfileExists,
        normalizeLocalProfileName,
        getCloudAuthClient,
        initializeAccountSession,
        signOutAccountSession,
        resetPassword,
        openAccountAuthModal,
        openLocalProfileSetupModal,
        applyCloudAccount,
        clearCloudAccountMarkers,
        translateAuthError,
        loadCloudAuthConfig,
        getAuthRedirectUrl,
        cleanOAuthReturnUrl
    };

})(window);
