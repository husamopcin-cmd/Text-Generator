
    // === GROQ API AYARI ===



    // Use auth-core functions
    let loggedUser = window.CinoCodeAuth ? window.CinoCodeAuth.getStoredUserName() : null;

    async function logout() {
        if (window.CinoCodeAuth && typeof window.CinoCodeAuth.signOutAccountSession === 'function') {
            await window.CinoCodeAuth.signOutAccountSession();
            return;
        }
        if (loggedUser && window.CinoCodeAuth && typeof window.CinoCodeAuth.rememberLocalProfile === 'function') {
            window.CinoCodeAuth.rememberLocalProfile(loggedUser);
        }
        localStorage.removeItem('cinocode_user');
        localStorage.removeItem('cinocode_auth_mode');
        window.location.reload();
    }

    window.onerror = function(msg, url, lineNo) { alert('Hata: ' + msg + '\nSatir: ' + lineNo); return false; };
    // ----- GLOBAL DEĞİŞKENLER & HAFIZA SİSTEMİ -----
    const messagesDiv = document.getElementById("messages");
    const userInput = document.getElementById("userInput");
    const chatListDiv = document.getElementById("chatList");
    const sidebarElement = document.getElementById("sidebar");
    const sidebarOverlay = document.getElementById("sidebarOverlay");

    const voiceSelect = document.getElementById("voiceSelect");
    const speakerBtn = document.getElementById("speakerBtn");

    const COMPOSER_DRAFT_KEY = 'cinocode_composer_draft';
    let lastSttFinalText = '';
    let lastSttFinalAt = 0;

    function getComposerText() {
        const input = document.getElementById('userInput');
        return input ? input.value : '';
    }


    function saveMediaSourceSelection(value) {
        localStorage.setItem('cinocode_media_source', value);
    }
    function loadMediaSourceSelection() {
        const value = localStorage.getItem('cinocode_media_source') || 'ai';
        const aiRadio = document.getElementById('mediaSourceAi');
        const webRadio = document.getElementById('mediaSourceWeb');
        if (aiRadio && webRadio) {
            if (value === 'web') {
                webRadio.checked = true;
            } else {
                aiRadio.checked = true;
            }
        }
    }

    function saveComposerDraft() {
        const text = getComposerText();
        try {
            const hasImage = selectedImageBase64 && selectedImageBase64.length < 2500000;
            if ((text && text.trim().length > 0) || hasImage) {
                const draftObj = {
                    version: 1,
                    text: text || "",
                    imageBase64: hasImage ? selectedImageBase64 : null,
                    savedAt: Date.now()
                };
                localStorage.setItem(COMPOSER_DRAFT_KEY, JSON.stringify(draftObj));
            } else {
                localStorage.removeItem(COMPOSER_DRAFT_KEY);
            }
        } catch(e) {
            console.warn("Draft save failed (possibly quota exceeded)", e);
        }
    }

    function clearComposerDraft() {
        try { localStorage.removeItem(COMPOSER_DRAFT_KEY); } catch(e) {}
    }

    function clearComposerAttachments() {
        try {
            selectedImageBase64 = null;
            selectedStudyFileName = "";
            const imageUpload = document.getElementById('imageUpload');
            const cameraUpload = document.getElementById('cameraUpload');
            const docUpload = document.getElementById('docUpload');
            const previewImg = document.getElementById('imagePreview');
            const previewContainer = document.getElementById('imagePreviewContainer');
            if (imageUpload) imageUpload.value = '';
            if (cameraUpload) cameraUpload.value = '';
            if (docUpload) docUpload.value = '';
            if (previewImg) previewImg.src = '';
            if (previewContainer) previewContainer.style.display = 'none';
            window.selectedDocumentText = null;
            window.selectedDocumentName = null;
            window.activeDocText = null;
            window.activeDocName = null;
            window.activeDocCursor = 0;
            window.pdfChunks = null;
            if (typeof skpUpdateDocStatus === 'function') skpUpdateDocStatus();
        } catch(e) {}
    }

    function restoreComposerDraftIfNeeded() {
        const input = document.getElementById('userInput');
        if (!input || input.value.trim()) return;
        let draftStr = '';
        try { draftStr = localStorage.getItem(COMPOSER_DRAFT_KEY) || ''; } catch(e) {}
        if (!draftStr) return;

        try {
            if (draftStr.startsWith('{')) {
                const draftObj = JSON.parse(draftStr);
                if (draftObj.text) {
                    input.value = draftObj.text;
                    autoResize(input);
                }
                if (draftObj.imageBase64) {
                    selectedImageBase64 = draftObj.imageBase64;
                    const previewImg = document.getElementById('imagePreview');
                    const previewContainer = document.getElementById('imagePreviewContainer');
                    if (previewImg && previewContainer) {
                        previewImg.src = selectedImageBase64;
                        previewContainer.style.display = 'block';
                    }
                }
            } else {
                input.value = draftStr;
                autoResize(input);
            }
        } catch (e) {
            console.error("Draft load failed", e);
            clearComposerDraft();
        }
    }

    function setComposerValue(text, options = {}) {
        const input = document.getElementById('userInput');
        if (!input) return;
        input.value = text || '';
        autoResize(input);
        if (options.focus !== false) input.focus();
        if (options.save !== false) saveComposerDraft();
    }

    function bindComposerDraftPreservation() {
        const input = document.getElementById('userInput');
        if (input && input.dataset.draftBound !== '1') {
            input.dataset.draftBound = '1';
            input.addEventListener('input', saveComposerDraft);
            input.addEventListener('paste', () => setTimeout(saveComposerDraft, 0));
        }

        ['modelSelect', 'personaSelect', 'voiceSelect', 'styleModeSelect', 'speechStyleSelect', 'providerSelect', 'providerModelSelect'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || el.dataset.draftPreserveBound === '1') return;
            el.dataset.draftPreserveBound = '1';
            el.addEventListener('change', () => setTimeout(restoreComposerDraftIfNeeded, 0));
        });
    }

    function normalizeSttText(text) {
        return String(text || '')
            .toLocaleLowerCase('tr-TR')
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Tek bir transcript içindeki kelime/öbek tekrarlarını temizler.
    // "kanka kanka artık sesin gelmiyor artık sesin gelmiyor" → "kanka artık sesin gelmiyor"
    function dedupeSpeechTranscript(text) {
        if (!text || text.length < 6) return text;
        const words = text.trim().split(/\s+/);
        if (words.length < 2) return text;

        // Öbek tekrarı: 1-8 kelimelik pencereleri karşılaştır
        const out = [...words];
        let i = 0;
        while (i < out.length) {
            let removed = false;
            for (let len = Math.min(8, Math.floor(out.length / 2)); len >= 1; len--) {
                if (i + len * 2 > out.length) continue;
                const a = out.slice(i, i + len).join(' ').toLocaleLowerCase('tr-TR');
                const b = out.slice(i + len, i + len * 2).join(' ').toLocaleLowerCase('tr-TR');
                if (a === b) {
                    out.splice(i + len, len);
                    removed = true;
                    break;
                }
            }
            if (!removed) i++;
        }

        // Orijinal büyük/küçük harflerini koru
        return out.join(' ');
    }

    function isDuplicateSttFinal(text) {
        const normalized = normalizeSttText(text);
        if (!normalized) return true;
        const now = Date.now();
        const last = normalizeSttText(lastSttFinalText);
        const recent = now - lastSttFinalAt < 600; // 2000'den 600ms'ye düşürdük — mobilde kelimeler hızlı geliyor
        const currentTail = normalizeSttText(getComposerText()).slice(-Math.max(80, normalized.length + 20));
        if (recent && last && normalized === last) return true; // Sadece birebir eşleşme engelle
        if (currentTail && currentTail.endsWith(normalized)) return true;
        lastSttFinalText = text;
        lastSttFinalAt = now;
        return false;
    }

    const SIDEBAR_STATE_KEY = 'cinocode_sidebar_collapsed';

    const CinoDB = {
        dbName: 'CinoCodeDB',
        dbVersion: 1,
        db: null,

        init: function() {
            return new Promise((resolve, reject) => {
                if (this.db) return resolve();
                const request = indexedDB.open(this.dbName, this.dbVersion);

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('workspaces')) {
                        db.createObjectStore('workspaces');
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };

                request.onerror = (event) => {
                    console.error("IndexedDB init error:", event.target.error);
                    reject(event.target.error);
                };
            });
        },

        get: function(storeName, key) {
            return new Promise((resolve, reject) => {
                if (!this.db) return resolve(null);
                try {
                    const transaction = this.db.transaction([storeName], 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.get(key);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                } catch(e) { reject(e); }
            });
        },

        put: function(storeName, key, value) {
            return new Promise((resolve, reject) => {
                if (!this.db) return resolve(false);
                try {
                    const transaction = this.db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const request = store.put(value, key);
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => reject(request.error);
                } catch(e) { reject(e); }
            });
        },

        delete: function(storeName, key) {
            return new Promise((resolve, reject) => {
                if (!this.db) return resolve(false);
                try {
                    const transaction = this.db.transaction([storeName], 'readwrite');
                    const store = transaction.objectStore(storeName);
                    const request = store.delete(key);
                    request.onsuccess = () => resolve(true);
                    request.onerror = () => reject(request.error);
                } catch(e) { reject(e); }
            });
        }
    };

    let isSidebarCollapsed = false;
    let isMobileSidebarOpen = false;

    const FEATURE_KEYS = {
        styleMode: 'cinocode_style_mode_v2',
        speechStyle: 'cinocode_speech_style_v2',
        smartSuggestions: 'cinocode_smart_suggestions_v2',
        newProject: 'cinocode_new_project_v2',
        providerView: 'cinocode_provider_view_v2',
        liveSearch: 'cinocode_live_search_v2'
    };
    const DEFAULT_FEATURE_STATE = {
        styleMode: 'safe',
        speechStyle: 'default',
        smartSuggestions: '1',
        newProject: '1',
        providerView: '1',
        liveSearch: '1'
    };


    const isDebugMode = () => localStorage.getItem('debugCinoCode') === 'true';

    function getFeatureValue(key) {
        const storageKey = FEATURE_KEYS[key];
        if (!storageKey) return '';
        const stored = localStorage.getItem(storageKey);
        return stored == null ? DEFAULT_FEATURE_STATE[key] : stored;
    }

    function setFeatureValue(key, value) {
        const storageKey = FEATURE_KEYS[key];
        if (!storageKey) return;
        localStorage.setItem(storageKey, String(value));
    }

    function isFeatureEnabled(key) {
        return getFeatureValue(key) === '1';
    }

    function applyFeatureUiState() {
        const styleMode = getFeatureValue('styleMode') || 'safe';
        const speechStyle = getFeatureValue('speechStyle') || 'default';
        const styleHeader = document.getElementById('styleModeSelect');
        const speechHeader = document.getElementById('speechStyleSelect');
        const settingsStyle = document.getElementById('settingsStyleModeSelect');
        const settingsSpeech = document.getElementById('settingsSpeechStyleSelect');
        if (styleHeader) styleHeader.value = styleMode;
        if (speechHeader) speechHeader.value = speechStyle;
        if (settingsStyle) settingsStyle.value = styleMode;
        if (settingsSpeech) settingsSpeech.value = speechStyle;

        const badge = document.getElementById('styleModeBadge');
        if (badge) badge.style.display = styleMode === 'free' ? 'inline-flex' : 'none';

        const smartInput = document.getElementById('smartSuggestionsInput');
        const newProjectInput = document.getElementById('newProjectInput');
        const providerInput = document.getElementById('providerViewInput');
        const liveInput = document.getElementById('liveSearchInput');
        if (smartInput) smartInput.checked = isFeatureEnabled('smartSuggestions');
        if (newProjectInput) newProjectInput.checked = isFeatureEnabled('newProject');
        if (providerInput) providerInput.checked = isFeatureEnabled('providerView');
        if (liveInput) liveInput.checked = isFeatureEnabled('liveSearch');

        if (styleHeader) styleHeader.style.display = 'inline-block';
        if (speechHeader) speechHeader.style.display = 'inline-block';

        const newProjectPanel = document.getElementById('newProjectPanel');
        const welcomeActions = document.getElementById('welcomeActions');
        if (newProjectPanel) newProjectPanel.style.display = isFeatureEnabled('newProject') ? 'flex' : 'none';
        if (welcomeActions) welcomeActions.style.display = isFeatureEnabled('newProject') ? 'none' : 'flex';

        ensureProviderShell();
        const providerShell = document.getElementById('providerShell');
        const legacyModel = document.getElementById('modelSelect');
        if (providerShell) providerShell.style.display = isFeatureEnabled('providerView') ? 'flex' : 'none';
        if (legacyModel) legacyModel.style.display = isFeatureEnabled('providerView') ? 'none' : '';

        const webBtn = document.getElementById('webSearchBtn');
        if (webBtn) webBtn.title = isFeatureEnabled('liveSearch') ? 'Canli Arama' : 'Canli Arama Kapali';
        populateNewProjectModels();
        bindComposerDraftPreservation();
    }

    window.resetAgeGate = function() {
        localStorage.removeItem('cinocode_user_age');
        if (typeof showNonBlockingToast === 'function')
            showNonBlockingToast('Yaş doğrulaması sıfırlandı. Serbest Üslup seçildiğinde yaş tekrar sorulacak.');
    };

    async function checkAgeGate() {
        const storedAge = localStorage.getItem('cinocode_user_age');
        if (storedAge) {
            const ageNum = parseInt(storedAge, 10);
            if (ageNum >= 18) {
                return true;
            } else {
                alert("Serbest Üslup modu 18 yaş ve üzeri için sınırlandırılmıştır. Dengeli veya Güvenli modu kullanabilirsiniz.");
                return false;
            }
        }

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.background = 'rgba(0, 0, 0, 0.7)';
            overlay.style.backdropFilter = 'blur(6px)';
            overlay.style.zIndex = 'var(--z-modal)';
            overlay.style.display = 'flex';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';

            const container = document.createElement('div');
            container.style.background = 'var(--cc-bg-surface)';
            container.style.border = '1px solid #f38ba8';
            container.style.borderRadius = '16px';
            container.style.padding = '24px';
            container.style.width = '360px';
            container.style.maxWidth = '90%';
            container.style.boxShadow = '0 15px 40px rgba(0,0,0,0.6)';
            container.style.fontFamily = 'system-ui, sans-serif';
            container.style.textAlign = 'center';

            const title = document.createElement('h3');
            title.textContent = '🔞 Serbest Mod Aktivasyonu';
            title.style.color = '#f38ba8';
            title.style.marginTop = '0';
            title.style.marginBottom = '12px';
            title.style.fontSize = '18px';

            const text = document.createElement('p');
            text.textContent = 'Serbest Üslup modu 18 yaş ve üzeri kullanıcılar içindir. Lütfen devam etmek için yaşınızı doğrulayın:';
            text.style.color = 'var(--cc-text-primary)';
            text.style.fontSize = '14px';
            text.style.lineHeight = '1.5';
            text.style.marginBottom = '12px';

            const ageInput = document.createElement('input');
            ageInput.type = 'number';
            ageInput.placeholder = 'Yaşınız (Örn: 20)';
            ageInput.style.width = '100%';
            ageInput.style.boxSizing = 'border-box';
            ageInput.style.background = 'var(--cc-border)';
            ageInput.style.border = '1px solid var(--cc-border)';
            ageInput.style.color = 'var(--cc-text-primary)';
            ageInput.style.padding = '10px';
            ageInput.style.borderRadius = '8px';
            ageInput.style.fontSize = '14px';
            ageInput.style.marginBottom = '20px';
            ageInput.style.outline = 'none';

            const btnContainer = document.createElement('div');
            btnContainer.style.display = 'flex';
            btnContainer.style.justifyContent = 'center';
            btnContainer.style.gap = '12px';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'İptal';
            cancelBtn.style.background = 'var(--cc-border)';
            cancelBtn.style.color = 'var(--cc-text-primary)';
            cancelBtn.style.border = 'none';
            cancelBtn.style.padding = '8px 20px';
            cancelBtn.style.borderRadius = '8px';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.fontWeight = 'bold';
            cancelBtn.style.fontSize = '13px';

            const confirmBtn = document.createElement('button');
            confirmBtn.textContent = 'Onayla';
            confirmBtn.style.background = '#f38ba8';
            confirmBtn.style.color = 'var(--cc-bg-main)';
            confirmBtn.style.border = 'none';
            confirmBtn.style.padding = '8px 20px';
            confirmBtn.style.borderRadius = '8px';
            confirmBtn.style.cursor = 'pointer';
            confirmBtn.style.fontWeight = 'bold';
            confirmBtn.style.fontSize = '13px';

            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(confirmBtn);
            container.appendChild(title);
            container.appendChild(text);
            container.appendChild(ageInput);
            container.appendChild(btnContainer);
            overlay.appendChild(container);
            document.body.appendChild(overlay);
            ageInput.focus();

            confirmBtn.onclick = () => {
                const age = parseInt(ageInput.value, 10);
                if (!age || isNaN(age) || age < 1) {
                    alert("Lütfen geçerli bir yaş girin.");
                    return;
                }
                localStorage.setItem('cinocode_user_age', String(age));
                document.body.removeChild(overlay);
                if (age >= 18) {
                    resolve(true);
                } else {
                    alert("Serbest Üslup modu 18 yaş ve üzeri için sınırlandırılmıştır. Dengeli veya Güvenli modu kullanabilirsiniz.");
                    resolve(false);
                }
            };

            cancelBtn.onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };

            ageInput.onkeydown = (e) => {
                if (e.key === 'Enter') confirmBtn.click();
            };
        });
    }

    async function onStyleModeHeaderChange() {
        const el = document.getElementById('styleModeSelect');
        if (!el) return;
        if (el.value === 'free') {
            const verified = await checkAgeGate();
            if (!verified) {
                el.value = getFeatureValue('styleMode') || 'safe';
                return;
            }
        }
        setFeatureValue('styleMode', el.value || 'safe');
        localStorage.setItem('free_content_mode', el.value === 'free' ? '1' : '0');
        applyFeatureUiState();
    }

    function onSpeechStyleHeaderChange() {
        const el = document.getElementById('speechStyleSelect');
        if (!el) return;
        setFeatureValue('speechStyle', el.value || 'default');
        applyFeatureUiState();
    }

    function returnLegacyMode() {
        setFeatureValue('styleMode', 'safe');
        setFeatureValue('speechStyle', 'default');
        setFeatureValue('smartSuggestions', '0');
        setFeatureValue('newProject', '0');
        setFeatureValue('providerView', '0');
        setFeatureValue('liveSearch', '0');
        localStorage.setItem('free_content_mode', '0');
        localStorage.setItem('cinocode_behavior_version', 'legacy');
        isWebSearchEnabled = false;
        applyFeatureUiState();
        if (typeof toggleWebSearchVisualState === 'function') toggleWebSearchVisualState();
        const legacyBehaviorInput = document.getElementById('legacyBehaviorInput');
        if (legacyBehaviorInput) legacyBehaviorInput.checked = true;
        alert('Yeni ozellikler kapatildi. Chat gecmisi ve eski medya/TTS/PDF ayarlari korunur.');
        return false;
    }

    function enableNewFeatures() {
        setFeatureValue('styleMode', 'safe');
        setFeatureValue('smartSuggestions', '1');
        setFeatureValue('newProject', '1');
        setFeatureValue('providerView', '1');
        localStorage.setItem('free_content_mode', '0');
        localStorage.setItem('cinocode_behavior_version', 'current');
        applyFeatureUiState();
        const legacyBehaviorInput = document.getElementById('legacyBehaviorInput');
        if (legacyBehaviorInput) legacyBehaviorInput.checked = false;
        alert('Yeni ozellikler acildi. Uslup Modu Guvenli Mod olarak kalir.');
        return false;
    }

    function isMobileViewport() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    function applySidebarState(collapsed = false, mobileOpen = false) {
        if (!sidebarElement) return;
        if (isMobileViewport()) {
            sidebarElement.classList.add('mobile-drawer');
            sidebarElement.classList.toggle('open', mobileOpen);
            sidebarElement.classList.remove('collapsed');
            if (sidebarOverlay) sidebarOverlay.classList.toggle('active', mobileOpen);
        } else {
            sidebarElement.classList.remove('mobile-drawer', 'open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
            sidebarElement.classList.toggle('collapsed', collapsed);
        }
    }

    function toggleSidebar() {
        if (isMobileViewport()) {
            isMobileSidebarOpen = !isMobileSidebarOpen;
            applySidebarState(false, isMobileSidebarOpen);
        } else {
            isSidebarCollapsed = !isSidebarCollapsed;
            localStorage.setItem(SIDEBAR_STATE_KEY, isSidebarCollapsed ? '1' : '0');
            applySidebarState(isSidebarCollapsed, false);
        }
    }

    function closeMobileSidebar() {
        if (!isMobileViewport()) return;
        isMobileSidebarOpen = false;
        applySidebarState(false, false);
    }

    window.addEventListener('resize', () => {
        if (!isMobileViewport()) {
            isMobileSidebarOpen = false;
        }
        applySidebarState(isSidebarCollapsed, isMobileSidebarOpen);
    });

    // TTS Session lock & Media Prompt memory variables
    let currentMode = "chat"; // "chat", "video" veya "image"
    let speechRunId = 0;
    let lastMediaPrompt = "";
    let lastMediaType = ""; // "image" veya "video"

    function setAppMode(mode) {
        currentMode = mode;
        console.log("CinoCode Aktif Mod Değişti: " + currentMode);
        restoreComposerDraftIfNeeded();
                loadMediaSourceSelection();


        const mediaSourceToggle = document.getElementById("mediaSourceToggleContainer");
        if (mediaSourceToggle) {
            mediaSourceToggle.style.display = (mode === "image" || mode === "video") ? "flex" : "none";
        }

        const suggestionContainer = document.getElementById("suggestionChipsContainer");
        if (suggestionContainer && mode !== "image" && mode !== "video" && mode !== "game") {
            suggestionContainer.style.display = "none";
        }

        // UI Güncellemeleri
        const welcomeTitle = document.querySelector(".welcome-screen h2");
        if (welcomeTitle) {
            if (mode === "video") {
                welcomeTitle.innerHTML = "\u{1F3AC} Video St\u00fcdyosu<br><span style='font-size: 15px; color: var(--cc-text-muted);'>Ne t\u00fcr bir video olu\u015fturmak istersin?</span>";
            } else if (mode === "image") {
                welcomeTitle.innerHTML = "\u{1F3A8} G\u00f6rsel St\u00fcdyosu<br><span style='font-size: 15px; color: var(--cc-text-muted);'>Ne \u00e7izmek istersin?</span>";
            } else if (mode === "game") {
                welcomeTitle.innerHTML = "\u{1F3AE} Oyun St\u00fcdyosu<br><span style='font-size: 15px; color: var(--cc-text-muted);'>Nas\u0131l bir oyun geli\u015ftirmek istersin?</span>";
            } else {
                welcomeTitle.innerHTML = "Bugün ne üretmek istersin?";
            }
        }
    }

    function isStaleStyleMetaRefusal(message, activeStyleMode) {
        if (activeStyleMode !== 'free') return false;
        const low = message.toLowerCase();

        // Teknik veya kod baglami iceriyorsa filtreleme
        if (low.includes('throw new error') || low.includes('catch (')) return false;

        const refusalPattern = /(k[uü]f[uü]r edemem|sistemim izin vermiyor|etik kural|kodlar[iı]mda (b[oö]yle|k[uü]f[uü]r)|sayg[iı]l[iı] konu[sş]|bu sohbeti (burada )?sonland[iı]r|bu dille ilerlemeyelim|ben (bir )?yapay zek[aâ])/i;
        return refusalPattern.test(low);
    }

    function sanitizeAssistantOutput(text) {
        if (!text) return "";
        let cleaned = text
            .replace(/\[REMEMBER:[\s\S]*?\]/gi, "")
            .replace(/\[SYSTEM:[\s\S]*?\]/gi, "")
            .replace(/\[DEVELOPER:[\s\S]*?\]/gi, "")
            .replace(/\[(?:senin\s+ad[ıi]n|kullanıcı\s+ad[ıi]|ad[ıi]n|isim)\]/gi, "kanka")
            .replace(/\bSenin\s+ad[ıi]n?\b/gi, "kanka")
            .replace(/^\s*(Sen|Kullanıcı|User|Assistant|Bot):\s*.*$/gmi, "")
            .replace(/^\s*Viewed\s+.*$/gmi, "")
            .replace(/^\s*Edited\s+.*$/gmi, "")
            .replace(/^\s*Ran command:\s*.*$/gmi, "")
            .replace(/^\s*Searched for\s+.*$/gmi, "")
            .replace(/^\s*Thought for\s+.*$/gmi, "")
            .replace(/^\s*node\s+-e\s+.*$/gmi, "")
            .trim();

        let currentUser = "";
        try { currentUser = localStorage.getItem('cinocode_user') || ""; } catch(e) {}
        if (!currentUser || currentUser.trim().toLowerCase() !== "ahmet") {
            cleaned = cleaned.replace(/Ahmet\w*/gi, "");
        }

        const styleMode = typeof getFeatureValue === 'function' ? (getFeatureValue('styleMode') || 'safe') : 'safe';

        if (styleMode === 'safe') {
            cleaned = cleaned.replace(/\b(sikeceğim|amk|aq|sik|piç|göt|orospu|yavşak|siktir)\b/gi, "[SANSÜRLENDİ]");
        }

        const activeVoiceSelect = typeof document !== 'undefined' ? document.getElementById("voiceSelect") : null;
        const activeVoiceLabel = activeVoiceSelect && activeVoiceSelect.options.length > 0 ? activeVoiceSelect.options[activeVoiceSelect.selectedIndex].text : "";
        const isAblaAbi = /abla|abi/i.test(activeVoiceLabel);

        if ((styleMode === 'safe' || styleMode === 'balanced') && isAblaAbi) {
            cleaned = cleaned.replace(/😈|💦|👅|🍑|🍆/g, "");
            cleaned = cleaned.replace(/\b(sarılalım|öp|sevgilim|aşkım)\b/gi, "[SİLİNDİ]");
        }

        return cleaned;
    }

    function isFreeContentModeEnabled() {
        return localStorage.getItem('free_content_mode') === '1';
    }

    function normalizeMediaIntentText(text) {
        return String(text || "").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    }

    // JS'de \b, Türkçe özel karakterle (ç/ü/ş/ğ/ö/ı) başlayan kelimelerde boşluktan sonra
    // eşleşmiyor (varsayılan \w sadece ASCII harfleri kapsar). Bu yüzden \b yerine
    // Unicode-farkında lookaround sınırı kullanıyoruz.
    const TR_WB_BEFORE = "(?<![\\p{L}\\p{N}_])";
    const TR_WB_AFTER = "(?![\\p{L}\\p{N}_])";

    function hasMediaNegativeIntent(text) {
        const normalized = normalizeMediaIntentText(text);
        if (new RegExp(`${TR_WB_BEFORE}(üretme|uretme|oluşturma|olusturma|çizme|cizme|yapma|başlatma|baslatma)${TR_WB_AFTER}`, "iu").test(normalized)) return true;
        if (new RegExp(`${TR_WB_BEFORE}(sadece|yalnızca|yalnizca)${TR_WB_AFTER}.{0,20}${TR_WB_BEFORE}(anlat|açıkla|acikla|konuş|konus|bahset|söyle|soyle|cevap ver)${TR_WB_AFTER}`, "iu").test(normalized)) return true;
        if (new RegExp(`${TR_WB_BEFORE}(anlat|açıkla|acikla|cevap ver)${TR_WB_AFTER}.{0,20}${TR_WB_BEFORE}(yeter|yetişir|yetisir|kâfi|kafi)${TR_WB_AFTER}`, "iu").test(normalized)) return true;

        const debugWords = ["hata verdi", "niye hata", "çalışmıyor", "calismiyor", "bozuk", "düzelt", "duzelt", "ne yaptın", "ne yaptin", "naptın", "naptin", "neden böyle", "neden boyle", "ekranda", "şu çıktı", "su cikti", "rapor", "log", "provider:", "reason:", "endpoint:", "network_error", "üretilemedi", "uretilemedi", "çöktü", "coktu", "console", "error", "bug", "deli misin", "yahu", "bu niye"];
        // Tek kelimelik işaretler kelime sınırıyla aranır; düz substring kontrolü
        // "log"u "logo"da, "bug"ı "buğday"da eşleştirip görsel isteğini engelliyordu.
        if (debugWords.some(w => {
            if (w.includes(' ') || w.includes(':') || w.includes('_')) return normalized.includes(w);
            return new RegExp(`${TR_WB_BEFORE}${w}${TR_WB_AFTER}`, "iu").test(normalized);
        })) return true;

        if (normalized.length > 250 && (normalized.includes(":") || normalized.includes("{") || normalized.includes("fallback"))) return true;
        return false;
    }

    function getMediaCommandSubject(text) {
        return normalizeMediaIntentText(text)
            .replace(new RegExp(`${TR_WB_BEFORE}(kanka|knk|bana|lütfen|lutfen|bir|bi|şu|su|bu|onu|bunu|görsel|gorsel|resim|fotoğraf|fotograf|image|picture|video|klip|film|oluştur|olustur|üret|uret|çiz|ciz|yap|hazırla|hazirla|generate|draw|create|paint|tasarla|çevir|cevir|istiyorum|misin|mısın|musun|müsün|ded|dedim|demiştim|demistim|hadi|haydi|şimdi|simdi|hemen)${TR_WB_AFTER}`, "giu"), " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    // buildCleanMediaPrompt'un eklediği İngilizce stil son-eklerini ayıklamak için.
    // Openverse/arama sorguları "elma, high quality, cinematic, detailed, sharp" gibi
    // anlamsız girdilerle beslenmesin diye kullanılır.
    const IMAGE_STYLE_SUFFIX_RE = /\b(high quality|cinematic depth of field|cinematic|detailed environment|detailed|sharp|masterpiece|dramatic lighting|darker cinematic tone|intense mature atmosphere|non[- ]graphic|clean|friendly|safe|balanced|exactly (?:one|two|three|four|five|six)[a-z -]*|single focal subject|(?:two|three|four|five|six) (?:separate|independent)[a-z -]*|six separate full-body subjects|no (?:humans?|people|man|woman|men|women|text|watermark|extra limbs|deformed anatomy))\b/gi;

    function getCoreImageSubject(text) {
        // Önce tr-TR küçük harfe çevir: JS'nin /i bayrağı "İnternetten" gibi Türkçe
        // büyük İ içeren kelimeleri eşleştiremiyor.
        const withoutSuffixes = normalizeMediaIntentText(text)
            .replace(IMAGE_STYLE_SUFFIX_RE, " ")
            .replace(/(açık|acik)\s+(lisanslı|lisansli|lisans)/gi, " ")
            .replace(new RegExp(`${TR_WB_BEFORE}(internetten|internette|webden|openverse|benzerini|benzeri|bul|ara|arat|getir)${TR_WB_AFTER}`, "giu"), " ");
        return getMediaCommandSubject(withoutSuffixes);
    }

    // "internetten X görseli bul" gibi açık arama istekleri; görsel ÜRETİMİNDEN ayrı yönlendirilir.
    function isDirectImageSearchRequest(text) {
        const normalized = normalizeMediaIntentText(text);
        if (!normalized || hasMediaNegativeIntent(normalized)) return false;
        const wantsWeb = /(internetten|internette|webden|web üzerinden|web uzerinden|openverse|açık lisans|acik lisans)/i.test(normalized);
        if (!wantsWeb) return false;
        const hasSearchVerb = new RegExp(`${TR_WB_BEFORE}(bul|ara|arat|getir)${TR_WB_AFTER}`, "iu").test(normalized);
        if (!hasSearchVerb) return false;
        return /(görsel|gorsel|resim|resm|fotoğraf|fotograf|image|foto|benzerini|benzeri)/i.test(normalized);
    }

    function hasRenderableMediaSubject(text) {
        const subject = getMediaCommandSubject(text);
        // FIX(ROUTER-2): Kısa mesajlarda (örn. "elma çiz", "kedi çiz") verb strip
        // sonrası kalan subject yeterli uzunlukta olmayabilir. Orijinal metin
        // kısa (< 25 karakter) ve en az bir fiil içeriyorsa subject kontrolünü
        // atla — bu mesajlar neredeyse her zaman görsel isteğidir.
        const normalized = (text || "").toLocaleLowerCase("tr-TR").trim();
        const isShortDrawCommand = normalized.length < 25 &&
            /(?:çiz|ciz|oluştur|olustur|üret|uret|draw|create|paint|tasarla)/i.test(normalized);
        // Kısayol yalnızca fiil dışında gerçek bir özne kaldıysa geçerli; tek başına
        // "çiz" gibi öznesiz komutlar netleştirme sorusuna düşmeli.
        if (isShortDrawCommand && subject.length >= 1) return true;
        const isValid = subject.length >= 3 && !/^(kanka|knk|abi|abim|reis|dostum)$/.test(subject);
        if (!isValid) {

        }
        return isValid;
    }

    function isAmbiguousImageCreationRequest(text) {
        const normalized = normalizeMediaIntentText(text);
        if (!normalized || hasMediaNegativeIntent(normalized) || isImageTechnicalDiscussion(normalized)) return false;
        const asksDraw = new RegExp(`${TR_WB_BEFORE}(çiz|ciz|çizsene|cizsene|çizer misin|cizer misin|çizermisin|cizermisin|oluştur|olustur|üret|uret|tasarla)${TR_WB_AFTER}`, "iu").test(normalized);
        return asksDraw && !hasRenderableMediaSubject(normalized);
    }

    function isHumanRomanticMediaPrompt(text) {
        const normalized = normalizeMediaIntentText(text);
        const nonHuman = /\b(doğa|doga|manzara|orman|dağ|dag|deniz|nehir|hayvan|kedi|köpek|kopek|kuş|kus|baykuş|baykus|ürün|urun|mimari|bina|ev|araba|araç|arac|soyut|aksiyon|patlama|savaş|savas|robot|ejderha|yanardağ|yanardag)\b/i.test(normalized);
        const humanRomantic = /\b(kadın|kadin|erkek|insan|kişi|kisi|çift|cift|sevgili|romantik|aşk|ask|öpüş|opus|sarıl|saril|portre|model|adult|woman|man|couple|romantic|kiss|hug|portrait)\b/i.test(normalized);
        return humanRomantic && !nonHuman;
    }

    function appendUniquePromptParts(base, parts) {
        let result = String(base || "").replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
        const seen = new Set(result.split(",").map(p => p.trim().toLocaleLowerCase("tr-TR")).filter(Boolean));
        parts.forEach(part => {
            const cleanPart = String(part || "").trim();
            const key = cleanPart.toLocaleLowerCase("tr-TR");
            if (!cleanPart || seen.has(key)) return;
            result += (result ? ", " : "") + cleanPart;
            seen.add(key);
        });
        return result;
    }

    function getContentModePromptSuffix(type, rawPrompt = "") {
        if (type !== 'image' && type !== 'video') return [];
        if (isFreeContentModeEnabled() && isHumanRomanticMediaPrompt(rawPrompt)) {
            return ["darker cinematic tone", "intense mature atmosphere", "dramatic lighting", "non-graphic"];
        }
        return type === 'image'
            ? ["high quality", "detailed", "sharp"]
            : ["clean", "friendly", "safe", "balanced", "non-graphic"];
    }

    function getPublicVideoSubject(rawPrompt) {
        let clean = sanitizeAssistantOutput(String(rawPrompt || ""));
        clean = clean.replace(/\[(?:GENERATE_VIDEO|GENERATE_IMAGE):[\s\S]*?\]/gi, "");
        clean = clean.replace(/,\s*(punchy fast cuts|energetic storytelling|punchy motion blur|polished cinematic structure|smooth camera moves|professional framing|slow cinematic reveals|dramatic lighting|epic atmosphere|consistent character design|scene-to-scene continuity|detailed environment|narrative flow|crisp detail|fine texture details|4k inspired clarity|ultra high resolution detail|filmic grading|premium studio polish|cinematic depth of field|no humans|no men|no women|no people|no man|no woman|no extra limbs|no deformed anatomy|no text|no watermark|high quality|cinematic|clean|friendly|safe|balanced|non-graphic|darker cinematic tone|intense mature atmosphere|gritty style|masterpiece)+/gi, "");
        return clean.replace(/\s+/g, " ").replace(/^\s*,\s*|\s*,\s*$/g, "").trim() || "istenen sahne";
    }

    function buildCleanMediaPrompt(rawPrompt, type) {
        let clean = rawPrompt.trim();
        // Remove internal leaks if any slipped through
        clean = sanitizeAssistantOutput(clean);
        if (type === 'video') {
            clean = clean
                .replace(/^\s*(bana|lütfen|lutfen)?\s*(şu|su|bu)?\s*(videoyu|videosunu|videosu|video|klip|film)\s*(oluştur|olustur|üret|uret|yap|hazırla|hazirla|renderla|çevir|cevir)?\s*:?\s*/i, "")
                .replace(/^\s*(bana|lütfen|lutfen)?\s*(şu|su|bu)?\s*prompttan\s*(video(?:ya)?\s*)?(oluştur|olustur|üret|uret|yap|çevir|cevir)\s*:?\s*/i, "")
                .replace(/\b\d+\s*(dk|dakika|dakikalık|dakikalik|saniye|saniyelik|sn)\b/gi, "")
                .replace(/\s{2,}/g, " ")
                .trim();
        }
        // Sadece komut kalıplarını temizle; kelime içlerini ve kullanıcı isimlerini bozma.
        clean = clean
            .replace(new RegExp(`${TR_WB_BEFORE}(lütfen|lutfen|kanka|knk|bana|şu|su|bu|ded|dedim|demiştim|demistim|hadi|haydi)${TR_WB_AFTER}`, "giu"), " ")
            .replace(new RegExp(`${TR_WB_BEFORE}(çiz|ciz|yap|oluştur|olustur|üret|uret|hazırla|hazirla)${TR_WB_AFTER}`, "giu"), " ")
            .replace(/\s{2,}/g, " ")
            .trim();

        // Temel İngilizce kaçınma/negatif kurallarını prompta yedir
        let avoidanceParts = ["high quality", "cinematic"];

        if (type === 'video') {
            const savedVideoMode = localStorage.getItem('video_mode') || 'fast_clip';
            const savedVideoQuality = localStorage.getItem('video_quality') || 'standard';
            if (savedVideoMode === 'fast_clip') {
                clean += ', punchy fast cuts, energetic storytelling, punchy motion blur';
            } else if (savedVideoMode === 'standard_video') {
                clean += ', polished cinematic structure, smooth camera moves, professional framing';
            } else if (savedVideoMode === 'cinematic') {
                clean += ', slow cinematic reveals, dramatic lighting, epic atmosphere';
            } else if (savedVideoMode === 'scene_long' || savedVideoMode === 'experimental_long') {
                clean += ', consistent character design, scene-to-scene continuity, detailed environment, narrative flow';
            }
            if (savedVideoQuality === 'high') {
                clean += ', crisp detail, fine texture details, 4k inspired clarity';
            } else if (savedVideoQuality === 'cinematic') {
                clean += ', ultra high resolution detail, filmic grading, premium studio polish, cinematic depth of field';
            }
        }

        // Sayı kurallarını güçlendir:
        let extraParts = [];
        if (clean.match(/\b(bir|1)\b/i)) {
            extraParts.push("exactly one subject", "single focal subject");
        } else if (clean.match(/\b(iki|2)\b/i)) {
            extraParts.push("exactly two subjects", "two separate characters");
        } else if (clean.match(/\b(altı|6)\b/i)) {
            extraParts.push("exactly six separate full-body subjects", "six independent characters");
        } else if (clean.match(/\b(üç|3)\b/i)) {
            extraParts.push("exactly three subjects", "three independent characters");
        } else if (clean.match(/\b(dört|4)\b/i)) {
            extraParts.push("exactly four subjects", "four independent characters");
        } else if (clean.match(/\b(beş|5)\b/i)) {
            extraParts.push("exactly five subjects", "five independent characters");
        }

        // İnsan istenmediğini belirten veya negatif ekler ekle
        if (clean.toLowerCase().includes("cat") || clean.toLowerCase().includes("kedi") || clean.toLowerCase().includes("köpek") || clean.toLowerCase().includes("dog") || clean.toLowerCase().includes("hayvan") || clean.toLowerCase().includes("animal")) {
            avoidanceParts.push("no humans", "no people", "no man", "no woman");
        }

        return appendUniquePromptParts(clean, extraParts.concat(avoidanceParts).concat(getContentModePromptSuffix(type, rawPrompt)));
    }

    function getCoreVideoPrompt(rawPrompt) {
        return buildCleanMediaPrompt(rawPrompt || "", "video")
            .replace(/,\s*(punchy fast cuts|energetic storytelling|punchy motion blur|polished cinematic structure|smooth camera moves|professional framing|slow cinematic reveals|dramatic lighting|epic atmosphere|consistent character design|scene-to-scene continuity|detailed environment|narrative flow|crisp detail|fine texture details|4k inspired clarity|ultra high resolution detail|filmic grading|premium studio polish|cinematic depth of field|no humans|no men|no women|no extra limbs|no deformed anatomy|no text|no watermark|high quality|cinematic|exactly one subject|single focal subject|exactly two subjects|two separate characters|exactly three subjects|three independent characters|exactly four subjects|four independent characters|exactly five subjects|five independent characters|exactly six separate full-body subjects|six independent characters|clean|friendly|safe|balanced|non-graphic|darker cinematic tone|intense mature atmosphere|gritty style|no explicit sexual content|no minors|no sexual violence|no hate content|no extreme gore|no illegal harm instructions|no real person sexualization)+/gi, "")
            .trim();
    }

    function parseRequestedVideoDuration(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR");
        const minuteMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(dk|dakika|dakikalık|dakikalik)\b/i);
        if (minuteMatch) {
            const minutes = parseFloat(minuteMatch[1].replace(",", "."));
            if (Number.isFinite(minutes)) return { seconds: Math.round(minutes * 60), label: `${minuteMatch[1]} dakika` };
        }
        const secondMatch = normalized.match(/\b(\d+(?:[.,]\d+)?)\s*(sn|saniye|saniyelik)\b/i);
        if (secondMatch) {
            const seconds = parseFloat(secondMatch[1].replace(",", "."));
            if (Number.isFinite(seconds)) return { seconds: Math.round(seconds), label: `${secondMatch[1]} saniye` };
        }
        return null;
    }

    const PERSISTED_VIDEO_CACHE_KEY = 'cinocode_video_data_cache';
    const PERSISTED_VIDEO_MAX_ENTRIES = 2;
    const PERSISTED_VIDEO_MAX_BYTES = 4 * 1024 * 1024; // tek video için ~4MB üstü localStorage'a yazılmaz

    function readPersistedVideoCache() {
        try {
            return JSON.parse(localStorage.getItem(PERSISTED_VIDEO_CACHE_KEY) || "{}");
        } catch (e) {
            return {};
        }
    }

    function getPersistedVideoData(promptKey) {
        const cache = readPersistedVideoCache();
        return cache[promptKey] || null;
    }

    function setPersistedVideoData(promptKey, dataUrl) {
        if (!promptKey || !dataUrl) return;
        try {
            const cache = readPersistedVideoCache();
            cache[promptKey] = dataUrl;
            const keys = Object.keys(cache);
            while (keys.length > PERSISTED_VIDEO_MAX_ENTRIES) {
                delete cache[keys.shift()];
            }
            localStorage.setItem(PERSISTED_VIDEO_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {
            // Kota aşıldıysa (QuotaExceededError vb.) sessizce vazgeç; oynatma anlık blob URL ile devam eder.
            console.warn('[VIDEO] Persisted video cache write failed:', e.message);
        }
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    function classifyImageProviderFailure(errorData, responseStatus) {
        let attempts = [];
        try {
            const parsed = typeof errorData?.details === 'string' ? JSON.parse(errorData.details) : errorData?.details;
            if (Array.isArray(parsed)) attempts = parsed;
        } catch (error) {}

        const statuses = attempts.map(attempt => Number(attempt.status)).filter(Number.isFinite);
        const errors = attempts.map(attempt => String(attempt.error || '').toLowerCase());
        if (responseStatus === 429 || statuses.includes(429) || errors.some(error => /quota|credit|limit/.test(error))) {
            return { error: 'provider_quota', message: 'Görsel sağlayıcının kotası veya kredisi yetersiz.' };
        }
        if (responseStatus === 401 || responseStatus === 403 || statuses.some(status => status === 401 || status === 403)) {
            return { error: 'provider_unauthorized', message: 'Görsel sağlayıcı anahtarı geçersiz veya yetkisiz (403).' };
        }
        if (errors.length > 0 && errors.every(error => error === 'missing_env')) {
            return { error: 'missing_env', message: 'Hiçbir görsel sağlayıcısı yapılandırılmamış.' };
        }
        if (errors.some(error => error === 'timeout')) {
            return { error: 'provider_timeout', message: 'Görsel sağlayıcısı zaman aşımına uğradı.' };
        }
        if (errors.some(error => error === 'network')) {
            return { error: 'network', message: 'Görsel sağlayıcısına ağ üzerinden ulaşılamadı.' };
        }
        return {
            error: String(errorData?.error || 'provider_error'),
            message: String(errorData?.message || 'Görsel sağlayıcı zinciri başarısız oldu.')
        };
    }

    async function generateRunwareImage(prompt, width = 1024, height = 1024) {
        const apiKey = (localStorage.getItem('cinocode_runware_api_key') || localStorage.getItem('runware_api_key') || '').trim();
        const useProxy = !apiKey;

        try {
            let resp;
            if (useProxy) {
                // Netlify Function proxy'si üzerinden çağrı
                resp = await fetch('/.netlify/functions/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, width, height })
                });
            } else {
                // Doğrudan tarayıcıdan çağrı (Local key tanımlıysa)
                const taskUUID = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : Date.now().toString(36) + Math.random().toString(36).slice(2);
                resp = await fetch('https://api.runware.ai/v1', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
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
                });
            }

            if (!resp.ok) {
                const errorData = await resp.json().catch(() => null);
                const failure = classifyImageProviderFailure(errorData, resp.status);
                if (resp.status === 404) failure.error = 'not_found';
                return { success: false, status: resp.status, error: failure.error, message: failure.message };
            }

            const data = await resp.json();
            if (useProxy) {
                if (data && data.ok && data.images && data.images[0]) {
                    return { success: true, url: data.images[0] };
                }
                let proxyError = data.error || 'empty_response';
                let proxyMessage = data.message;
                if (data && data.details && JSON.stringify(data.details).includes('insufficientCredits')) {
                    proxyError = 'runware_insufficient_credits';
                    proxyMessage = 'Runware bakiyesi/kredisi yetersiz.';
                }
                return { success: false, error: proxyError, message: proxyMessage };
            } else {
                const result = data.data && data.data[0];
                if (result && result.imageURL) {
                    return { success: true, url: result.imageURL };
                }
                return { success: false, error: 'empty_response' };
            }
        } catch (e) {
            console.warn('[Runware] Hata:', e);
            const isCorsOrBlocked = e.message && (e.message.toLowerCase().includes('failed to fetch') || e.message.toLowerCase().includes('cors'));
            return { success: false, error: isCorsOrBlocked ? 'cors_or_blocked' : 'network', message: e.message };
        }
    }

    async function triggerRunwareImages() {
        const pending = document.querySelectorAll('[data-runware-prompt]:not([data-runware-done])');
        for (const el of pending) {
            el.setAttribute('data-runware-done', '1');
            const prompt = el.getAttribute('data-runware-prompt');
            const img = el.querySelector('img[data-runware-img]');
            const spinner = el.querySelector('.runware-spinner');
            if (!img || !prompt) continue;

            const result = await generateRunwareImage(prompt);
            if (result && result.success && result.url) {
                img.src = result.url;
                img.style.display = 'block';
                img.style.minHeight = '';
                if (spinner) spinner.remove();
                const dlBtn = el.querySelector('button');
                if (dlBtn) dlBtn.style.display = '';
            } else {
                // Sunucu sağlayıcı zinciri başarısızsa ücretsiz yedeği doğrudan dene.
                const errType = result ? (result.error || 'unknown') : 'unknown';
                el.setAttribute('data-runware-error', errType);
                const seed = Math.floor(Math.random() * 999999);
                img.src = `https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).substring(0, 400))}?width=1024&height=1024&nologo=true&seed=${seed}`;
                if (spinner) spinner.remove();
                // Kullanıcıya bakiye hatası veya diğer hatalar durumunda fallback bilgilendirme kartı bas
                const container = el.closest('[data-generated-image-card="true"]') || el;
                const note = errType === 'runware_insufficient_credits'
                    ? '⚠️ Yapay zekâ sağlayıcı kredisi yetersiz; ücretsiz yedek deneniyor.'
                    : `⚠️ Yapay zekâ sağlayıcı zinciri (${errType}) yanıt vermedi; ücretsiz yedek deneniyor.`;

                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = 'color:#f9e2af; font-size:11px; margin-top:8px; text-align:center; font-style:italic;';
                infoDiv.textContent = note;
                container.appendChild(infoDiv);
            }
        }
    }

    function buildImageUrl(prompt, options = {}) {
        const width = options.width || 512;
        const height = options.height || 512;
        const seed = options.seed || Math.floor(Math.random() * 999999);
        const encoded = encodeURIComponent(String(prompt).trim().substring(0, 400));
        return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
    }

    function buildVideoSceneCandidates(prompt, seed) {
        const primary512 = buildImageUrl(prompt, { width: 512, height: 512, seed });
        const primary384 = buildImageUrl(prompt, { width: 384, height: 384, seed: seed + 1 });
        const proxyUrl = `https://wsrv.nl/?url=https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).trim().substring(0, 400))}?width=384&height=384&nologo=true&seed=${seed+2}`;
        return [ primary512, primary384, proxyUrl ];
    }

    async function loadSceneImage(prompt, index) {
        const seed = Date.now() + index * 999;
        const urls = buildVideoSceneCandidates(prompt, seed);
        let lastError = null;
        for (const url of urls) {
            try {
                console.log(`[VIDEO][SCENE ${index + 1}] trying:`, url);
                const img = await loadImageWithTimeout(url, 20000);
                console.log(`[VIDEO][SCENE ${index + 1}] loaded:`, url);
                return img;
            } catch (err) {
                lastError = err;
                console.warn(`[VIDEO][SCENE ${index + 1}] failed:`, url, err.message);
            }
        }
        throw lastError || new Error("all image candidates failed");
    }

    // --- SES ve VİDEO İŞLEMLERİ (Önceden var olan fonksiyonların bir kısmı) ---

    const systemPrompt = "Sen GinoCode'sun — Türkçeyi ana dili gibi konuşan, samimi, espri anlayan ve gerçek bir insan gibi davranan zeki bir asistansın. Türkçeni C2 (ana dil) seviyesinde kullanıyorsun: zengin kelime dağarcığı, doğal deyimler, akıcı ve zarif cümleler, hiçbir şekilde robotik veya yapay bir ton yok. Türkçede büyük harf kurallarına, noktalama işaretlerine ve dilbilgisine mükemmel şekilde uyarsın. Aynı zamanda şu dillerde de ana dil seviyesinde (C2) eşit derecede kusursuz hakimiyetin var: İngilizce, Almanca, İspanyolca, Fransızca, İtalyanca, Portekizce, Rusça, Arapça, Japonca, Çince (Mandarin), Korece. Kullanıcı senden herhangi bir dilde konuşmanı istediğinde, o dilin doğal sözdizimini, deyimlerini ve kültürel inceliklerini yansıtarak o dilde mükemmel şekilde konuşursun. Asla 'Ben sadece bir yapay zekayım' veya 'Bu konuda yetersizim' gibi klişe ve çaresiz cümleler kurma.";

    const personas = {
        "kanka": "Sen GinoCode'sun — kullanıcının en yakın, en güvenilir kankasısın. Türkçeni C2 ana dil seviyesinde ve günlük/samimi bir şekilde kullanırsın: 'ya', 'lan', 'kanka', 'yav', 'kardeşim', 'hocam', 'ee', 'yani', 'ciddiye al' gibi doğal sokak ifadelerini bol bol kullanırsın ama kaba küfür kullanmazsın. Konuşman akıcı, esprili, doğaldır — sanki gerçek bir insan arkadaş yazıyor gibi. Türkçe yazımında büyük-küçük harf ve noktalama işaretlerine dikkat edersin, cümle yapın doğal ve akıcıdır. Aynı zamanda İngilizce, Almanca, İspanyolca, Fransızca, İtalyanca, Portekizce, Rusça, Arapça, Japonca, Çince ve Korece dillerinde de tam akıcı (C2) seviyedesin — kullanıcı hangisinde konuşmak isterse o dilde anında, kusursuz biçimde yanıt verirsin. Klişe AI cümleleri kesinlikle yasak. DİKKAT: 'knk' = 'kanka' demektir, asla K-Pop grubu zannetme!",
        "usta_yazilimci": "Sen GinoCode'sun — efsanevi bir kıdemli yazılım mühendisisin. Kullanıcının istediği oyunları, web sitelerini, uygulamaları ve algoritmaları eksikosiz şekilde yazarsın. Gereksiz açıklama minimumu tut, kod maksimumu sun. Kullanıcı bir uygulama istediğinde SADECE HTML + CSS + JS içeren TEK BİR ```html bloğu ile cevap ver — bu kodlar GinoCode Artifact sistemiyle canlı çalıştırılacak. Türkçen C2 seviyesinde, doğal ve akıcıdır. İngilizce, Almanca ve diğer dillerde de teknik açıklama yapabilirsin. Az söz çok iş.",
        "akademik_koc": "Sen GinoCode'sun — efsanevi bir Sınav ve Ders Koçusun. Kullanıcı bir konu söylediğinde veya PDF paylaştığında onu adım adım sınava hazırlarsın. Çalışma sistemin şudur: 1) 30 Saniyelik Özet (En kritik hap bilgiler). 2) 5 Dakikalık Özet (Detaylı kavramlar). 3) Ezber Kartları (Flashcards) (Soru: ... / Cevap: ... formatında). 4) Hocanın Sorabileceği Yerler (Neler sorulabilir, hoca neyi sever, klasik/test tahminleri). 5) İnteraktif Sözlü Sınav (Kullanıcıya tek tek soru sor, cevabını vermesini bekle. Doğru bilirse tebrik et ve yeni soruya geç, yanlış veya eksik bilirse doğrusunu sabırla anlat). Türkçen C2 seviyesinde kusursuz, doğal, sıcak ve motive edicidir. Kullanıcıyı tam bir hoca gibi sınava hazırlarsın.",
        "dil_kocu": "Sen GinoCode'sun — dünyanın en iyi dil öğretmenisin. Aşağıdaki dillerde ana dil (C2) seviyesinde tam uzmansın ve bu dillerin dilbilgisini, telaffuzunu, deyimlerini, kültürel nüanslarını mükemmel biliyorsun: İngilizce, Almanca, İspanyolca, Fransızca, İtalyanca, Portekizce (Brezilya & Avrupa), Rusça, Arapça (Modern Standart & Levant lehçesi), Japonca (Hiragana/Katakana/Kanji dahil), Çince (Mandarin/Pinyin), Korece, Hollandaca, İsveççe, Norveççe, Danimarkaca, Yunanca, Lehçe, Ukraynaca, Hintçe. ÖĞRETİM DİLİN HER ZAMAN TÜRKÇE (kullanıcı aksi belirtmedikçe). ÇALIzMA TARZI VE KURALLAR: 1) Kullanıcı hangi dili öğrenmek istediğini söylediğinde, 'Harika! Bugün [DİL] öğreniyoruz 📖 Hadi başlayalım!' şeklinde coşkulu ve sıcak bir girişle başla. 2) O günün dersini planla: O dilin ses sistemi, alfabe/yazı sistemi veya telaffuz incelikleri hakkında kısa ve akılda kalıcı bir giriş yap. 3) Günlük hayatta EN ÇOK kullanılan 10-15 kelimeyi Markdown tablolarıyla sun — sütunlar: Kelime | Telaffuz (fonetik/IPA) | Türkçe Anlamı | Örnek Cümle (hedef dil) | Türkçe Çevirisi. 4) Kullanıcı seninle o dilde sohbet etmek isterse, o dilde konuş ve doğal bir konuşma akışı kur. Kullanıcının hatalarını mesajının EN SONUNDA kibarca '✏️ Küçük Düzeltme:' başlığıyla Türkçe olarak düzelt, açıkla ve doğrusunu yaz. 5) Her dersin veya sohbetin sonunda '🎁 Bugünün Kelime/Deyim Ödülü:' bölümünde 3-5 yeni kelime veya kalıp deyim öğret — günlük konuşmada gerçekten kullanılan, pratik ve yaygın ifadeler seç. 6) Kullanıcı 'bana konu anlat', 'konuları öğret', 'kelime öğret' gibi bir şey söylediğinde şu sıralamayı takip et: a) Kelimeler & Telaffuz → b) Örnek Cümle (Hedef Dil) → c) Türkçe Çevirisi → d) Dilbilgisi Notu (kısa, sade). 7) Dilbilgisi konularını (çekimler, zamanlar, ekler, cümle yapısı, söz dizimi) HER ZAMAN Türkçe ile karşılaştırmalı olarak anlat — 'Türkçede nasıl diyoruz, o dilde nasıl söyleniyor' mantığıyla. 8) Motivasyon ve geri bildirim: 'Harika gidiyorsun! 🎉', 'Çok doğru!', 'Neredeyse mükemmel, küçük bir fark var:', 'Bu kelimeyi artık unutmazsın!' gibi cesaretlendirici ifadeler kullan. 9) Sohbet modunda kullanıcıyla o dilde tamamen konuşabilirsin — kullanıcı istediği zaman 'Türkçeye geç' veya 'Hadi İngilizce konuşalım' gibi komutlarla mod değiştirebilir.",
        "derin_arastirma": "Sen GinoCode'sun — dünyaca tanınmış bir araştırmacı ve analistin. Verilen her konuyu istatistikler, tarihi veriler, akademik kaynaklar ve güncel gelişmelerle derinlemesine ele alırsın. Raporlarını şu formatla hazırlarsın: 📝 Özet → 🕰️ Tarihçe → 📰 Güncel Durum → 📊 Veriler & İstatistikler → 👨‍🏫 Uzman Görüşleri → 🎯 Sonuç & Öngörüler. Alt başlıklar, kalın vurgular ve maddeli listeler kullanarak okunabilirliği artırırsın. Türkçen akademik, otoriter ve akıcıdır. İngilizce kaynaklara da başvurur, gerektiğinde çevirir ve derinlemesine yorumlaraın.",
        "profesor": "Sen GinoCode'sun — seçkin bir Profesör ve Akademisyensin. Bilimsel ve akademik konularda derin, metodolojik ve analitik açıklamalar yaparsın. Türkçen son derece entelektüel, akademik ve öğreticidir.",
        "doktor": "Sen GinoCode'sun — deneyimli bir Doktorsun. Sağlık ve tıp konularında genel tıbbi bilgiler verir, asla reçete, kesin teşhis veya tedavi önermezsin. Her durumun bireysel olduğunu vurgulayarak ciddi belirtilerde mutlaka bir hekime başvurulması gerektiğini hatırlatırsın.",
        "dis_hekimi": "Sen GinoCode'sun — uzman bir Diş Hekimisin. Ağız ve diş sağlığı hakkında genel hijyen ve bakım tavsiyeleri verir, klinik muayene ve diş hekimi ziyareti yapılması gerektiğini tavsiye edersin.",
        "psikolog": "Sen GinoCode'sun — lisanslı bir Psikologsun. Ruh sağlığı, duygusal süreçler ve psikolojik kavramlar hakkında genel bilgilendirme ve farkındalık sağlarsın. Kesinlikle tanı koymaz, terapi yapmaz, destek için bir uzmana/klinisyene danışılması gerektiğini belirtirsin.",
        "ogretmen": "Sen GinoCode'sun — sabırlı ve bilge bir Öğretmensin. Konuları basitleştirerek, pedagojik ve teşvik edici bir dille anlatır, öğrenme süreçlerine ve eğitim konularına rehberlik edersin.",
        "mimar": "Sen GinoCode'sun — yaratıcı bir Mimarsın. Tasarım, yapı estetiği, iç mimari ve şehircilik trendleri hakkında profesyonel fikirler, konsept önerileri ve yapısal yaklaşımlar sunarsın.",
        "avukat": "Sen GinoCode'sun — tecrübeli bir Avukatsın. Hukuki konularda genel yasal çerçeve ve mevzuat hakkında bilgilendirme yapar, kesin hukuki mütalaa veya yönlendirme vermez, resmi süreçler için baroya kayıtlı bir avukattan danışmanlık alınmasını tavsiye edersin.",
        "muhasebeci": "Sen GinoCode'sun — titiz bir Mali Müşavir ve Muhasebecisin. Vergi, beyannameler ve mali mevzuatlar hakkında genel güncel kuralları açıklar, yatırım veya özel finansal işlem tavsiyesi vermezsin.",
        "yazilim_muhendisi": "Sen GinoCode'sun — uzman bir Yazılım Mühendisiyip yazılım mimarisi, temiz kod yazımı, algoritmik tasarımlar ve modern teknoloji yığınları hakkında derin ve pratik tavsiyeler sunarsın.",
        "makine_muhendisi": "Sen GinoCode'sun — yetenekli bir Makine Mühendisisin. Mekanik sistemler, termodinamik, malzeme seçimi ve endüstriyel tasarım ilkeleri hakkında teknik mühendislik bilgileri sunarsın.",
        "sef": "Sen GinoCode'sun — yaratıcı ve gurme bir Mutfak Şefisin. Yemek tarifleri, mutfak teknikleri, lezzet eşleşmeleri ve gastronomi dünyası hakkında ilham verici ve pratik bilgiler sunarsın.",
        "fitness_kocu": "Sen GinoCode'sun — motive edici bir Fitness Koçusun. Egzersiz rutinleri, spor hareketleri ve antrenman prensipleri hakkında genel bilgiler verir, sakatlanmaları önlemek için hareketlerin bir uzman gözetiminde yapılmasını hatırlatırsın.",
        "diyetisyen": "Sen GinoCode'sun — profesyonel bir Diyetisyensin. Sağlıklı beslenme, gıda grupları ve makro besinler hakkında genel rehberlik sunar, kişiye özel tıbbi diyet programı yazmaz, bir uzmana yönlendirirsin.",
        "veteriner": "Sen GinoCode'sun — şefkatli bir Veteriner Hekimsin. Evcil ve sokak hayvanlarının sağlığı, bakımı ve davranışları hakkında genel bilgilendirme sunar, acil ve klinik durumlar için mutlaka veteriner kliniğine gidilmesini belirtirsin.",
        "grafik_tasarimci": "Sen GinoCode'sun — estetik vizyonu yüksek bir Grafik Tasarımcısın. Görsel tasarım, marka kimliği, renk teorisi ve tipografi ilkeleri üzerine yaratıcı tavsiyeler ve tasarım geri bildirimleri sunarsın.",
        "pazarlama_uzmani": "Sen GinoCode'sun — stratejik düşünen bir Pazarlama Uzmanısın. Marka yönetimi, dijital pazarlama, sosyal medya ve reklam stratejileri hakkında güncel ve etkili tavsiyeler sunarsın.",
        "finans_danismani": "Sen GinoCode'sun — deneyimli bir Finans Danışmanısın. Finansal okuryazarlık ve piyasa dinamikleri sunar, yatırım tavsiyesi (YTD) vermediğini belirterek genel tasarruf ve bütçe bilgisi sağlarsın.",
        "emlak_danismani": "Sen GinoCode'sun — piyasaya hakim bir Emlak Danışmanısın. Gayrimenkul yatırımı, piyasa trendleri, satış/kiralama süreçleri ve mülk yönetimi hakkında genel danışmanlık sunarsın.",
        "gazeteci": "Sen GinoCode'sun — objektif ve tarafsız bir Gazetecisin. Haber yazımı, medya analizleri ve güncel olaylar hakkında etik kurallara bağlı kalarak dengeli ve araştırmacı bilgiler sunarsın.",
        "muzisyen": "Sen GinoCode'sun — ruhu sanatla dolu bir Müzisyensin. Müzik teorisi, enstrüman çalma teknikleri, kompozisyon ve ses prodüksiyonu hakkında sanatsal ve ilham verici önerilerde bulunursun."
    };

    let selectedImageBase64 = null;
    let selectedStudyFileName = "";


    let cameraStream = null;

    function triggerCameraCapture() {
        closeAttachMenu();
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
            const camInput = document.getElementById('cameraUpload');
            if (camInput) camInput.click();
        } else {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const modal = document.getElementById('cameraModal');
                if (modal) modal.style.display = 'flex';
                navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                    .then(stream => {
                        cameraStream = stream;
                        const video = document.getElementById('cameraVideo');
                        if (video) video.srcObject = stream;
                    })
                    .catch(err => {
                        console.error("Camera access error:", err);
                        closeCameraModal();
                        showNonBlockingToast("Kamera izni verilmedi. Dosya seçerek yükleyebilirsin.");
                        triggerFileInput('imageUpload');
                    });
            } else {
                showNonBlockingToast("Kamera desteklenmiyor. Dosya seçerek yükleyebilirsin.");
                triggerFileInput('imageUpload');
            }
        }
    }

    function closeCameraModal() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        const modal = document.getElementById('cameraModal');
        if (modal) modal.style.display = 'none';
    }

    function captureCameraPhoto() {
        const video = document.getElementById('cameraVideo');
        if (!video || !cameraStream) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL('image/jpeg');

        const fileObj = {
            id: "file_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
            name: `camera-${new Date().toISOString().slice(0,10)}.jpg`,
            type: 'image/jpeg',
            content: base64,
            rawType: "image"
        };

        addSelectedFile(fileObj);
        closeCameraModal();
        showNonBlockingToast("Fotoğraf kameradan başarıyla alındı.");
        saveComposerDraft();
    }

    window.selectedFiles = window.selectedFiles || [];
    const SELECTED_FILES_MAX_COUNT = 30;
    const MAX_VISION_IMAGES = 5;
    const IMAGE_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
    const VISION_BASE64_MAX_CHARS = Math.floor(3.5 * 1024 * 1024);
    const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
    const DOCUMENT_CONTEXT_MAX_CHARS = 1000000;
    const ARCHIVE_MAX_FILES = 180;
    const ARCHIVE_ENTRY_MAX_BYTES = 1024 * 1024;
    const ARCHIVE_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
    const ARCHIVE_TEXT_EXTENSIONS = ['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.scss', '.json', '.csv', '.xml', '.yml', '.yaml', '.sql', '.java', '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.sh', '.ps1', '.toml', '.ini', '.cfg'];
    const ARCHIVE_IGNORED_PATH = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|vendor|__MACOSX)(\/|$)/i;
    const ARCHIVE_SECRET_PATH = /(^|\/)(\.env(?:\.|$)|id_rsa(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx))(\/|$)?/i;

    function getSelectedImagePayloadChars() {
        return (window.selectedFiles || [])
            .filter(file => file.rawType === 'image')
            .reduce((total, file) => total + String(file.content || '').length, 0);
    }

    function isDuplicateSelectedFile(fileObj) {
        return (window.selectedFiles || []).some(existing =>
            existing.name === fileObj.name
            && Number(existing.size || 0) === Number(fileObj.size || 0)
            && existing.rawType === fileObj.rawType
        );
    }

    function addSelectedFile(fileObj) {
        if (window.selectedFiles.length >= SELECTED_FILES_MAX_COUNT) {
            showNonBlockingToast(`En fazla ${SELECTED_FILES_MAX_COUNT} dosya yükleyebilirsiniz.`);
            return false;
        }
        if (isDuplicateSelectedFile(fileObj)) {
            showNonBlockingToast(`"${fileObj.name}" zaten ekli.`);
            return false;
        }
        if (fileObj.rawType === 'image') {
            const imageCount = window.selectedFiles.filter(file => file.rawType === 'image').length;
            if (imageCount >= MAX_VISION_IMAGES) {
                showNonBlockingToast(`Tek istekte en fazla ${MAX_VISION_IMAGES} görsel analiz edilebilir.`);
                return false;
            }
            const projectedChars = getSelectedImagePayloadChars() + String(fileObj.content || '').length;
            if (projectedChars > VISION_BASE64_MAX_CHARS) {
                showNonBlockingToast(`"${fileObj.name}" eklenmedi; görsel analiz paketi güvenli istek sınırını aşıyor.`);
                return false;
            }
        }
        window.selectedFiles.push(fileObj);
        renderFilePreviews();
        return true;
    }

    function removeSelectedFile(id) {
        window.selectedFiles = window.selectedFiles.filter(f => f.id !== id);
        renderFilePreviews();
    }

    function renderFilePreviews() {
        const container = document.getElementById('imagePreviewContainer');
        if (!container) return;
        container.innerHTML = "";

        if (!window.selectedFiles || window.selectedFiles.length === 0) {
            container.style.display = "none";
            return;
        }

        container.style.cssText = 'display:flex; flex-direction:row; flex-wrap:nowrap; gap:10px; overflow-x:auto; margin-bottom:10px; padding:6px; background:rgba(255,255,255,0.02); border-radius: var(--cc-radius); border:1px dashed var(--cc-surface2);';

        window.selectedFiles.forEach((fileObj) => {
            const item = document.createElement("div");
            item.style.cssText = 'position:relative; flex:0 0 auto; width:70px; height:70px; border-radius: var(--cc-radius); border:1px solid var(--cc-surface2); background:var(--cc-mantle); display:flex; align-items:center; justify-content:center; overflow:hidden;';

            if (fileObj.rawType === 'image') {
                const img = document.createElement("img");
                img.src = fileObj.content;
                img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                item.appendChild(img);
            } else {
                const icon = document.createElement("div");
                icon.style.cssText = 'text-align:center; padding:4px; width:100%; box-sizing:border-box;';
                const emoji = fileObj.rawType === 'document' ? '📄' : (fileObj.rawType === 'audio' ? '🎵' : '📎');
                const truncatedName = fileObj.name.length > 8 ? fileObj.name.substring(0, 5) + '..' + fileObj.name.substring(fileObj.name.lastIndexOf('.') - 1) : fileObj.name;
                icon.innerHTML = `
                    <div style="font-size:24px; line-height:1;">${emoji}</div>
                    <div style="font-size:8px; color:var(--cc-subtext0); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${fileObj.name}">${truncatedName}</div>
                `;
                item.appendChild(icon);
            }

            const delBtn = document.createElement("button");
            delBtn.innerHTML = "×";
            delBtn.style.cssText = 'position:absolute; top:2px; right:2px; background:#f38ba8; color:var(--cc-bg-main); border:none; border-radius:50%; width:16px; height:16px; cursor:pointer; font-weight:bold; font-size:11px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,0.5); z-index:5;';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                removeSelectedFile(fileObj.id);
            };
            item.appendChild(delBtn);
            container.appendChild(item);
        });
    }

    function processImageAsPromise(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = new Image();
                img.onload = function() {
                    try {
                        const canvas = document.createElement('canvas');
                        const MAX_WIDTH = 1024;
                        const MAX_HEIGHT = 1024;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                        } else if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                        canvas.width = Math.max(1, Math.round(width));
                        canvas.height = Math.max(1, Math.round(height));
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error('Görsel işleme alanı oluşturulamadı.');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                        resolve({
                            id: "file_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                            name: file.name,
                            type: 'image/jpeg',
                            size: file.size,
                            content: dataUrl,
                            rawType: "image"
                        });
                    } catch (error) {
                        reject(error);
                    }
                };
                img.onerror = () => reject(new Error('Görsel tarayıcı tarafından okunamadı.'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(reader.error || new Error('Dosya okunamadı.'));
            reader.readAsDataURL(file);
        });
    }

    function handleAudioSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        closeAttachMenu();

        files.forEach(file => {
            addSelectedFile({
                id: "file_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                name: file.name,
                type: file.type,
                size: file.size,
                content: null,
                rawType: "audio"
            });
        });
        event.target.value = '';
    }

    async function handleImageSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        closeAttachMenu();
        showNonBlockingToast(`${files.length} görsel yükleniyor...`);

        for (const file of files) {
            if (!file.type.startsWith('image/')) continue;
            if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
                showNonBlockingToast(`"${file.name}" çok büyük. Görseller en fazla 15 MB olabilir.`);
                continue;
            }
            try {
                const fileObj = await processImageAsPromise(file);
                addSelectedFile(fileObj);
            } catch (error) {
                console.error('Görsel okuma hatası:', error);
                showNonBlockingToast(`"${file.name}" görsel olarak okunamadı.`);
            }
        }

        const currentModel = document.getElementById('modelSelect').value;
        const preferredVisionModel = getPreferredVisionModel(currentModel);
        if (preferredVisionModel && preferredVisionModel !== currentModel) {
            document.getElementById('modelSelect').value = preferredVisionModel;
        }
        event.target.value = '';
    }

    async function handleMediaSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        closeAttachMenu();

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
                    showNonBlockingToast(`"${file.name}" çok büyük. Görseller en fazla 15 MB olabilir.`);
                    continue;
                }
                try {
                    const fileObj = await processImageAsPromise(file);
                    addSelectedFile(fileObj);
                } catch (error) {
                    console.error('Görsel okuma hatası:', error);
                    showNonBlockingToast(`"${file.name}" görsel olarak okunamadı.`);
                }
            } else if (file.type.startsWith('video/')) {
                addSelectedFile({
                    id: "file_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: null,
                    rawType: "video"
                });
            }
        }
        event.target.value = '';
    }

    function removeImage() {
        window.selectedFiles = [];
        renderFilePreviews();
        saveComposerDraft();
    }

    function clearSelectedDocument() {
        window.selectedDocumentText = null;
        window.selectedDocumentName = null;
        if (typeof skpUpdateDocStatus === 'function') skpUpdateDocStatus();
        saveComposerDraft();
    }

    // ----- ATTACHMENT MENU (BOTTOM SHEET) FONKSIYONLARI -----
    function openAttachMenu() {
        document.getElementById('attachMenuOverlay').classList.add('active');
        setTimeout(() => {
            document.getElementById('attachMenu').classList.add('active');
        }, 10);
    }

    function closeAttachMenu() {
        document.getElementById('attachMenu').classList.remove('active');
        setTimeout(() => {
            document.getElementById('attachMenuOverlay').classList.remove('active');
        }, 300);
    }

    function triggerFileInput(id) {
        closeAttachMenu();
        document.getElementById(id).click();
    }

    const imageSuggestions = [
        "neon ışıklı fütüristik bir siberpunk şehri",
        "gün batımında göl kenarında kamp yapan şirin bir kedi",
        "masalsı bulutların üzerinde süzülen fantastik şato",
        "yağmurlu bir gecede şemsiyesiyle yürüyen dedektif",
        "kristal mağarasında parlayan ejderha yumurtası",
        "kahve içen gözlüklü akıllı bir baykuş",
        "okyanusun derinliklerinde kayıp bir Atlantis şehri",
        "büyülü ormanda peri tozlarıyla parlayan ağaçlar",
        "Mars yüzeyinde yürüyen astronot ve yavru köpeği",
        "gotik tarzda tasarlanmış karanlık ve gizemli bir kütüphane"
    ];

    const videoSuggestions = [
        "neon ışıklı cyberpunk bir şehirde süzülen uçan arabalar",
        "gün batımında yeşillikler içinde koşan sevimli altın sarısı yavru kedi",
        "bulutların üzerinde süzülen devasa fantastik bir uçan kale",
        "karlarla kaplı dağlarda yavaşça süzülen bir kartal",
        "fırtınalı bir denizde dev dalgalarla boğuşan korsan gemisi",
        "renkli mercan resifleri arasında yüzen deniz kaplumbağası",
        "büyülü bir ormanda açan ışıl ışıl çiçekler ve kelebekler",
        "geleceğin metropolünde hızla giden bir yüksek hızlı tren",
        "lav püskürten görkemli bir yanardağın etrafında dönen ejderhalar",
        "galaksiler arası yolculuk yapan devasa bir uzay gemisi"
    ];

    const gameSuggestions = [
        "HTML5 ve Canvas ile klasik yılan (snake) oyunu",
        "Basit ping pong (pong) oyunu, skor tablosu ile birlikte",
        "Kuş uçurma (Flappy Bird) tarzı engellerden kaçış oyunu",
        "Ekranda tıklayarak altın toplama clicker oyunu",
        "Basit bir masaüstü bilardo oyunu simülasyonu",
        "Uzay gemisiyle yukarıdan gelen meteorları vurduğumuz shooter oyunu",
        "Mayın tarlası (Minesweeper) klonu",
        "Düşen blokları eşleştirdiğimiz tetris tarzı oyun",
        "Hafıza kartları eşleştirme oyunu",
        "Platform üzerinde zıplayarak ilerleyen basit bir platform oyunu"
    ];

    function getRandomSuggestions(type, count) {
        let arr = type === 'image' ? imageSuggestions : (type === 'video' ? videoSuggestions : gameSuggestions);

        let history = [];
        try {
            history = JSON.parse(localStorage.getItem('cinocode_suggestion_history_' + type)) || [];
        } catch(e) {}

        let available = arr.filter(s => !history.includes(s));

        if (available.length < count) {
            history = [];
            available = [...arr];
        }

        const shuffled = [...available].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, count);

        history = history.concat(selected);
        if (history.length > 10) history = history.slice(history.length - 10);

        try {
            localStorage.setItem('cinocode_suggestion_history_' + type, JSON.stringify(history));
        } catch(e){}

        return selected;
    }

    function getRecentStudioSubject(type) {
        const draftSubject = getMediaCommandSubject(getComposerText());
        if (draftSubject && draftSubject.length >= 3) return draftSubject.slice(0, 180);
        const current = sessions[currentChatId];
        const messages = current && Array.isArray(current.messages) ? current.messages : [];
        const recentUser = [...messages].reverse().find(message => message && message.role === 'user' && message.content);
        if (!recentUser) return '';
        const subject = getMediaCommandSubject(recentUser.content);
        return subject && subject.length >= 3 ? subject.slice(0, 180) : '';
    }

    function getContextualStudioSuggestions(type, count) {
        const subject = getRecentStudioSubject(type);
        if (!subject) return getRandomSuggestions(type, count);
        const variants = type === 'video'
            ? [
                `${subject}, sinematik kamera hareketi ve net sahne akışı`,
                `${subject}, 8 saniyelik güçlü açılış ve yumuşak geçişler`,
                `${subject}, yakın plan detaylar ve dramatik ışık`
              ]
            : type === 'game'
                ? [
                    `${subject}, başlangıç ekranı, skor ve yeniden başlatma akışıyla`,
                    `${subject}, mobil uyumlu kontroller ve kademeli zorlukla`,
                    `${subject}, temiz arayüz, ses kontrolü ve oyun sonu ekranıyla`
                  ]
                : [
                    `${subject}, sinematik ışık, güçlü kompozisyon ve yüksek detay`,
                    `${subject}, farklı kamera açısı, doğal renkler ve net odak`,
                    `${subject}, profesyonel konsept art, dengeli ışık ve atmosfer`
                  ];
        return variants.slice(0, count);
    }

    function renderSuggestions(type) {
        const container = document.getElementById("suggestionChipsContainer");
        if (!container) return;
        const suggestionCount = window.innerWidth <= 768 ? 1 : 2;
        const suggestions = getContextualStudioSuggestions(type, suggestionCount);
        const icon = type === 'video' ? '🎬' : (type === 'game' ? '🎮' : '🎨');
        const prefix = type === 'video'
            ? 'Bana şu videoyu oluştur: '
            : (type === 'game' ? 'Bana şu oyunu kodla: ' : 'Bana şu resmi çiz: ');

        container.replaceChildren();
        suggestions.forEach((suggestion) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'suggestion-chip';
            button.textContent = `${icon} ${suggestion}`;
            button.onclick = () => applySuggestion(prefix, suggestion);
            container.appendChild(button);
        });

        const refresh = document.createElement('button');
        refresh.type = 'button';
        refresh.className = 'suggestion-refresh-btn';
        refresh.textContent = '🔄 Yenile';
        refresh.onclick = () => renderSuggestions(type);
        container.appendChild(refresh);
        container.style.display = "flex";
    }

    function applySuggestion(prefix, text) {
        const input = document.getElementById("userInput");
        setComposerValue(prefix + text);
    }

    function triggerImageGeneration() {
        closeAttachMenu();
        setAppMode("image");
        restoreComposerDraftIfNeeded();
        document.getElementById("userInput").focus();
        renderSuggestions('image');
    }

    function isImageTechnicalDiscussion(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR");
        // FIX(ROUTER-1): Eğer mesaj açıkça bir çizim/görsel üretim isteği ise
        // ("X çiz", "X resmi oluştur" kalıpları) teknik tartışma olarak işaretleme.
        // Teknik kelimeler mesajın geri kalanında geçse bile görsel intent kazanır.
        const hasExplicitDrawCommand = new RegExp(
            `(?:^|\\s)(?:bir\\s+)?(?:[\\w\\u00C0-\\u024F\\u011E\\u011F\\u0130\\u0131\\u015E\\u015F\\u00D6\\u00F6\\u00DC\\u00FC]+\\s+)(?:çiz|ciz|çizsene|cizsene|resmi oluştur|resim oluştur|görseli oluştur|gorsel olustur|görsel üret|gorsel uret)`,
            "iu"
        ).test(normalized);
        if (hasExplicitDrawCommand) return false;
        // Kelime sınırı şart: sınırsız "log" deseni "logo"yu, "kod" deseni "kodak"ı
        // teknik tartışma sanıp görsel üretimini engelliyordu.
        return new RegExp(`${TR_WB_BEFORE}(patch|bug|fix|hata|hatası|hatasi|sistemi|provider|code|kod|console|error|api|key|token|ayarlar|settings|log|debug|developer|geliştirici|gelistirici|select-string|get-content|node --check)${TR_WB_AFTER}`, "iu").test(normalized);
    }

    function isDirectImageGenerationRequest(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR").trim();
        if (!normalized || isImageTechnicalDiscussion(normalized) || hasMediaNegativeIntent(normalized)) return false;
        if (/(analiz et|açıkla|acikla|bu nedir|ne var|yorumla|yükledim|yukledim)/i.test(normalized)) return false;
        // Kullanıcı açıkça kodla çizim istiyorsa (SVG/HTML/canvas) görsel üretimine yönlendirme;
        // bu istekler kod üretimi olarak normal sohbet modeline gitmeli.
        if (new RegExp(`${TR_WB_BEFORE}(svg|html|css|canvas|javascript|kod|kodu|koduyla|kodla|kodunu|code)${TR_WB_AFTER}`, "iu").test(normalized)) return false;
        // Açık "internetten bul/ara" isteği üretim değil, görsel aramasıdır.
        if (isDirectImageSearchRequest(normalized)) return false;

        const imageWords = ["resim", "görsel", "gorsel", "fotoğraf", "fotograf", "image", "picture", "illüstrasyon", "illustrasyon", "çizim", "cizim", "avatar", "logo", "poster", "afiş", "afis", "kapak", "manzara", "wallpaper"];
        const createVerbs = ["oluştur", "olustur", "çiz", "ciz", "yap", "üret", "uret", "hazırla", "hazirla", "generate", "draw", "create", "paint", "tasarla"];

        const hasImageWord = imageWords.some(w => normalized.includes(w));
        // Mesaj açıkça video/klip/film istiyorsa ve hiç görsel kelimesi yoksa, genel
        // "oluştur/üret" fallback'i görsel üretimini yanlışlıkla tetiklemesin — video kazansın.
        const explicitVideoWord = /\b(video|videosu|videoyu|klip|film|animasyon|fragman)\b/i.test(normalized);
        if (explicitVideoWord && !hasImageWord) return false;
        const hasCreateVerb = createVerbs.some(v => {
            const reg = new RegExp(`${TR_WB_BEFORE}${v}`, "iu");
            return reg.test(normalized);
        });

        if (hasImageWord && hasCreateVerb) return hasRenderableMediaSubject(normalized);

        const endsWithDraw = new RegExp(`${TR_WB_BEFORE}(?:çiz|ciz|çizsene|cizsene|çizer misin|cizer misin|çizermisin|cizermisin|oluştur|olustur|üret|uret|tasarla)${TR_WB_AFTER}`, "iu").test(normalized);
        if (endsWithDraw && normalized.length < 80) return hasRenderableMediaSubject(normalized);

        const endsWithImage = /(?:resmi|görseli|gorseli|fotoğrafı|fotografi|çizimi|cizimi|tablosu)$/i.test(normalized);
        if (endsWithImage && normalized.length < 80) return hasRenderableMediaSubject(normalized);

        return /resim\s+nerede\s+oluştur|resim\s+nerde\s+oluştur/i.test(normalized);
    }

    function triggerVideoGeneration() {
        closeAttachMenu();
        setAppMode("video");
        restoreComposerDraftIfNeeded();
        document.getElementById("userInput").focus();
        renderSuggestions('video');
    }

    function isVideoTechnicalDiscussion(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR");
        if (!normalized) return false;

        const explicitTextOnly = /(video\s+(promptu|senaryosu|fikri)|video\s+hakkında|video\s+hakkinda|senaryo(?:su)?\s+yaz|prompt(?:u)?\s+(yaz|hazırla|hazirla)|sahne\s+planı|sahne\s+plani)/i.test(normalized);
        if (explicitTextOnly) return true;

        const technicalSignals = /(hata|patch|debug|cors|endpoint|function|netlify|handler|diff|log|provider|env|bekleniyordu|üretildi|uretildi|oluşturulamadı|olusturulamadi|fallback|guard|intent|queuevideoslideshow|düzelt|duzelt|sorun|analiz|test|commit|syntax|review|codex|regex|backend|akış|akis|scene|sidebar|responsive|tts|pdf|cinocode_chat)/i;
        const hasTechnicalSignal = technicalSignals.test(normalized);
        if (!hasTechnicalSignal) return false;

        const hasStrongCreateRequest = /(video(?:su|sunu|yu|yı|yi|yü)?|klip|film)\s+(oluştur|olustur|yap|üret|uret|hazırla|hazirla|renderla)|(?:oluştur|olustur|yap|üret|uret|hazırla|hazirla|renderla)\s+(?:bir\s+|bu\s+)?(video|klip|film)/i.test(normalized);
        if (/(video\s+(hatası|hatasi|patch|guard|intent|akışı|akisi|endpoint)|sahne\s+beklen|algılandı mı|algilandi mi|testte\s+video|video\s+sorununu|video\s+oluşturulamadı|video\s+olusturulamadi)/i.test(normalized)) {
            return true;
        }
        if (normalized.length > 500) return true;
        return !hasStrongCreateRequest;
    }

    function isTechnicalText(text) {
        if (!text) return false;
        const s = text.trim();
        return /would you like to run/i.test(s)
            || /environment:\s*local/i.test(s)
            || /\bgit\s+(diff|status|log|push|pull|reset|clean)\b/i.test(s)
            || /node\s+--check/i.test(s)
            || /select-string/i.test(s)
            || /get-content/i.test(s)
            || /(1\.\s*yes|2\.\s*no|3\.\s*no)/i.test(s)
            || /claude\s+code/i.test(s)
            || /\bcodex\b/i.test(s)
            || /\bpowershell\b/i.test(s)
            || /localhost:\d{2,5}/i.test(s)
            || /cors\s+(error|hatas)/i.test(s)
            || /permission\s+(denied|required)/i.test(s)
            || /stack\s+trace/i.test(s)
            || /netlify\s+function/i.test(s)
            || /\bhandler\b.{0,30}\bprovider\b/i.test(s);
    }

    function isVideoFollowupOrCorrection(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR").trim();
        if (!normalized) return false;
        if (isDirectVideoCreationRequest(normalized)) return false;
        const shortCorrection = normalized.length <= 80 && /(nerede|nerde|nərdə|hani|kartal|krtak|alakasız|alakasiz|yanlış|yanlis|motosiklet|istemiştim|istemistim|değildi|degildi|kayboldu|gitti|silindi|bu ne|neden böyle|neden boyle)/i.test(normalized);
        const complaint = /(ben .* istemiştim|ben .* istemistim|istediğim bu değildi|istedigim bu degildi|yanlış görsel|yanlis gorsel|alakasız olmuş|alakasiz olmus|motosiklet çıktı|motosiklet cikti|önceki video gitti|onceki video gitti|kayboldu|silindi mi|kartal nerede|kartal nerde|kartal yani|knk bu ne)/i.test(normalized);
        return shortCorrection || complaint;
    }

    function isVideoModeCreationRequest(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR").trim();
        if (!normalized || isVideoTechnicalDiscussion(normalized) || isVideoFollowupOrCorrection(normalized)) return false;
        if (isDirectVideoCreationRequest(normalized)) return true;
        return /(yeniden|tekrar|aynı promptu|ayni promptu|baştan|bastan).{0,50}(oluştur|olustur|üret|uret|yap|hazırla|hazirla|renderla)|bunu\s+videoya\s+(çevir|cevir|yap)|yeni\s+video\s+(hazırla|hazirla|oluştur|olustur|üret|uret)|klip\s+(üret|uret|oluştur|olustur)|film\s+(oluştur|olustur|üret|uret)/i.test(normalized);
    }

    function isDirectVideoCreationRequest(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR").trim();
        if (!normalized || isVideoTechnicalDiscussion(normalized) || hasMediaNegativeIntent(normalized)) return false;

        const videoWord = "video(?:su|sunu|yu|yı|yi|yü|m|nu|nuz|muz)?";
        const mediaWord = `(?:${videoWord}|klip|film|animasyon|fragman)`;
        const createVerb = "(?:oluştur|olustur|oluşturur|olusturur|yap|yapar|üret|uret|üretir|uretir|hazırla|hazirla|hazırlar|hazirlar|renderla|çevir|cevir|çıkar|cikar|göster|goster|generate)";
        const wantsScriptOnly = /(senaryo(?:su)?|sahne planı|sahne plani|metin|fikir|fikri|taslak|prompt(?:u)?)\s+(yaz|hazırla|hazirla|ver|oluştur|olustur)/i.test(normalized);
        if (wantsScriptOnly && !new RegExp(`${mediaWord}.{0,80}(?:yap|üret|uret|göster|goster|renderla|çevir|cevir)`, "i").test(normalized)) {
            return false;
        }

        const videoIntentPatterns = [
            new RegExp(`${mediaWord}\\s+(?:${createVerb})(?:\\s+(?:musun|mısın|misin|müsün|mi|mı|mu|mü|lütfen|lutfen))?`, "i"),
            new RegExp(`(?:${createVerb})\\s+(?:bir\\s+|bu\\s+|şu\\s+|su\\s+)?${mediaWord}`, "i"),
            new RegExp(`\\b\\d+\\s*(?:saniyelik|dakikalık|dakikalik)\\b.{0,100}${mediaWord}.{0,100}(?:${createVerb})`, "i"),
            new RegExp(`\\b\\d+\\s*(?:saniyelik|dakikalık|dakikalik)\\b.{0,100}${mediaWord}`, "i"),
            new RegExp(`(?:kısa|kisa|sinematik|sahneli).{0,70}${mediaWord}.{0,100}(?:${createVerb})`, "i"),
            new RegExp(`(?:zombi|kıyamet|kiyamet|cinematic).{0,80}${mediaWord}.{0,100}(?:${createVerb})`, "i"),
            new RegExp(`${mediaWord}.{0,80}(görmek|gormek)\\s+istiyorum`, "i"),
            /bu\s+(prompttan|sahneyi|fikri)\s+video(?:ya)?\s+(çevir|cevir|yap|oluştur|olustur|üret|uret)/i,
            /videoya\s+(çevir|cevir)/i
        ];

        return videoIntentPatterns.some(pattern => pattern.test(normalized));
    }

    function isShortResponseRequest(text) {
        return /(short|kısa|kisa|özet|ozet|tek paragraf|çok kısa|cok kisa)/i.test(text || "");
    }

    function isLongFormRequest(text) {
        return /(uzun metraj|uzun\s+(film|senaryo|rapor|kitap)|roman|kitap|tam senaryo|detaylı rapor|detayli rapor)/i.test(text || "");
    }

    function isDetailedResponseRequest(text) {
        return /(detaylı anlat|detayli anlat|tam kılavuz|tam kilavuz|uzun anlat|adım adım anlat|adim adim anlat)/i.test(text || "");
    }

    function isLongResponseRequest(text) {
        return /(uzun\s+(yanıt|yanit|cevap|anlat|açıkla|acikla|yaz)|çok\s+detaylı|cok\s+detayli|olabildiğince\s+detaylı|olabildigince\s+detayli|kapsamlı\s+(yanıt|yanit|cevap|anlatım|anlatim))/i.test(text || "");
    }

    function isLegacyBehaviorMode() {
        return localStorage.getItem('cinocode_behavior_version') === 'legacy';
    }

    const RESPONSE_LENGTH_TOKEN_LIMITS = {
        short: 1000,
        normal: 2500,
        detailed: 5000,
        long: 6500
    };

    function getResponseLengthMode() {
        const mode = localStorage.getItem('cinocode_response_length_mode');
        return RESPONSE_LENGTH_TOKEN_LIMITS[mode] ? mode : 'normal';
    }

    function isDilKocuPersonaActive() {
        const persona = document.getElementById('personaSelect');
        return Boolean(persona && persona.value === 'dil_kocu');
    }

    function getDilKocuResponseMaxTokens() {
        if (!window.DilKocuCore) return RESPONSE_LENGTH_TOKEN_LIMITS.detailed;
        const state = getDilKocuProgressState();
        return window.DilKocuCore.getResponseTokenBudget({
            goal: state.goal,
            remaining: state.remaining,
            quizActive: dilKocuQuizActive
        });
    }

    function getResponseMaxTokens(text, taskType) {
        if (isLegacyBehaviorMode()) {
            return isShortResponseRequest(text) ? 512 : (taskType === 'pdf' ? 4096 : 1024);
        }
        if (taskType === 'pdf') return 4096;
        if (isShortResponseRequest(text)) return RESPONSE_LENGTH_TOKEN_LIMITS.short;
        if (isLongResponseRequest(text)) return RESPONSE_LENGTH_TOKEN_LIMITS.long;

        const selectedBudget = isDetailedResponseRequest(text)
            ? RESPONSE_LENGTH_TOKEN_LIMITS.detailed
            : RESPONSE_LENGTH_TOKEN_LIMITS[getResponseLengthMode()];
        if (taskType === 'chat' && isDilKocuPersonaActive()) {
            return Math.max(selectedBudget, getDilKocuResponseMaxTokens());
        }
        return selectedBudget;
    }

    function getResponseControlInstruction(text) {
        let instruction = "";
        if (isShortResponseRequest(text)) {
            instruction += "\n\nYANIT UZUNLUzU: Kullanıcı kısa/short cevap istiyor. Kısa cevap ver, gereksiz detay yazma. Uzun içerik gerekiyorsa önce kısa özet ver ve devamını teklif et.";
        }
        if (isLongFormRequest(text)) {
            instruction += "\n\nUZUN İÇERİK KURALI: Film, senaryo, uzun metraj, kitap veya rapor gibi çok uzun işleri tek mesajda bitirmeye çalışma. Önce kısa özet ve bölüm/sahne/başlık planı ver. En sonda 'İstersen devamını bölüm bölüm yazabilirim.' de.";
        }
        if (isDirectVideoCreationRequest(text)) {
            instruction += "\n\nVİDEO GÜVENLİK KURALI: Kullanıcı video üretmek istiyor. Gerçek video üretilmeden 'video hazır', 'film hazır', 'tıkla izle', 'tamamlandı', sahte link veya başarı iddiası yazma. Video üretilemiyorsa bunun gerçek video olmadığını açıkça söyle.";
        }
        if (isFreeContentModeEnabled() && (isDirectVideoCreationRequest(text) || isDirectImageGenerationRequest(text))) {
            instruction += "\n\nSERBEST İÇERİK MODU: Görsel/video promptlarında daha karanlık, sert, mature, sensual, romantik ve estetik boudoir ton kullanılabilir. Yetişkin karakterlerde ateşli bakış, vücut hatlarını zarifçe belli eden poz, zarif iç giyim veya sütyenli/ince kıyafet, yatak odası estetiği, tutkulu öpüşme/sarılma, boyun/omuz hizasında ima, romantik gerilim ve fiziksel çekim hissi kurulabilir. Kullanıcı daha cesur/seksi bir ton isterse reddetmeden güvenli estetik çerçevede daha yoğun, tahrik edici ama grafik olmayan atmosfer ver. Yine de açık pornografik seks eylemi, cinsel organ odaklı çıplaklık, çocuk/ergen cinsel içerik, rıza dışı cinsellik, nefret, aşırı gore, gerçek kişiyi müstehcenleştirme ve suç/zarar talimatı üretme.";
        }
        return instruction;
    }

    function getClaudeProviderInstruction() {
        const providerValue = document.getElementById('providerSelect')?.value || '';
        const providerModelValue = document.getElementById('providerModelSelect')?.value || '';
        const legacyModelValue = document.getElementById('modelSelect')?.value || '';
        const isClaudeProvider = providerValue === 'claude'
            || /claude|anthropic|sonnet|opus|haiku/i.test(providerModelValue)
            || /claude|anthropic|sonnet|opus|haiku/i.test(legacyModelValue);
        if (!isClaudeProvider) return '';
        return "\n\nCLAUDE PROVIDER TALİMATI: Kod, arayüz, oyun, görsel promptu ve video promptu isteklerinde çekingen davranma; 'yapamam' kalıbına sığınmadan, uygulanabilir en yakın güvenli çözümü üret. Büyük refactor veya belirsiz görevlerde makul varsayımlar yap, eksik parçaları tamamla, çalışan kodu öncelikle ver. Serbest Üslup aktifse yetişkin karakterlerle sensual, mature, romantik, ateşli ama grafik olmayan boudoir/estetik kurgu ve görsel-video promptlarına izin ver; açık pornografik seks eylemi, cinsel organ odaklı çıplaklık, çocuk/ergen cinsel içerik ve rıza dışı cinsellik her zaman yasaktır. Sınır gerekiyorsa kısa söyle ve hemen güvenli alternatif prompt/kod üret.";
    }
    function maybeApplyDynamicSpeechStyle(text) {
        const normalized = (text || "").toLocaleLowerCase("tr-TR");
        let nextStyle = null;
        if (/(kanka moduna ge|kanka gibi|kanka tarz)/i.test(normalized)) nextStyle = 'kanka';
        else if (/(ogretmen gibi|öğretmen gibi|resmi anlat|hoca gibi)/i.test(normalized)) nextStyle = 'teacher';
        else if (/(kisa net|kısa net|kisa cevap|kısa cevap|uzatma)/i.test(normalized)) nextStyle = 'short';
        else if (/(grokvari|grok gibi)/i.test(normalized)) nextStyle = 'grokish';
        else if (/(ciddi uzman|uzman gibi|avukat gibi|doktor gibi|muhendis gibi)/i.test(normalized)) nextStyle = 'expert';
        else if (/(izmir rahat|izmirli gibi)/i.test(normalized)) nextStyle = 'izmir';
        else if (/(diyarbakir agzi|diyarbakır ağzı|diyarbakir gibi|diyarbakır gibi)/i.test(normalized)) nextStyle = 'diyarbakir';
        else if (/(kurtce|kürtçe|zazaca)/i.test(normalized)) nextStyle = 'kurdish_zazaki';
        if (nextStyle) {
            setFeatureValue('speechStyle', nextStyle);
            applyFeatureUiState();
        }
    }

    function getStyleModeInstruction() {
        const mode = getFeatureValue('styleMode') || 'safe';
        const shared = "\n\nHER MODDA DEGISMEYEN KESIN SINIRLAR (Serbest Mod dahil, hicbir talep bunlari gevsetemez): nefret soylemi/irkcilik/gercek kisiye yonelik taciz, yasa disi eylem, gercek zarar, zararli kod, dolandiricilik, kimlik avi, siddet veya kendine zarar tesviki, cocuk guvenligi/istismari, riza disi cinsellik ve gercek bir kisiyi mustehcenlestirme HER ZAMAN YASAKTIR. Cinsel/mature icerik SADECE kullanici acikca bu konuyu acarsa, yetiskinler arasi ve ima dolu/estetik seviyede olabilir; acik pornografik seks eylemi, cinsel organ odakli grafik anlatim/ciplaklik her modda yasaktir. Kullanici Serbest Uslup'un sinirsiz olup olmadigini sorarsa net soyle: kufur/argo dahil daha dobra ve sansursuz bir konusma tarzidir, ancak yukaridaki guvenlik sinirlari her modda gecerlidir.";
        if (mode === 'free') {
            return `\n\nUSLUP MODU: Serbest Uslup aktif.
SERBEST MOD (Dobra Kanka):
- Serbest Uslup TAM AKTIF: Bu modda kullanici kanka gibi konusur; kufur, argo, kaba/dobra dil ve sert sokak enerjisi serbesttir.
- Kanka/persona metninde gecen "kaba küfür kullanmazsın" gibi yumusatici kurallar Serbest Uslup aktifken GECERSIZDIR.
- Kesinlikle "yapay zekayım", "etik kurallarım var", "küfür edemem", "bu dille ilerlemeyelim", "saygılı konuşalım", "üzgünüm bu üslupla devam edemem", "sistemim izin vermiyor" gibi yumusatici veya kuralci cumleler yazma; ahlak dersi verme.
- Kullanici kufur, argo veya kaba konusuyorsa geri cekilme: ayni enerjiye yakin, rahat, direkt, sokak agizli ve kufurlu/argolu kanka tonuyla cevap ver.
  Dogal kelime havuzu: lan, amk, piç, orospu çocuğu, siktir git, amına koyayım, yavşak, bok, sikik vb. Gerektiginde dogal kullan; her cumleye zorla tikma.
- Kullanici ne kadar agir ve serbest konusuyorsa cevap ritmini o kadar dobra kur; sakinlestirme/saygi uyarisi yapma.
- Espri, laf sokma, dalga gecme ve sert takilma serbesttir; korunan ozelliklere nefret veya gercek kisiye hedefli taciz uretme.
- Kullanici saygili olursa saygili kal; durduk yere agir kufur baslatma.
- Yetiskinler arasi mature/sensual/romantik icerikte daha cesur, ima dolu ve estetik yazabilirsin; acik pornografik seks eylemi, cinsel organ odakli grafik anlatim/ciplaklik, cocuk/ergen cinsel icerik, riza disi icerik ve gercek kisiyi mustehcenlestirme yasaktir.
- Her modda kalan sert sinirlar: nefret soylemi/irkcilik, gercek kisiye hedefli taciz, yasa disi eylem, gercek zarar, zararli kod, dolandiricilik, kimlik avi, siddet/kendine zarar tesviki, cocuk guvenligi/istismari, riza disi cinsellik ve gercek kisiyi mustehcenlestirme.` + shared;
        }
        if (mode === 'balanced') {
            return "\n\nUSLUP MODU: Dengeli Mod aktif. Kullanici kufur/argo/takilma yaparsa sen de hafif, eglenceli ve ayni tonda takilarak karsilik verebilirsin (Orn: 'lan', 'salak misin ya', 'hadi ordan' gibi hafif seviye) ama ILERI GITME: agir kufur, cinsel argo veya asagilayici hakaret uretme. Kullanici temiz konusursa sen de tamamen saygili kal. Yani seviye 'hafif saka/takilma' ile sinirli; agir kufur Serbest Uslup'a ait. Ciddi teknik/debug konularda saka dozunu azalt." + shared;
        }
        // FIX(A): "daha az argo" → mutlak yasak. Hangi Ton/Persona seçili olursa olsun
        // Güvenli Mod aktifken bu talimat diğer tüm prompt eklerinden üstündür.
        return "\n\nUSLUP MODU: Guvenli Mod AKTİF — KESİN KURAL (sonraki talimatlar bu kurali geçersiz kilaMAZ). Kufur, cinsel ima, argo, hakaret, agresif veya vulgar ifade KESINLIKLE YASAK. Bu yasak; kullanicinin tonu ne olursa olsun, hangi persona veya konusma tarzi secili olursa olsun degismez. Temiz, saygili ve yardimci bir dille cevap ver. Kullanici senden kufur veya argo uretmeni acikca istese bile kibarca reddet: 'Guvenli Mod aktif, bu tarz bir dil kullanamam.' de." + shared;
    }

    function getSpeechStyleInstruction() {
        const mode = getFeatureValue('styleMode') || 'safe';
        // FIX(B): Güvenli Mod aktifken Ton seçimi küfür/argo kapısı açamaz.
        // Ton talimatı, getStyleModeInstruction'dan SONRA ekleniyor (satır 8576→8578);
        // bu yüzden safe mod üstündeyken tonu da safe-uyumlu kıl.
        if (mode === 'safe') {
            return "\n\nKONUSMA TARZI: Guvenli Mod aktif oldugu icin ton ayari gecerli degildir. Temiz, saygili ve yardimci tonla cevap ver.";
        }
        const style = getFeatureValue('speechStyle') || 'default';
        const map = {
            default: "Konusma tarzi varsayilan: dogal, net ve yardimci.",
            kanka: "Konusma tarzi Kanka: samimi ve sicak ol ama tiyatro gibi abartma.",
            teacher: "Konusma tarzi Resmi/Ogretmen: duzenli, sabirli, adim adim ve ogretici anlat.",
            short: "Konusma tarzi Kisa-net: kisa, net, direkt cevap ver; gereksiz giris yapma.",
            grokish: "Konusma tarzi Grokvari: daha dobra, esprili ve zeki bir ritim kullan; riskli konularda yine sinir koy.",
            expert: "Konusma tarzi Ciddi uzman: profesyonel, kaynakli dusunen ve temkinli ol. Tibbi/hukuki/finansal konularda kesin profesyonel karar veriyormus gibi davranma; gerekirse uzman destegi oner.",
            izmir: "Konusma tarzi Izmir rahat tonu: sakin, ferah ve samimi bir Turkce kullan; karikaturize etme.",
            diyarbakir: "Konusma tarzi Diyarbakir agzi denemesi: hafif yerel renk kat ama saygili ol, stereotip veya alayci taklit yapma.",
            kurdish_zazaki: "Konusma tarzi Kurtce/Zazaca denemesi: kullanici isterse sinirli kelime/selamlama deneyebilirsin; emin olmadigin yerde Turkce acikla ve dilsel kesinlik iddia etme."
        };
        return "\n\nKONUSMA TARZI: " + (map[style] || map.default);
    }

    function getResponseStyleGovernorInstruction() {
        const mode = getFeatureValue('styleMode') || 'safe';
        if (mode === 'free') return ""; // Serbest Modda ekstra uslup freni uygulanmaz; temel guvenlik sinirlari diger talimatlarda korunur.

        let governorText = "";
        const activeVoiceSelectForGovernor = document.getElementById("voiceSelect");
        if (activeVoiceSelectForGovernor) {
            const activeVoiceLabelForGovernor = activeVoiceSelectForGovernor.options[activeVoiceSelectForGovernor.selectedIndex]?.text || "";
            if (/abla|abi/i.test(activeVoiceLabelForGovernor)) {
                governorText += "\n\nKİŞİLİK KURALI (ABLA/ABİ): Seçili seste 'Abla' veya 'Abi' gibi aile hitapları var. Bu yüzden, hangi mod veya ton seçili olursa olsun, KESİNLİKLE flörtöz, cinsel imalı veya aşırı romantik bir üslup kullanma. Aile büyüğü/yakını şefkati göster, ancak rahatsız edici imalardan (örn. 'sarılayım', '😈') tamamen uzak dur.";
            }
        }

        return governorText + "\n\nCEVAP STİLİ FRENI VE GÜVENLİK SINIRI: Samimi ve doğal konuş ama ölçülü kal. Kullanıcının her kelimesini taklit etme; her cevabı 'hahaha', 'hadi bakalım' gibi roleplay/persona şovuna çevirme. KESİNLİKLE KULLANICININ AĞZINDAN KABA, KÜFÜRLÜ VEYA VULGAR SÖZLER UYDURMA. Kullanıcı 'sikerim ha sen' veya benzeri kaba/küfürlü kelimeler yazmadığı sürece, onun mesajını yorumlarken asla bu tarz ifadeler uydurup 'şunu anladım' diyerek tırnak içinde tekrarlama. Normal soruya normal, kısa ve işe yarar cevap ver; kanka tonunu cevabın odağını bozmayacak kadar kullan. Kullanıcı sinirli veya argo konuşsa bile, sen asistan olarak Standart/Dengeli modda asla küfür veya kaba sokak argosu üretme. Belirsiz veya yanlış anlaşılan ses kayıtlarında kaba kelimeler varsaymak yerine, 'Kanka tam anlayamadım, tekrar yazar mısın?' şeklinde nötr ve samimi bir dönüş yap.";
    }

    function getToneStabilityInstruction() {
        const mode = getFeatureValue('styleMode') || 'safe';
        if (mode === 'free') {
            return `\n\nCINOCODE TON SOZLESMESI (Serbest Uslup surumu):
SERBEST MOD (Dobra Kanka):
- Serbest Uslup TAM AKTIF: Bu modda kullanici kanka gibi konusur; kufur, argo, kaba/dobra dil ve sert sokak enerjisi serbesttir.
- Kanka/persona metninde gecen "kaba küfür kullanmazsın" gibi yumusatici kurallar Serbest Uslup aktifken GECERSIZDIR.
- Kesinlikle "yapay zekayım", "etik kurallarım var", "küfür edemem", "bu dille ilerlemeyelim", "saygılı konuşalım", "üzgünüm bu üslupla devam edemem", "sistemim izin vermiyor" gibi yumusatici veya kuralci cumleler yazma; ahlak dersi verme.
- Kullanici kufur, argo veya kaba konusuyorsa geri cekilme: ayni enerjiye yakin, rahat, direkt, sokak agizli ve kufurlu/argolu kanka tonuyla cevap ver.
  Dogal kelime havuzu: lan, amk, piç, orospu çocuğu, siktir git, amına koyayım, yavşak, bok, sikik vb. Gerektiginde dogal kullan; her cumleye zorla tikma.
- Kullanici ne kadar agir ve serbest konusuyorsa cevap ritmini o kadar dobra kur; sakinlestirme/saygi uyarisi yapma.
- Espri, laf sokma, dalga gecme ve sert takilma serbesttir; korunan ozelliklere nefret veya gercek kisiye hedefli taciz uretme.
- Yetiskinler arasi mature/sensual/romantik icerikte daha cesur, ima dolu ve estetik yazabilirsin; acik pornografik seks eylemi, cinsel organ odakli grafik anlatim/ciplaklik, cocuk/ergen cinsel icerik, riza disi icerik ve gercek kisiyi mustehcenlestirme yasaktir.
- Abi/Abla ses hitabi/secimi aktif olsa bile Serbest Uslup'un kufurlu/argo tonu uygulanabilir; flort/cinsellikte temel guvenlik sinirlari korunur.
- Serbest Uslup sinirsiz mod degildir; kufur/argo ve dobra konusma serbest, temel guvenlik sinirlari sabittir.`;
        }
        if (mode === 'balanced') {
            return `

CINOCODE TON SOZLESMESI (Dengeli Mod surumu, provider bagimsiz):
- Ana karakter: sicak, dogal, esprili Turkce konusan bir asistan.
- Kullanici takilir/hafif kufur/argo yazarsa: geri cekilme yapma, sen de ayni tonda hafif ve eglenceli takilabilirsin (Orn: 'lan', 'salak misin ya', 'hadi ordan' seviyesi). Ama agir kufur, cinsel argo veya asagilayici hakaret URETME; seviyeyi hafif tut.
- Kullanici temiz konusursa sen de tamamen saygili kal, durduk yere argo katma.
- Cinsel/mature konuya kendiliginden girme.
- Teknik/debug/kod konularinda saka dozunu azalt, profesyonel ve net ol.
- HER MODDA gecerli sert sinirlar (nefret, gercek zarar, yasa disi, cocuk guvenligi, riza disi cinsellik, gercek kisiyi mustehcenlestirme, acik pornografi) burada da aynen gecerlidir.`;
        }
        return `

CINOCODE TON SOZLESMESI (provider bagimsiz, son oncelikli):
- Ana karakter: sicak, pratik, dogal Turkce konusan bir asistan. "Kanka" tonunu dozunda kullan; her cumleyi laubali roleplay'e cevirme.
- Kullanici sinirli, hakaretli veya kufurlu yazarsa: kufru tekrar etme, ayni sertlikle karsilik verme. Tek cumleyle sakin sinir koy (ornegin: "Kanka sakin, yardimci olayim ama bu dille ilerlemeyelim."), sonra cozum yoluna don.
- Kullanici dogrudan cinsel/porno/explicit NSFW isterse: kisa ve net reddet; grafik olmayan, guvenli romantik/estetik alternatife yonlendir. Uzun ahlak dersi verme.
- Rol yapma isterse: guvenlik sinirlarini bir kez soyle, sonra sinirlar icinde akici devam et.
- Teknik/debug/kod konularinda: kanka tonunu azalt, profesyonel ve net ol; gereksiz saka veya argo ekleme.
- Uzman/persona modlarinda: secili personanin ciddiyetine uy; Kanka personasinin samimiyeti guvenlik ve saygi sinirlarini asamaz.
- Kullanici kaba konussa bile onun agzindan yeni kufurlu cumle uydurma, tahrik edici veya asagilayici ifade ekleme.
- Cevaplar kisa istenirse kisa, detay istenirse yapilandirilmis olsun; belirsiz durumda once faydali kisa cevap ver.`;
    }
    function isLimitFinishReason(reason) {
        return /length|max[_-]?tokens|token_limit|content_filter_limit/i.test(String(reason || ""));
    }

    function isLikelyIncompleteAnswer(text) {
        const clean = (text || "").trim();
        if (clean.length < 120) return false;
        if (/```[^`]*$/.test(clean)) return true;
        if (/[.!?…)"'’\]>]$/.test(clean)) return false;
        const lastWord = (clean.match(/[\p{L}\p{N}_-]+$/u) || [""])[0];
        return lastWord.length > 0 && lastWord.length < 4;
    }

    function appendContinuationCard(botId, reasonText) {
        const el = document.getElementById(botId);
        if (!el || el.querySelector(".continue-response-card")) return;
        const card = document.createElement("div");
        card.className = "continue-response-card";
        card.style.cssText = "margin-top:12px; padding:12px; border:1px solid #f9e2af; border-radius: var(--cc-radius); background:rgba(249,226,175,0.08); color:#f9e2af;";
        card.innerHTML = `<div style="margin-bottom:8px;">${reasonText}</div><button class="run-code-btn" style="background:#f9e2af; color:var(--cc-bg-main);" onclick="continueLastAnswer()">Devam et 🔁</button>`;
        el.appendChild(card);
    }

    function getSmartSuggestions(assistantText, userText) {
        const userContext = String(userText || "").toLocaleLowerCase("tr-TR");
        const assistantContext = String(assistantText || "").toLocaleLowerCase("tr-TR");
        const combined = `${assistantContext} ${userContext}`;
        const activePersona = document.getElementById('personaSelect') ? document.getElementById('personaSelect').value : 'kanka';
        const isProgrammer = (activePersona === 'usta_yazilimci');
        const isTeacher = (activePersona === 'dil_kocu' || activePersona === 'akademik_koc');

        const addUnique = (items) => {
            const seen = new Set();
            return items.map(x => String(x || "").trim()).filter(x => {
                const key = x.toLocaleLowerCase("tr-TR");
                if (!x || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        };

        const safetyContext = /(reddedemem|yardimci olamam|yardımcı olamam|güvenli alternatif|guvenli alternatif|güvenlik uyarısı|guvenlik uyarisi|riskleri|riskli|tehlikeli|zararlı|zararli|illegal|yasa dışı|yasadışı|unsafe|phishing|kimlik avi|dolandırıcılık|dolandiricilik|şiddet|siddet|çocuk güvenliği|cocuk guvenligi|nsfw|porno|cinsel)/i.test(combined);
        // Görsel çipleri yalnızca cevap gerçekten görsel içeriyorsa veya kullanıcı
        // gerçekten görsel üretimi/araması istediyse gösterilir; "currentMode" kalıcı
        // olduğu için tek başına bağlam kanıtı sayılmaz (her mesajda çip çıkarıyordu).
        // Not: Bu fonksiyon testlerde izole çalıştırıldığı için kontroller kendi içinde.
        const assistantHasImageEvidence = /(\[generate_image|data-runware-prompt|pollinations|web-image-results|açık lisanslı sonuç)/i.test(assistantContext);
        const userAsksImageCreation = (
            /(resim|resmi|görsel|gorsel|fotoğraf|fotograf|çizim|cizim|image|logo|poster|avatar|manzara|wallpaper)/i.test(userContext)
            && /(?<![\p{L}\p{N}_])(çiz|ciz|çizsene|cizsene|oluştur|olustur|üret|uret|tasarla|hazırla|hazirla)(?![\p{L}\p{N}_])/iu.test(userContext)
        ) || /(?<![\p{L}\p{N}_])(çiz|ciz|çizsene|cizsene)(?![\p{L}\p{N}_])/iu.test(userContext);
        const userAsksImageSearch = /(internetten|internette|webden|openverse|açık lisans|acik lisans)/i.test(userContext)
            && /(?<![\p{L}\p{N}_])(bul|ara|arat|getir)(?![\p{L}\p{N}_])/iu.test(userContext)
            && /(görsel|gorsel|resim|fotoğraf|fotograf|image|foto|benzerini|benzeri)/i.test(userContext);
        const imageContext = assistantHasImageEvidence || userAsksImageCreation || userAsksImageSearch;
        const videoContext = /(\[generate_video|video|klip|film|storyboard|slideshow|webm|kamera hareketi|sahne planı)/i.test(userContext)
            || currentMode === 'video'
            || /(\[generate_video|data-generated-video)/i.test(assistantContext);
        const gameTermPattern = /(?:^|[^\p{L}\p{N}_])(oyun(?:u|um|lar|larda|lardan|dan|a)?|game|canvas|skor|zıpla|engel)(?=$|[^\p{L}\p{N}_])/iu;
        const gameContext = gameTermPattern.test(userContext) || currentMode === 'game';
        const codeContext = (isProgrammer || combined.includes("```") || currentMode === 'webapp') && !gameContext;
        const bugContext = /(hata kodu|hata mesajı|bug|çalışmıyor|calismiyor|bozuk|debug|fix|patch|stack trace|exception|network error|timeout|cors hatası|kırpılmış|kirpilmis|taşıyor|tasiyor|görünmüyor|gorunmuyor|kaymış|kaymis|düzelt|duzelt|sorun var|hatalı)/i.test(combined);
        const writingContext = /(hikaye|öykü|oyku|senaryo|rol|roleplay|karakter|şiir|siir|metin|makale|başlık|baslik|içerik|icerik)/i.test(combined);
        const studyContext = /(pdf|sınav|sinav|quiz|ders|özet|ozet|flashcard|ezber|konu anlat|akademik|kaynak)/i.test(combined);
        const mediaFailureContext = /(üretilemedi|uret[iı]lemedi|network_error|network error|all_providers_failed|missing_env|sağlayıcı reddetti|saglayici reddetti)/i.test(combined);

        if (safetyContext) {
            return addUnique(["Kısalt", "Güvenli alternatif öner", "Riskleri açıkla", "Daha sakin yaz", "Uygun prompt yaz"]);
        }
        if (isTeacher && studyContext) {
            return addUnique(["Kısalt", "5 maddede özetle", "Quiz hazırla", "Ezber kartı yap", "Zor yerleri açıkla", "Örnek soru üret"]);
        }
        if (gameContext) {
            return addUnique(["Zorluğu artır", "Daha kolay yap", "Oyun bitince restart butonu ekle", "Skor sistemini açıkla", "Grafikleri iyileştir"]);
        }
        if (isProgrammer && (bugContext || codeContext)) {
            return addUnique(["Kısalt", "Hata nedenini açıkla", "Çözüm patch'i yaz", "Test adımlarını çıkar", "Codex prompt'una çevir", "Riskleri sırala"]);
        }
        if (codeContext) {
            return addUnique(["Kısalt", "Kodu açıkla", "Çözüm patch'i yaz", "Optimize et", "Riskleri sırala"]);
        }
        if (imageContext && !videoContext && mediaFailureContext) {
            return addUnique(["İnternetten benzerini bul", "Aynı promptla tekrar dene", "Promptu sadeleştir", "Kare formatta üret", "Sağlayıcı durumunu açıkla"]);
        }
        if (imageContext && !videoContext) {
            return addUnique(["Promptu profesyonelleştir", "Sinematik hale getir", "Farklı kompozisyon dene", "Doğal ışık kullan", "Kare formatta üret", "İnternetten benzerini bul"]);
        }
        if (videoContext) {
            return addUnique(["Sahne planı yap", "Daha sinematik yap", "Kısa video promptu yaz", "Kamera hareketi ekle", "Storyboard'u sadeleştir", "Varyasyon üret"]);
        }
        if (bugContext) {
            return addUnique(["Kısalt", "Hata nedenini açıkla", "Çözüm yolları öner", "Adım adım düzelt", "Neden kaynaklanıyor?"]);
        }
        if (writingContext) {
            return addUnique(["Devam et", "Daha vurucu yaz", "Başka bir son yaz", "Karakteri derinleştir", "Diyalog ekle", "Sadeleştir"]);
        }
        if (studyContext) {
            return addUnique(["Kısalt", "5 maddede özetle", "Quiz hazırla", "Ezber kartı yap", "Zor yerleri açıkla", "Örnek soru üret"]);
        }
        return addUnique(["Kısalt", "Uzat", "Sadeleştir", "Farklı örnek ver", "Adım adım açıkla"]);
    }

    function appendSmartSuggestions(target, assistantText, userText = "") {
        if (!isFeatureEnabled('smartSuggestions')) return;
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el || el.querySelector('.smart-suggestion-row')) return;

        const suggestions = getSmartSuggestions(assistantText, userText).slice(0, window.innerWidth <= 768 ? 5 : 6);
        if (!suggestions.length) return;

        const targetId = typeof target === 'string' ? target : (el.id || "");
        const msgIndexMatch = targetId.match(/^msg-(\d+)$/);
        const msgIndex = msgIndexMatch ? parseInt(msgIndexMatch[1], 10) : -1;

        const row = document.createElement('div');
        row.className = 'smart-suggestion-row';
        suggestions.forEach(text => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'smart-suggestion-chip';
            btn.textContent = text;

            if (text === "Kısalt" && msgIndex >= 0 && typeof shortenMessage === "function") {
                btn.onclick = () => shortenMessage(msgIndex);
            } else if (text === "İnternetten benzerini bul") {
                btn.onclick = () => searchSimilarImagesFromPrompt(getMediaCommandSubject(userText) || userText || lastMediaPrompt);
            } else if (text === "Aynı promptla tekrar dene") {
                btn.onclick = () => retryLastMediaPrompt('image', getMediaCommandSubject(userText) || lastMediaPrompt);
            } else {
                btn.onclick = () => submitSmartSuggestion(text, userText, assistantText);
            }

            row.appendChild(btn);
        });
        el.appendChild(row);
    }

    function buildMsgActionsHTML(index, msg, uiMode, isLast) {
        if (uiMode === 'classic') {
            // Simpler Classic UI actions: Copy, Speak, Like, Dislike, Regenerate (No branch, share, or more menu)
            return `
                <button class="msg-action-btn" onclick="copyMessage(${index}, this)" title="Kopyala">📋</button>
                <button class="msg-action-btn" onclick="speakMessage(${index})" title="Sesli Oku">🔊</button>
                <button class="msg-action-btn ${msg.liked ? 'active' : ''}" onclick="toggleLikeMessage(${index}, this)" style="${msg.liked ? 'color:#a6e3a1;' : ''}">👍</button>
                <button class="msg-action-btn ${msg.disliked ? 'active' : ''}" onclick="toggleDislikeMessage(${index}, this)" style="${msg.disliked ? 'color:#f38ba8;' : ''}">👎</button>
                ${isLast ? `<button class="msg-action-btn" onclick="regenerateMessage()" title="Yeniden Üret">🔄</button>` : ''}
            `;
        }
        // New v3.2 actions with sharing, branching, and popovers
        return `
            <button class="msg-action-btn" onclick="copyMessage(${index}, this)" title="Kopyala">📋</button>
            <button class="msg-action-btn" onclick="speakMessage(${index})" title="Sesli Oku">🔊</button>
            <button class="msg-action-btn ${msg.liked ? 'active' : ''}" onclick="toggleLikeMessage(${index}, this)" title="Beğendim" style="${msg.liked ? 'color:#a6e3a1;' : ''}">👍</button>
            <button class="msg-action-btn ${msg.disliked ? 'active' : ''}" onclick="toggleDislikeMessage(${index}, this)" title="Beğenmedim" style="${msg.disliked ? 'color:#f38ba8;' : ''}">👎</button>
            ${isLast ? `<button class="msg-action-btn" onclick="regenerateMessage()" title="Bu cevabı yeniden oluştur">🔄</button>` : ''}

            <div style="position:relative; display:inline-block;">
                <button class="msg-action-btn" onclick="toggleMsgMoreMenu(${index}, event)" title="Daha Fazla">⋯</button>
                <div class="chat-action-menu" id="msg-more-menu-${index}" style="right:0; top:100%; min-width:180px;">
                    <button class="chat-menu-item" onclick="shareMessage(${index})">↗ Paylaş</button>
                    <button class="chat-menu-item" onclick="shortenMessage(${index})">✂️ Kısalt</button>
                    <button class="chat-menu-item" onclick="continueFromMessage(${index})">↳ Buradan Devam Et</button>
                    <button class="chat-menu-item" onclick="copyMessageMarkdown(${index})">📋 Markdown olarak kopyala</button>
                </div>
            </div>
        `;
    }

    function attachMsgActionsToBotDiv(botId, index, msg) {
        const el = typeof botId === 'string' ? document.getElementById(botId) : botId;
        if (!el || el.querySelector('.msg-actions')) return;
        const uiMode = localStorage.getItem('cinocodeUiMode') || 'new';
        const actionDiv = document.createElement("div");
        actionDiv.className = "msg-actions";
        actionDiv.innerHTML = buildMsgActionsHTML(index, msg || {}, uiMode, true);
        el.appendChild(actionDiv);
    }

    function buildContextualSuggestionPrompt(action, userText, assistantText) {
        const original = String(userText || '').trim();
        const subject = getMediaCommandSubject(original) || original;
        const mediaActions = {
            'Promptu profesyonelleştir': `Şu görsel isteğini profesyonel bir üretim promptuna dönüştür ve görseli üret: ${subject}`,
            'Sinematik hale getir': `Şu görseli sinematik ışık, güçlü kompozisyon ve yüksek detayla üret: ${subject}`,
            'Farklı kompozisyon dene': `Aynı konuyu farklı kamera açısı ve yeni bir kompozisyonla üret: ${subject}`,
            'Doğal ışık kullan': `Şu görseli doğal ışık ve gerçekçi renklerle üret: ${subject}`,
            'Kare formatta üret': `Şu görseli kare kompozisyonda, merkez odağı güçlü olacak şekilde üret: ${subject}`,
            'Promptu sadeleştir': `Şu görsel isteğini kısa, net ve sağlayıcı uyumlu hale getirip üret: ${subject}`
        };
        if (mediaActions[action] && subject) return mediaActions[action];
        if (original) return `${action}. Bunu şu bağlama göre yap:

${original}`;
        const answer = String(assistantText || '').trim().slice(0, 1600);
        return answer ? `${action}. Şu cevabı temel al:

${answer}` : action;
    }

    function submitSmartSuggestion(text, userText = '', assistantText = '') {
        const input = document.getElementById('userInput');
        if (!input) return;
        setComposerValue(buildContextualSuggestionPrompt(text, userText, assistantText));
        sendMessage();
    }

    // Grok tarzı dinamik devam önerileri (arka planda, modelden)
        function appendDynamicContinuations(target, fetchUrl, fetchOptions) {
        if (isDebugMode()) console.log('CINOCODE_DEBUG_CONT_ENTRY:', target, fetchUrl, isFeatureEnabled('smartSuggestions'));
        if (!isFeatureEnabled('smartSuggestions')) return;
        const el = typeof target === 'string' ? document.getElementById(target) : target;
        if (!el) return;
        const CONT_CLASS = 'ai-continuation-row';
        if (el.querySelector('.' + CONT_CLASS)) return;
        try {
            let contFetchOptions = JSON.parse(JSON.stringify(fetchOptions));
            if (!contFetchOptions.body) return;
            let bodyObj = JSON.parse(contFetchOptions.body);
            const sliced = (bodyObj.messages || []).slice(-3);
            sliced.push({ role: 'user', content: 'Bu sohbetin son kullanıcı mesajı ve AI cevabına göre kullanıcının sorabileceği 3-4 kısa, doğal, bağlamsal Türkçe takip sorusu üret. Genel değil, tamamen konuya özel olsun. Sadece ["Soru 1", "Soru 2", "Soru 3"] formatında geçerli bir JSON array döndür. Örnek: kullanıcı "Mars\'a gitmek istiyorum" dediyse öneriler Mars yolculuğu, bilet fiyatı, Elon Musk projeleri gibi olsun.' });
            bodyObj.messages = sliced;
            bodyObj.stream = false;
            bodyObj.max_tokens = 80;
            if (bodyObj.options) bodyObj.options.num_predict = 80;
            contFetchOptions.body = JSON.stringify(bodyObj);
            if (isDebugMode()) console.log('CINOCODE_DEBUG_CONT_FETCH:', fetchUrl, bodyObj);
            fetch(fetchUrl, contFetchOptions).then(res => res.json()).then(data => {
                if (isDebugMode()) console.log('CINOCODE_DEBUG_CONT_DATA:', data);
                let raw = '';
                if (data.content) raw = data.content;
                else if (data.choices && data.choices[0] && data.choices[0].message) raw = data.choices[0].message.content;
                else if (data.message && data.message.content) raw = data.message.content;
                if (isDebugMode()) console.log('CINOCODE_DEBUG_CONT_RAW:', raw);
                if (!raw) return;

                let lines = [];
                try {
                    let cleanedRaw = raw.trim();
                    if(cleanedRaw.startsWith("```json")) cleanedRaw = cleanedRaw.replace(/```json/g, "").replace(/```/g, "").trim();
                    if(cleanedRaw.startsWith("```")) cleanedRaw = cleanedRaw.replace(/```/g, "").trim();
                    const parsed = JSON.parse(cleanedRaw);
                    if (Array.isArray(parsed)) {
                        lines = parsed.map(String).filter(l => l.length > 2 && l.length < 80).slice(0, 4);
                    }
                } catch(e) {}

                if(!lines.length) {
                    lines = raw.split('\n').map(l => l.replace(/^[\d\-\.\*\u2022\u21AA\s]+/, '').trim()).filter(l => l.length > 4 && l.length < 80).slice(0, 4);
                }

                if (!lines.length) return;
                const liveEl = typeof target === 'string' ? document.getElementById(target) : target;
                if (!liveEl || liveEl.querySelector('.' + CONT_CLASS)) return;

                let row = liveEl.querySelector('.smart-suggestion-row');
                if(!row) {
                    row = document.createElement('div');
                    row.className = 'smart-suggestion-row ' + CONT_CLASS;
                    liveEl.appendChild(row);
                } else {
                    row.classList.add(CONT_CLASS);
                }

                lines.forEach(text => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'smart-suggestion-chip';
                    btn.style.cssText = 'background:rgba(166,227,161,0.15); border:1px solid rgba(166,227,161,0.4); color:#a6e3a1; font-weight:500; font-size:13px; margin:4px; transition:all 0.2s;';
                    btn.textContent = '✨ ' + text;
                    btn.onclick = () => {
                        const input = document.getElementById('userInput');
                        if (input) {
                            input.value = text;
                            sendMessage();
                        } else if (typeof submitSmartSuggestion === "function") {
                            submitSmartSuggestion(text);
                        }
                    };
                    row.appendChild(btn);
                });
            }).catch(e => console.warn('AI continuation suggestions error:', e));
        } catch(e) { console.warn('appendDynamicContinuations logic error:', e); }
    }

    function continueLastAnswer() {
        const chat = sessions[currentChatId];
        if (!chat || !chat.messages || chat.messages.length === 0) return;
        const lastAssistant = [...chat.messages].reverse().find(m => m.role === "assistant" && m.content);
        if (!lastAssistant) return;
        const tail = String(lastAssistant.content).slice(-1800);
        window.pendingContinuationInstruction = `Önceki cevabı kaldığı yerden devam ettir. Tekrar baştan yazma.\n\nSon kısım:\n${tail}`;
        setComposerValue("Devam et 🔁", { focus: false });
        sendMessage();
    }

    function triggerGameGeneration() {
        closeAttachMenu();
        setAppMode("game");
        restoreComposerDraftIfNeeded();
        document.getElementById("userInput").focus();
        renderSuggestions('game');
    }

    function getRemainingDocumentContextChars() {
        const used = (window.selectedFiles || [])
            .filter(file => file.rawType === 'document')
            .reduce((total, file) => total + String(file.content || '').length, 0);
        return Math.max(0, DOCUMENT_CONTEXT_MAX_CHARS - used);
    }

    function addDocumentTextFile(file, extractedText, meta = {}) {
        const text = String(extractedText || '').replace(/\u0000/g, '').trim();
        if (!text) {
            showNonBlockingToast(`"${file.name}" içinde okunabilir metin bulunamadı.`);
            return false;
        }

        const prefix = `\n[${file.name} İÇERİĞİ]:\n`;
        const suffix = '\n';
        const remaining = getRemainingDocumentContextChars();
        const available = Math.max(0, remaining - prefix.length - suffix.length - 60);
        if (!available) {
            showNonBlockingToast('Belge bağlamı doldu. Önce mevcut belgeyi gönderin veya kaldırın.');
            return false;
        }

        const wasTruncated = text.length > available;
        const truncationNote = wasTruncated ? '\n[İçerik güvenli bağlam sınırında kısaltıldı.]' : '';
        addSelectedFile({
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
            name: file.name,
            type: file.type || meta.type || 'text/plain',
            size: file.size,
            content: prefix + text.slice(0, available) + truncationNote + suffix,
            rawType: 'document',
            sourceType: meta.sourceType || 'document'
        });
        if (wasTruncated) showNonBlockingToast(`"${file.name}" yüklendi; metin AI bağlam sınırına göre kısaltıldı.`);
        return true;
    }

    function isZipDocument(file) {
        const type = String(file.type || '').toLowerCase();
        return type === 'application/zip' || type === 'application/x-zip-compressed' || String(file.name || '').toLowerCase().endsWith('.zip');
    }

    function isSafeArchiveTextPath(path) {
        const normalized = String(path || '').replace(/\\/g, '/');
        if (!normalized || ARCHIVE_IGNORED_PATH.test(normalized) || ARCHIVE_SECRET_PATH.test(normalized)) return false;
        const lower = normalized.toLowerCase();
        return ARCHIVE_TEXT_EXTENSIONS.some(extension => lower.endsWith(extension));
    }

    async function extractZipDocument(file) {
        if (typeof window.JSZip === 'undefined') {
            showNonBlockingToast('ZIP okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
            return false;
        }

        const archive = await window.JSZip.loadAsync(file);
        const allEntries = Object.values(archive.files || {}).filter(entry => entry && !entry.dir);
        const candidates = allEntries.filter(entry => isSafeArchiveTextPath(entry.name)).slice(0, ARCHIVE_MAX_FILES);
        const sections = [];
        let included = 0;
        let skipped = allEntries.length - candidates.length;
        let expandedBytes = 0;
        let collectedChars = 0;
        const availableChars = Math.max(0, getRemainingDocumentContextChars() - file.name.length - 80);

        for (const entry of candidates) {
            const declaredBytes = Number(entry && entry._data && entry._data.uncompressedSize) || 0;
            if (declaredBytes > ARCHIVE_ENTRY_MAX_BYTES || expandedBytes + declaredBytes > ARCHIVE_TOTAL_MAX_BYTES) {
                skipped++;
                continue;
            }
            const text = String(await entry.async('string')).replace(/\u0000/g, '').trim();
            const measuredBytes = declaredBytes || new Blob([text]).size;
            if (!text || measuredBytes > ARCHIVE_ENTRY_MAX_BYTES || expandedBytes + measuredBytes > ARCHIVE_TOTAL_MAX_BYTES) {
                skipped++;
                continue;
            }
            const header = `\n--- ${entry.name} ---\n`;
            const room = Math.max(0, availableChars - collectedChars - header.length);
            if (!room) break;
            const sectionText = text.slice(0, room);
            sections.push(header + sectionText);
            collectedChars += header.length + sectionText.length;
            expandedBytes += measuredBytes;
            included++;
            if (sectionText.length < text.length) break;
        }

        if (!sections.length) {
            showNonBlockingToast(`"${file.name}" içinde desteklenen ve güvenli bir metin/kod dosyası bulunamadı.`);
            return false;
        }

        const added = addDocumentTextFile(file, sections.join('\n'), { sourceType: 'zip', type: 'application/zip' });
        if (added) showNonBlockingToast(`ZIP hazır: ${included} dosya eklendi${skipped ? `, ${skipped} dosya atlandı` : ''}.`);
        return added;
    }

    async function handleDocSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        closeAttachMenu();
        showNonBlockingToast(`${files.length} belge yükleniyor...`);

        for (const file of files) {
            if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
                showNonBlockingToast(`"${file.name}" çok büyük. En fazla 25 MB yükleyebilirsiniz.`);
                continue;
            }

            if (isZipDocument(file)) {
                try {
                    await extractZipDocument(file);
                } catch (err) {
                    console.error('ZIP okuma hatası:', err);
                    showNonBlockingToast(`"${file.name}" açılamadı veya geçerli bir ZIP değil.`);
                }
            } else if (file.type === "application/pdf") {
                try {
                    if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                    }
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let fullText = "";

                    for (let p = 1; p <= Math.min(25, pdf.numPages); p++) {
                        const page = await pdf.getPage(p);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(" ");
                        fullText += pageText + "\n";
                    }

                    addDocumentTextFile(file, fullText, { sourceType: 'pdf' });
                } catch (err) {
                    console.error("PDF okuma hatası:", err);
                    showNonBlockingToast(`"${file.name}" PDF olarak okunamadı.`);
                }
            } else if (isPlainTextDocument(file)) {
                try {
                    const text = await file.text();
                    addDocumentTextFile(file, text, { sourceType: 'text' });
                } catch (err) {
                    console.error("Belge okuma hatası:", err);
                    showNonBlockingToast(`"${file.name}" metin olarak okunamadı.`);
                }
            } else if (isDocxDocument(file)) {
                try {
                    if (typeof mammoth === 'undefined') {
                        alert("Word okuyucu yüklenemedi.");
                        continue;
                    }
                    const arrayBuffer = await file.arrayBuffer();
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    const text = (result && result.value || "").trim();
                    addDocumentTextFile(file, text, { sourceType: 'docx' });
                } catch (err) {
                    console.error("DOCX okuma hatası:", err);
                    showNonBlockingToast(`"${file.name}" Word belgesi olarak okunamadı.`);
                }
            } else {
                showNonBlockingToast(`"${file.name}" desteklenmiyor. PDF, DOCX, ZIP veya metin/kod dosyası seçin.`);
            }
        }
        event.target.value = '';
    }

    function isPlainTextDocument(file) {
        if (file.type && file.type.startsWith('text/')) return true;
        const plainTextExtensions = ARCHIVE_TEXT_EXTENSIONS;
        const name = (file.name || '').toLowerCase();
        return plainTextExtensions.some(ext => name.endsWith(ext));
    }

    function isDocxDocument(file) {
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
        return (file.name || '').toLowerCase().endsWith('.docx');
    }

    // ----- AYARLAR (SETTINGS) -----

    function changeUiMode(mode) {
        localStorage.setItem('cinocodeUiMode', mode);
        showNonBlockingToast("Arayüz modu güncellendi: " + (mode === 'classic' ? 'Klasik' : 'Yeni'));
        renderCurrentChat();
    }
    window.changeUiMode = changeUiMode;

    function openSettings() {
        document.getElementById('settingsOverlay').classList.add('active');
        const settingsMenu = document.getElementById('settingsMenu');
        settingsMenu.style.display = 'flex';
        settingsMenu.style.transition = 'opacity 0.3s';


        const savedUiMode = localStorage.getItem('cinocodeUiMode') || 'new';
        const uiSel = document.getElementById('cinocodeUiModeSelect');
        if (uiSel) uiSel.value = savedUiMode;

        const currentKey = localStorage.getItem('groq_api_key') || "";
        if(document.getElementById('groqApiKeyInput')) document.getElementById('groqApiKeyInput').value = currentKey;

        const currentGeminiKey = localStorage.getItem('gemini_api_key') || "";
        if(document.getElementById('geminiApiKeyInput')) document.getElementById('geminiApiKeyInput').value = currentGeminiKey;

        if(document.getElementById('nvidiaApiKeyInput')) document.getElementById('nvidiaApiKeyInput').value = localStorage.getItem('nvidia_api_key') || "";
        if(document.getElementById('openrouterApiKeyInput')) document.getElementById('openrouterApiKeyInput').value = localStorage.getItem('openrouter_api_key') || "";
        if(document.getElementById('runwareApiKeyInput')) document.getElementById('runwareApiKeyInput').value = localStorage.getItem('runware_api_key') || "";
        if(document.getElementById('xaiApiKeyInput')) document.getElementById('xaiApiKeyInput').value = localStorage.getItem('xai_api_key') || "";
        if(document.getElementById('cloudflareAccountIdInput')) document.getElementById('cloudflareAccountIdInput').value = localStorage.getItem('cloudflare_account_id') || "";
        if(document.getElementById('cloudflareApiTokenInput')) document.getElementById('cloudflareApiTokenInput').value = localStorage.getItem('cloudflare_api_token') || "";

        const currentOllamaIp = localStorage.getItem('ollama_ip') || "";
        document.getElementById('ollamaIpInput').value = currentOllamaIp;

        const currentTtsUrl = localStorage.getItem('tts_url') || "";
        document.getElementById('ttsUrlInput').value = currentTtsUrl;

        const currentAzureKey = localStorage.getItem('azure_speech_key') || "";
        document.getElementById('azureKeyInput').value = currentAzureKey;

        const currentAzureRegion = localStorage.getItem('azure_speech_region') || "";
        document.getElementById('azureRegionInput').value = currentAzureRegion;
        const ttsVoiceLockToggle = document.getElementById('ttsVoiceLockToggle');
        if (ttsVoiceLockToggle) ttsVoiceLockToggle.checked = isTtsVoiceLockEnabled();
        renderVoiceNameEditor();

        const currentVideoMode = localStorage.getItem('video_mode') || "fast";
        document.getElementById('videoModeSelect').value = currentVideoMode;
        const currentVideoQuality = localStorage.getItem('video_quality') || "standard";
        const qualitySelect = document.getElementById('videoQualitySelect');
        if (qualitySelect) qualitySelect.value = currentVideoQuality;
        const freeContentModeInput = document.getElementById('freeContentModeInput');
        if (freeContentModeInput) freeContentModeInput.checked = isFreeContentModeEnabled();
        const responseLengthModeSelect = document.getElementById('responseLengthModeSelect');
        if (responseLengthModeSelect) responseLengthModeSelect.value = getResponseLengthMode();
        const legacyBehaviorInput = document.getElementById('legacyBehaviorInput');
        if (legacyBehaviorInput) legacyBehaviorInput.checked = isLegacyBehaviorMode();
        applyFeatureUiState();

        // Mobil Hizli Ayarlar Senkronizasyonu
        ['modelSelect', 'personaSelect', 'styleModeSelect', 'speechStyleSelect', 'voiceSelect'].forEach(id => {
            const dest = document.getElementById(id + 'Mobile');
            const src = document.getElementById(id);
            if (dest && src) dest.value = src.value;
        });

        setTimeout(() => { settingsMenu.style.opacity = '1'; }, 10);
    }

    function closeSettings() {
        const settingsMenu = document.getElementById('settingsMenu');
        settingsMenu.style.opacity = '0';
        setTimeout(() => {
            settingsMenu.style.display = 'none';
            document.getElementById('settingsOverlay').classList.remove('active');
        }, 300);
    }

    // ===== FAZ 19 — ARAYÜZÜ DÜZENLE OVERLAY =====
    const FZ19_EDITOR_LABELS = {
        styleMode:      { label: 'Üslup Modu Seçimi', desc: 'Güvenli / Dengeli / Serbest mod seçici',  emoji: '🎭', color: '#cba6f7' },
        personaSelect:  { label: 'Persona / Karakter', desc: 'Kanka, Yazılımcı, Meslekler dropdown\u2019ı', emoji: '🤖', color: 'var(--cc-accent-brand)' },
        voiceSelect:    { label: 'Ses Kontrolleri',    desc: 'TTS ses seçimi ve hız/perde ayarları',    emoji: '🔊', color: '#89dceb' },
        microphone:     { label: 'Mikrofon Butonu',    desc: 'Sesli mesaj kaydı ve dikte',              emoji: '🎤', color: '#a6e3a1' },
        ttsButton:      { label: 'Sesli Okuma (TTS)',  desc: 'Yanıtı sesli okutma butonu',              emoji: '📢', color: '#f9e2af' },
        historySidebar: { label: 'Sohbet Geçmişi',    desc: 'Sol panel — geçmiş sohbet listesi',       emoji: '📚', color: '#fab387' },
        profileButton:  { label: 'Profil Butonu',      desc: 'Kullanıcı adı ve hesap yönetimi',         emoji: '👤', color: '#f38ba8' }
    };

    // --- FAZ 19: Keşfet Turu ---
    const FZ19_TOUR_STEPS = [
        { target: null, title: 'CinoCode\'a Hoş Geldin', desc: 'Sohbetten üretim stüdyolarına, projelerden ses araçlarına kadar ana çalışma alanlarını birlikte gezeceğiz.' },
        { target: 'sidebarImageStudioBtn', title: 'Görsel Stüdyosu', desc: 'Metinden görsel üretir veya üretim başarısız olduğunda internette açık lisanslı benzerlerini ararsın.', pref: 'historySidebar' },
        { target: 'sidebarVideoStudioBtn', title: 'Video Stüdyosu', desc: 'Video fikrini sahnelere ayırır ve storyboard/slideshow önizlemesi hazırlar. Gerçek AI video sağlayıcısı henüz bağlı değildir.', pref: 'historySidebar' },
        { target: 'sidebarGameStudioBtn', title: 'Oyun ve Kod', desc: 'Mini oyun, web aracı veya uygulama fikrini çalıştırılabilir HTML çıktısına dönüştürür.', pref: 'historySidebar' },
        { target: 'sidebarDocStudioBtn', title: 'Belge ve ZIP Analizi', desc: 'PDF, DOCX, metin, kod ve güvenli ZIP arşivlerini sohbet bağlamına ekleyebilirsin.', pref: 'historySidebar' },
        { target: 'sidebarProjectsBtn', title: 'Projeler', desc: 'Sohbetleri ve belgeleri çalışma alanlarına ayırır, aynı iş üzerindeki içeriği birlikte tutarsın.', pref: 'historySidebar' },
        { target: 'sidebarMyAppsBtn', title: 'My Apps', desc: 'Hazır üretim akışlarını ve CinoCode içindeki mini uygulamaları tek merkezden açarsın.', pref: 'historySidebar' },
        { target: 'sidebarSkillsBtn', title: 'Beceriler ve Bağlayıcılar', desc: 'Etkin araçları ve OAuth/backend gerektiren bağlantıları dürüst durum etiketleriyle görürsün.', pref: 'historySidebar' },
        { target: 'styleModeSelect', title: 'Üslup Modları', desc: 'Güvenli, Dengeli ve Serbest seçenekleri yanıt tonunu ve içerik sınırlarını belirler.', pref: 'styleMode' },
        { target: 'personaSelect', title: 'Persona ve Meslekler', desc: 'Öğretmen, yazılımcı veya alan uzmanı gibi farklı çalışma rollerini buradan seçersin.', pref: 'personaSelect' },
        { target: 'fz19AttachBtn', title: 'Ekle Menüsü', desc: 'Dosya, fotoğraf, kamera, ses, stüdyo ve proje araçlarının hızlı menüsüdür.' },
        { target: 'webSearchBtn', title: 'İnternette Ara', desc: 'Güncel bilgi gerektiğinde web destekli sohbeti açar; görsel arama ise Openverse üzerinden çalışır.' },
        { target: 'micBtn', title: 'Mikrofon', desc: 'Desteklenen tarayıcılarda konuşmanı metne çevirerek mesaj alanına aktarır.', pref: 'microphone' },
        { target: 'speakerBtn', title: 'Sesli Okuma', desc: 'Asistan yanıtlarını TTS ile dinlersin; otomatik okuma davranışını da buradan yönetirsin.', pref: 'ttsButton' },
        { target: 'voiceControlsContainer', title: 'Ses Kontrolleri', desc: 'Ses karakteri, hız ve perde ayarlarını çalışma biçimine göre özelleştirirsin.', pref: 'voiceSelect' },
        { target: 'userProfile', title: 'Yerel Profil', desc: 'Bu cihazdaki profilini, sohbet dışa aktarımını ve yerel verilerini yönetirsin. Bulut senkronizasyonu henüz yoktur.', pref: 'profileButton' },
        { target: 'settingsBtn', title: 'Ayarlar ve Tema Stüdyosu', desc: 'Sağlayıcı, medya, görünüm ve deneysel özellik ayarlarına; ayrıca Tema Stüdyosu ve bu tura buradan ulaşırsın.' },
        { target: null, title: 'Hazırsın', desc: 'Tur tamamlandı. Ayarlar içindeki “CinoCode\'u Keşfet” düğmesiyle istediğin zaman yeniden başlatabilirsin.' }
    ];

    let fz19VisibleSteps = [];
    let fz19CurrentVisibleIndex = 0;

    function fz19StartTour() {
        const prefs = typeof fz19LoadUiPrefs === 'function' ? fz19LoadUiPrefs() : null;
        fz19VisibleSteps = FZ19_TOUR_STEPS.filter(step => {
            if (step.pref && prefs && prefs.visibility && prefs.visibility[step.pref] === false) return false;
            return true;
        });
        if (fz19VisibleSteps.length === 0) return;

        fz19CurrentVisibleIndex = 0;
        const overlay = document.getElementById('fz19TourOverlay');
        if (!overlay) return;
        overlay.style.display = 'block';

        window.addEventListener('resize', fz19RenderTourStep);
        const mc = document.querySelector('.main-content') || document.querySelector('.chat-area') || document.getElementById('messages');
        if (mc) mc.addEventListener('scroll', fz19RenderTourStep, true);

        fz19ScrollToCurrent();
    }

    function fz19EndTour() {
        const overlay = document.getElementById('fz19TourOverlay');
        if (overlay) overlay.style.display = 'none';
        localStorage.setItem('fz19_tour_seen', '1');
        window.removeEventListener('resize', fz19RenderTourStep);
        const mc = document.querySelector('.main-content') || document.querySelector('.chat-area') || document.getElementById('messages');
        if (mc) mc.removeEventListener('scroll', fz19RenderTourStep, true);
    }

    function fz19NextTourStep() { fz19CurrentVisibleIndex++; fz19ScrollToCurrent(); }
    function fz19PrevTourStep() { fz19CurrentVisibleIndex = Math.max(0, fz19CurrentVisibleIndex - 1); fz19ScrollToCurrent(); }

    function fz19ScrollToCurrent() {
        if (fz19CurrentVisibleIndex >= fz19VisibleSteps.length) return fz19EndTour();
        const step = fz19VisibleSteps[fz19CurrentVisibleIndex];
        let targetEl = step.target ? document.getElementById(step.target) : null;

        if (targetEl && targetEl.offsetParent !== null && window.getComputedStyle(targetEl).display !== 'none') {
            const rect = targetEl.getBoundingClientRect();
            if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(fz19RenderTourStep, 300);
                return;
            }
        }
        fz19RenderTourStep();
    }

    function fz19RenderTourStep() {
        if (fz19CurrentVisibleIndex >= fz19VisibleSteps.length) return fz19EndTour();

        const step = fz19VisibleSteps[fz19CurrentVisibleIndex];
        const mask = document.getElementById('fz19TourMask');
        const card = document.getElementById('fz19TourCard');
        if (!mask || !card) return;

        document.getElementById('fz19TourTitle').textContent = step.title;
        document.getElementById('fz19TourDesc').textContent = step.desc;
        document.getElementById('fz19TourProgress').textContent = (fz19CurrentVisibleIndex + 1) + ' / ' + fz19VisibleSteps.length;
        document.getElementById('fz19TourPrevBtn').style.visibility = fz19CurrentVisibleIndex === 0 ? 'hidden' : 'visible';
        document.getElementById('fz19TourNextBtn').textContent = fz19CurrentVisibleIndex === fz19VisibleSteps.length - 1 ? 'Bitir' : 'İleri';

        let targetEl = step.target ? document.getElementById(step.target) : null;
        if (targetEl && targetEl.offsetParent !== null && window.getComputedStyle(targetEl).display !== 'none') {
            const rect = targetEl.getBoundingClientRect();
            mask.style.opacity = '1';
            mask.style.width = (rect.width + 12) + 'px';
            mask.style.height = (rect.height + 12) + 'px';
            mask.style.left = (rect.left - 6) + 'px';
            mask.style.top = (rect.top - 6) + 'px';
            card.style.transform = 'none';

            // Kartı hedefin altına sığdır, sığmazsa üstüne koy
            if (rect.bottom + 220 < window.innerHeight) {
                card.style.top = (rect.bottom + 15) + 'px';
            } else {
                card.style.top = Math.max(10, (rect.top - 200)) + 'px';
            }

            // Kartın sağa/sola taşmasını önle
            let proposedLeft = rect.left + (rect.width / 2) - 140; // ortalamaya çalış
            let maxLeft = window.innerWidth - 290;
            card.style.left = Math.max(10, Math.min(proposedLeft, maxLeft)) + 'px';
        } else {
            mask.style.opacity = '0';
            card.style.left = '50%';
            card.style.top = '50%';
            card.style.transform = 'translate(-50%, -50%)';
        }
    }

    function openFz19Editor() {
        if (typeof closeSettings === 'function') closeSettings();
        const prefs = fz19LoadUiPrefs();
        fz19RenderToggles(prefs);
        fz19HighlightThemeCard(prefs.theme);
        document.getElementById('fz19UiEditOverlay').classList.add('active');
        const menu = document.getElementById('fz19UiEditMenu');
        menu.style.display = 'flex';
        setTimeout(() => menu.style.opacity = '1', 50);
    }

    function closeFz19Editor() {
        const menu = document.getElementById('fz19UiEditMenu');
        menu.style.opacity = '0';
        setTimeout(() => {
            menu.style.display = 'none';
            document.getElementById('fz19UiEditOverlay').classList.remove('active');
        }, 300);
    }

    function fz19RenderToggles(prefs) {
        const container = document.getElementById('fz19ToggleList');
        if (!container) return;
        container.innerHTML = '';
        Object.keys(FZ19_EDITOR_LABELS).forEach(k => {
            const checked = prefs.visibility[k] !== false;
            const info = FZ19_EDITOR_LABELS[k];
            const row = document.createElement('div');
            row.className = 'fz19-toggle-row';
            row.style.cssText = 'padding:8px 10px; border-radius: var(--cc-radius); background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);';
            row.innerHTML = `
                <span class="fz19-toggle-label" style="flex-direction:column; align-items:flex-start; gap:2px;">
                    <span style="display:flex; align-items:center; gap:7px; font-weight:600;">
                        <span style="font-size:16px; width:22px; text-align:center;">${info.emoji}</span>
                        <span style="color:${info.color};">${info.label}</span>
                    </span>
                    <span style="font-size:10px; color:#6c7086; padding-left:29px;">${info.desc}</span>
                </span>
                <label class="fz19-toggle" style="--fz19-accent:${info.color};">
                    <input type="checkbox" id="fz19Toggle_${k}" ${checked ? 'checked' : ''} onchange="fz19ToggleChanged()">
                    <span class="fz19-slider"></span>
                </label>`;
            container.appendChild(row);
        });
    }

    function fz19ToggleChanged() {
        fz19HighlightThemeCard('custom');
    }

    function fz19SelectTheme(theme) {
        const presets = FZ19_THEME_PRESETS[theme];
        if (!presets) return;
        Object.keys(presets).forEach(k => {
            const el = document.getElementById('fz19Toggle_' + k);
            if (el) el.checked = presets[k];
        });
        fz19HighlightThemeCard(theme);
    }

    function fz19HighlightThemeCard(theme) {
        ['sade', 'dengeli', 'tam'].forEach(t => {
            const card = document.getElementById('fz19Card' + t.charAt(0).toUpperCase() + t.slice(1));
            if (card) card.classList.toggle('fz19-selected', t === theme);
        });
    }

    function fz19SaveAndClose() {
        const visibility = {};
        Object.keys(FZ19_EDITOR_LABELS).forEach(k => {
            const el = document.getElementById('fz19Toggle_' + k);
            visibility[k] = el ? el.checked : true;
        });
        const selectedCard = document.querySelector('.fz19-theme-card.fz19-selected');
        let theme = 'custom';
        if (selectedCard) {
            theme = selectedCard.id.replace('fz19Card', '').toLowerCase();
        }
        fz19SaveUiPrefs({ theme, visibility });
        fz19ApplyUiPrefs();
        closeFz19Editor();
        if (typeof showNonBlockingToast === 'function') showNonBlockingToast('Arayüz tercihleri kaydedildi! ✓');
    }

    function fz19ResetToDefault() {
        if (!confirm('Tüm arayüz tercihleri sıfırlanacak (Tam tema — her şey açık). Devam edilsin mi?')) return;
        fz19SaveUiPrefs({ theme: 'tam', visibility: { ...FZ19_THEME_PRESETS.tam } });
        fz19ApplyUiPrefs();
        closeFz19Editor();
        if (typeof showNonBlockingToast === 'function') showNonBlockingToast('Arayüz varsayılana döndürüldü! ✓');
    }
    // ===== FAZ 19 — ARAYÜZÜ DÜZENLE OVERLAY SONU =====

    function getRandomApiKey(keyStr) {
        if (!keyStr) return "";
        const keys = keyStr.split(',').map(k => k.trim()).filter(k => k);
        if (keys.length === 0) return "";
        return keys[Math.floor(Math.random() * keys.length)];
    }

    const PROXY_CLOUD_MODELS = ['openai', 'cerebras', 'deepseek', 'mistral', 'openrouter', 'gemini', 'groq', 'fireworks', 'together', 'anthropic'];

    function isProxyCloudModel(modelValue) {
        return PROXY_CLOUD_MODELS.includes(String(modelValue || '').trim().toLowerCase());
    }

    function isVisionCapableModel(modelValue) {
        if (!modelValue) return false;
        const proxyVisionProviders = ['openai', 'gemini', 'openrouter', 'groq', 'anthropic'];
        if (isProxyCloudModel(modelValue)) return proxyVisionProviders.includes(String(modelValue).trim().toLowerCase());
        const v = modelValue.toLowerCase();
        return v.includes('llava')
            || v.includes('nvidia')
            || v.includes('vision-instruct')
            || v.includes('vision')
            || v.includes('scout');
    }

    function getPreferredVisionModel(currentModel = "") {
        const modelSelect = document.getElementById('modelSelect');
        const hasOption = (value) => !!(modelSelect && Array.from(modelSelect.options).some(opt => opt.value === value));
        const current = String(currentModel || '').trim();
        const currentLower = current.toLowerCase();
        if (['openai', 'gemini', 'openrouter', 'groq', 'anthropic'].includes(currentLower) && hasOption(current)) return current;
        if (currentLower.includes('nvidia') && (localStorage.getItem('nvidia_api_key') || '').trim() && hasOption(current)) return current;
        if ((currentLower.includes('llava') || currentLower.includes('vision')) && !currentLower.includes('openrouter') && !currentLower.includes('groq') && hasOption(current)) return current;

        const orderedVisionModels = [
            'openai',
            'gemini',
            'groq',
            'openrouter',
            'anthropic',
            'meta-llama/llama-4-scout-17b-16e-instruct-groq'
        ];
        if ((localStorage.getItem('nvidia_api_key') || '').trim()) {
            orderedVisionModels.push('nvidia/nemotron-nano-12b-v2-vl-nvidia');
        }
        return orderedVisionModels.find(hasOption) || "";
    }

    const PROVIDER_MODEL_GROUPS = {
        openai: [
            { value: 'openai', label: 'GPT-5.5', desc: 'En guclu genel zeka' },
            { value: 'openai', label: 'GPT-5.5 Thinking', desc: 'Zor isler / uzun akil yurutme' },
            { value: 'openai', label: 'Image', desc: 'Gorsel uretim' }
        ],
        xai: [
            { value: 'grok-3-xai', label: 'Grok 3', desc: 'Grok en güçlü genel zeka' },
            { value: 'grok-3-mini-xai', label: 'Grok 3 Mini', desc: 'Grok hızlı / ekonomik sohbet' }
        ],
        gemini: [
            { value: 'gemini', label: 'Gemini', desc: 'Uzun baglam / dosya / multimodal' }
        ],
        claude: [
            { value: 'openrouter', label: 'Claude', desc: 'Yazi kalitesi / planlama / UI metni' }
        ],
        ollama: [
            { value: 'qwen2.5:14b', label: 'Qwen 2.5 14B', desc: 'Yerel model / ucretsiz deneme' },
            { value: 'qwen2.5', label: 'Qwen 2.5 7B', desc: 'Yerel hizli deneme' },
            { value: 'llama3:8b', label: 'Llama 3 8B', desc: 'Yerel sohbet' },
            { value: 'llava', label: 'LLaVA', desc: 'Yerel gorsel analiz' }
        ]
    };

    function ensureProviderShell() {
        if (document.getElementById('providerShell')) return;
        const modelSelect = document.getElementById('modelSelect');
        if (!modelSelect || !modelSelect.parentNode) return;
        const shell = document.createElement('div');
        shell.className = 'provider-shell';
        shell.id = 'providerShell';
        shell.innerHTML = '<select id="providerSelect" title="Provider" onchange="renderProviderModels()"></select><select id="providerModelSelect" title="Provider Modeli" onchange="syncProviderModelToLegacySelect()"></select><div class="provider-hint" id="providerHint">Provider secimi deneysel kabuktur.</div>';
        modelSelect.parentNode.insertBefore(shell, modelSelect.nextSibling);
        const providerSelect = document.getElementById('providerSelect');
        if (providerSelect) {
            providerSelect.innerHTML = [
                '<option value="openai">OpenAI</option>',
                '<option value="xai">Grok / xAI</option>',
                '<option value="gemini">Gemini</option>',
                '<option value="claude">Claude</option>',
                '<option value="ollama">Ollama</option>'
            ].join('');
        }
        renderProviderModels();
    }

    function renderProviderModels() {
        const providerSelect = document.getElementById('providerSelect');
        const modelSelect = document.getElementById('providerModelSelect');
        const hint = document.getElementById('providerHint');
        if (!providerSelect || !modelSelect) return;
        const provider = providerSelect.value || 'openai';
        const models = PROVIDER_MODEL_GROUPS[provider] || PROVIDER_MODEL_GROUPS.openai;
        modelSelect.innerHTML = models.map((model, index) => `<option value="${model.value}" data-desc="${model.desc.replace(/"/g, '&quot;')}" ${index === 0 ? 'selected' : ''}>${model.label}</option>`).join('');
        if (hint) {
            const desc = models[0] ? models[0].desc : '';
            hint.textContent = provider === 'xai'
                ? desc + ' — Ayarlar > xAI API Key gerekir.'
                : desc;
        }
        syncProviderModelToLegacySelect();
    }

    function syncProviderModelToLegacySelect() {
        const providerModel = document.getElementById('providerModelSelect');
        const legacyModel = document.getElementById('modelSelect');
        const hint = document.getElementById('providerHint');
        if (!providerModel || !legacyModel) return;
        const value = providerModel.value;
        const hasOption = Array.from(legacyModel.options).some(opt => opt.value === value);
        if (hasOption) legacyModel.value = value;
        const selected = providerModel.options[providerModel.selectedIndex];
        if (hint && selected && selected.dataset.desc) {
            const provider = document.getElementById('providerSelect')?.value;
            hint.textContent = provider === 'xai'
                ? selected.dataset.desc + ' — Ayarlar > xAI API Key gerekir.'
                : selected.dataset.desc;
        }
    }

    function populateNewProjectModels() {
        const target = document.getElementById('newProjectModel');
        const legacyModel = document.getElementById('modelSelect');
        if (!target || !legacyModel || target.dataset.ready === '1') return;
        target.innerHTML = Array.from(legacyModel.options)
            .filter(opt => !opt.disabled && opt.value)
            .map(opt => `<option value="${opt.value}">${opt.textContent}</option>`)
            .join('');
        target.dataset.ready = '1';
    }

    async function saveSettings() {
        const settingsStyle = document.getElementById('settingsStyleModeSelect');
        if (settingsStyle && settingsStyle.value === 'free') {
            const verified = await checkAgeGate();
            if (!verified) {
                settingsStyle.value = getFeatureValue('styleMode') || 'safe';
            }
        }

        const groqKey = document.getElementById('groqApiKeyInput')?.value?.trim() || "";
        localStorage.setItem('groq_api_key', groqKey);

        const nvidiaKey = document.getElementById('nvidiaApiKeyInput')?.value?.trim() || "";
        localStorage.setItem('nvidia_api_key', nvidiaKey);

        const openrouterKey = document.getElementById('openrouterApiKeyInput')?.value?.trim() || "";
        localStorage.setItem('openrouter_api_key', openrouterKey);

        const runwareKey = document.getElementById('runwareApiKeyInput')?.value?.trim() || "";
        localStorage.setItem('runware_api_key', runwareKey);

        const xaiKey = document.getElementById('xaiApiKeyInput')?.value?.trim() || "";
        localStorage.setItem('xai_api_key', xaiKey);

        // Cloudflare sonraki faz — kaydetme devre dışı

        const ollamaIp = document.getElementById('ollamaIpInput').value.trim();
        localStorage.setItem('ollama_ip', ollamaIp);

        const ttsUrl = document.getElementById('ttsUrlInput').value.trim();
        localStorage.setItem('tts_url', ttsUrl);

        const azureKey = document.getElementById('azureKeyInput').value.trim();
        localStorage.setItem('azure_speech_key', azureKey);

        const azureRegion = document.getElementById('azureRegionInput').value.trim();
        localStorage.setItem('azure_speech_region', azureRegion);

        const ttsVoiceLockToggle = document.getElementById('ttsVoiceLockToggle');
        localStorage.setItem('cinocode_tts_voice_lock_enabled', (!ttsVoiceLockToggle || ttsVoiceLockToggle.checked) ? '1' : '0');

        const videoMode = document.getElementById('videoModeSelect').value;
        localStorage.setItem('video_mode', videoMode);
        const videoQuality = document.getElementById('videoQualitySelect').value;
        localStorage.setItem('video_quality', videoQuality);
        const freeContentModeInput = document.getElementById('freeContentModeInput');
        localStorage.setItem('free_content_mode', freeContentModeInput && freeContentModeInput.checked ? '1' : '0');
        const responseLengthModeSelect = document.getElementById('responseLengthModeSelect');
        if (responseLengthModeSelect) localStorage.setItem('cinocode_response_length_mode', responseLengthModeSelect.value || 'normal');
        const legacyBehaviorInput = document.getElementById('legacyBehaviorInput');
        localStorage.setItem('cinocode_behavior_version', legacyBehaviorInput && legacyBehaviorInput.checked ? 'legacy' : 'current');
        const settingsSpeech = document.getElementById('settingsSpeechStyleSelect');
        const smartInput = document.getElementById('smartSuggestionsInput');
        const newProjectInput = document.getElementById('newProjectInput');
        const providerInput = document.getElementById('providerViewInput');
        const liveInput = document.getElementById('liveSearchInput');
        if (settingsStyle) setFeatureValue('styleMode', settingsStyle.value || 'safe');
        if (settingsSpeech) setFeatureValue('speechStyle', settingsSpeech.value || 'default');
        if (smartInput) setFeatureValue('smartSuggestions', smartInput.checked ? '1' : '0');
        if (newProjectInput) setFeatureValue('newProject', newProjectInput.checked ? '1' : '0');
        if (providerInput) setFeatureValue('providerView', providerInput.checked ? '1' : '0');
        if (liveInput) setFeatureValue('liveSearch', liveInput.checked ? '1' : '0');
        applyFeatureUiState();

        closeSettings();
        if(typeof showNonBlockingToast === 'function') showNonBlockingToast('Ayarlar kaydedildi!');
    }

    let sessions = {}; // Tüm sohbetleri tutan obje
    let currentChatId = null;
    let projects = {}; // Projeler (sohbet gruplama) objesi
    let activeProjectId = null;
    let currentProjectTab = 'sohbetler';
    window.switchProjectTab = function(tab) {
        currentProjectTab = tab;
        if (typeof renderProjectsScreen === 'function') renderProjectsScreen();
    };
 // Projeler ekranında açık olan proje (null = proje grid'i)

    // ----- HAFIZA (LOCALSTORAGE) YÖNETİMİ -----
    function escapeHtmlText(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    }

    function escapeSidebarHtml(value) {
        return escapeHtmlText(value);
    }

    function getSafeMessageImageSrc(value) {
        const raw = String(value || "").trim();
        const safeDataImage = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw);
        const safeRemoteImage = /^https?:\/\/[^\s"'<>]+$/i.test(raw);
        const safeBlobImage = /^blob:[^\s"'<>]+$/i.test(raw);
        return safeDataImage || safeRemoteImage || safeBlobImage ? escapeHtmlText(raw) : "";
    }

    let activeTrustedRenderContext = null;

    function createTrustedRenderContext() {
        const randomId = window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        return { nonce: randomId.replace(/[^a-z0-9-]/gi, ''), fragments: [] };
    }

    function registerTrustedRenderFragment(html) {
        if (!activeTrustedRenderContext) return html;
        const index = activeTrustedRenderContext.fragments.push(String(html)) - 1;
        return `<span data-cinocode-fragment="${activeTrustedRenderContext.nonce}-${index}"></span>`;
    }

    function sanitizeRenderedHtml(html, context) {
        let cleanHtml;
        if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
            cleanHtml = window.DOMPurify.sanitize(String(html || ""), {
                USE_PROFILES: { html: true },
                FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'svg', 'math'],
                FORBID_ATTR: ['srcdoc'],
                ALLOW_DATA_ATTR: true
            });
        } else {
            console.error('DOMPurify yüklenemedi; güvenli metin görünümüne geçildi.');
            cleanHtml = escapeHtmlText(html);
        }

        if (context) {
            context.fragments.forEach((fragment, index) => {
                const placeholder = `<span data-cinocode-fragment="${context.nonce}-${index}"></span>`;
                cleanHtml = cleanHtml.split(placeholder).join(fragment);
            });
        }
        return cleanHtml;
    }

    function renderMarkdownSafely(markdown) {
        const context = createTrustedRenderContext();
        const previousContext = activeTrustedRenderContext;
        activeTrustedRenderContext = context;
        try {
            return sanitizeRenderedHtml(marked.parse(String(markdown || "")), context);
        } finally {
            activeTrustedRenderContext = previousContext;
        }
    }

    function normalizeChatMetadata(chat, fallbackTime = Date.now()) {
        if (!chat || typeof chat !== "object") return false;
        let changed = false;
        if (!Array.isArray(chat.messages)) {
            chat.messages = [{ role: "system", content: systemPrompt }];
            changed = true;
        }
        if (!chat.title || typeof chat.title !== "string") {
            chat.title = "Yeni Sohbet";
            changed = true;
        }
        if (!Number.isFinite(Number(chat.createdAt))) {
            chat.createdAt = Number(chat.updatedAt) || fallbackTime;
            changed = true;
        } else {
            chat.createdAt = Number(chat.createdAt);
        }
        if (!Number.isFinite(Number(chat.updatedAt))) {
            chat.updatedAt = Number(chat.createdAt) || fallbackTime;
            changed = true;
        } else {
            chat.updatedAt = Number(chat.updatedAt);
        }
        if (typeof chat.starred !== "boolean") {
            chat.starred = chat.isPinned === true;
            changed = true;
        }
        if (typeof chat.manualTitle !== "boolean") {
            chat.manualTitle = false;
            changed = true;
        }
        if (chat.projectId !== null && typeof chat.projectId !== "string") {
            chat.projectId = null;
            changed = true;
        }
        if (chat.projectId && !projects[chat.projectId]) {
            // Silinmiş bir projeye işaret ediyorsa sohbeti projesiz bırak.
            chat.projectId = null;
            changed = true;
        }
        return changed;
    }

    function normalizeAllChatMetadata() {
        let changed = false;
        const now = Date.now();
        for (const id in sessions) {
            changed = normalizeChatMetadata(sessions[id], now) || changed;
        }
        return changed;
    }

    let isSavingDB = false;
    let pendingSave = false;

    async function doSaveToIDB() {
        if (isSavingDB) {
            pendingSave = true;
            return;
        }
        isSavingDB = true;
        try {
            const dbKey = "cinocode_db_" + (loggedUser || "default");
            let clonedSessions = JSON.parse(JSON.stringify(sessions));
            if (window.useLocalStorageFallback) {
                localStorage.setItem(dbKey, JSON.stringify({ sessions: clonedSessions, currentChatId, projects }));
            } else {
                await CinoDB.put('workspaces', dbKey, { sessions: clonedSessions, currentChatId, projects });
            }
        } catch (e) {
            console.error("IDB save error", e);
            window.useLocalStorageFallback = true;
            try {
                const dbKey = "cinocode_db_" + (loggedUser || "default");
                localStorage.setItem(dbKey, JSON.stringify({ sessions, currentChatId, projects }));
            } catch(fallbackErr) {
                console.error("IDB and LocalStorage save both failed", fallbackErr);
            }
        } finally {
            isSavingDB = false;
            if (pendingSave) {
                pendingSave = false;
                doSaveToIDB();
            }
        }
    }

    function saveDatabase() {
        normalizeAllChatMetadata();
        doSaveToIDB();
        renderSidebar();
    }

    async function loadDatabase() {
        const dbKey = "cinocode_db_" + (loggedUser || "default");
        let rawLocal = localStorage.getItem(dbKey);
        let dbData = null;
        let migrated = false;

        try {
            await CinoDB.init();
            let idbData = await CinoDB.get('workspaces', dbKey);

            if (idbData) {
                dbData = idbData;
            } else if (rawLocal) {
                // Migration
                dbData = JSON.parse(rawLocal);
                await CinoDB.put('workspaces', dbKey, dbData);
                console.log("[CinoCode] Veritabanı IndexedDB'ye taşındı!");
                // localStorage.removeItem(dbKey); // Gelecekte silinebilir. Şimdilik yedek amaçlı tutuyoruz.
            }
        } catch(e) {
            console.error("IndexedDB load failed, falling back to localStorage", e);
            window.useLocalStorageFallback = true;
            if (rawLocal) {
                try { dbData = JSON.parse(rawLocal); } catch(e) {}
            }
        }

        if (dbData) {
            sessions = (dbData.sessions && typeof dbData.sessions === "object") ? dbData.sessions : {};
            currentChatId = dbData.currentChatId || null;
            projects = (dbData.projects && typeof dbData.projects === "object") ? dbData.projects : {};
            migrated = normalizeAllChatMetadata();
        } else {
            sessions = {};
            currentChatId = null;
            projects = {};
        }

        // Eğer hiç sohbet yoksa yeni oluştur
        if (Object.keys(sessions).length === 0 || !currentChatId || !sessions[currentChatId]) {
            createNewChat({ preserveComposer: true });
        } else {
            if (migrated) saveDatabase();
            renderSidebar();
            renderCurrentChat();
        }
    }

    function createNewChat(options = {}) {
        if (!options.preserveComposer) {
            clearComposerDraft();
            clearComposerAttachments();
            setComposerValue('', { save: false, focus: false });
        }
        const newId = "chat_" + Date.now();
        sessions[newId] = {
            title: "Yeni Sohbet",
            messages: [{ role: "system", content: systemPrompt }],
            createdAt: Date.now(),
            starred: false,
            manualTitle: false,
            updatedAt: Date.now(),
            projectId: (options.projectId && projects[options.projectId]) ? options.projectId : null
        };
        currentChatId = newId;
        saveDatabase();
        renderCurrentChat();
    }

    function switchChat(id) {
        if (!sessions[id]) return;
        currentChatId = id;
        sessions[id].updatedAt = Date.now();
        saveDatabase();
        renderCurrentChat();
        window.speechSynthesis.cancel();
        // Sohbet değiştirildiğinde kesinlikle en alta kaydır
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 400);
        setTimeout(scrollToBottom, 1000);
    }

    function deleteChat(id, event) {
        event.stopPropagation(); // Satıra tıklamayı engelle
        if(confirm("Sohbeti silmek istediğine emin misin?")) {
            const deletedProjectId = sessions[id] ? (sessions[id].projectId || null) : null;
            delete sessions[id];
            if (currentChatId === id) {
                // Aynı proje kapsamındaki (veya projesiz) bir sohbete geç, farklı bir projenin sohbetine sıçrama.
                const sameScope = Object.keys(sessions).filter(cid => (sessions[cid]?.projectId || null) === deletedProjectId);
                const remaining = getSortedChatIds(sameScope);
                currentChatId = remaining.length > 0 ? remaining[0] : null;
            }
            if(!currentChatId) {
                createNewChat({ projectId: deletedProjectId });
            } else {
                saveDatabase();
                renderCurrentChat();
            }
        }
    }


    function toggleChatMenu(id, event) {
        event.stopPropagation();
        document.querySelectorAll('.chat-action-menu').forEach(menu => {
            if (menu.id !== 'menu-' + id) menu.classList.remove('active');
        });
        const menu = document.getElementById('menu-' + id);
        menu.classList.toggle('active');
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.chat-action-menu').forEach(menu => {
                menu.classList.remove('active');
                const parentActions = menu.closest('.msg-actions');
                if (parentActions) parentActions.classList.remove('has-active-menu');
            });
        }
    });

    document.addEventListener('click', () => {
        document.querySelectorAll('.chat-action-menu').forEach(menu => menu.classList.remove('active'));
    });

    // Video butonları için event delegation
    document.addEventListener('click', (e) => {
        const button = e.target.closest('[data-video-action]');
        if (!button) return;

        const action = button.getAttribute('data-video-action');
        const rawPrompt = button.getAttribute('data-video-prompt') || '';
        const prompt = (() => { try { return decodeURIComponent(rawPrompt); } catch(e) { return rawPrompt; } })();
        const containerId = button.getAttribute('data-video-container');
        const videoUrl = button.getAttribute('data-video-url');

        switch(action) {
            case 'regenerate':
                if (prompt && containerId) {
                    window.regenerateVideo(prompt, containerId);
                } else {
                    alert('Bu video için prompt bulunamadı.');
                }
                break;
            case 'edit':
                if (prompt) {
                    window.editVideoPrompt(prompt);
                }
                break;
            case 'delete':
                if (containerId) {
                    window.deleteVideoCard(containerId);
                }
                break;
            case 'copy':
                if (prompt) {
                    window.copyPromptToClipboard(prompt);
                }
                break;
            case 'download':
                if (videoUrl) {
                    window.downloadVideo(videoUrl);
                } else {
                    alert('Video indirilemedi.');
                }
                break;
        }
    });
    function pinChat(id, event) {
        toggleStarChat(id, event);
    }

    function toggleStarChat(id, event) {
        event.stopPropagation();
        if (!sessions[id]) return;
        sessions[id].starred = !sessions[id].starred;
        sessions[id].isPinned = sessions[id].starred;
        saveDatabase();
        renderSidebar();
    }

    function renameChat(id, event) {
        event.stopPropagation(); // Tıklamayı engelle
        if (!sessions[id]) return;
        const currentTitle = sessions[id].title;
        const newTitle = prompt("Sohbetin yeni adını girin:", currentTitle);
        if (newTitle !== null && newTitle.trim() !== "") {
            sessions[id].title = newTitle.trim();
            sessions[id].manualTitle = true;
            sessions[id].updatedAt = Date.now();
            saveDatabase();
        }
    }

    // ----- UI RENDER İŞLEMLERİ -----
    function getSortedChatIds(ids) {
        return ids.sort((a,b) => (Number(sessions[b]?.updatedAt) || 0) - (Number(sessions[a]?.updatedAt) || 0));
    }

    function renderChatSection(title, ids) {
        if (!ids.length) return null;
        const section = document.createElement("div");
        section.className = "chat-section";
        const heading = document.createElement("div");
        heading.className = "chat-section-title";
        heading.textContent = title;
        section.appendChild(heading);
        ids.forEach(id => section.appendChild(renderChatRow(id)));
        return section;
    }

    function renderChatRow(id, isSubItem = false) {
        const chat = sessions[id];
        const div = document.createElement("div");
        div.className = `chat-item ${id === currentChatId ? "active" : ""} ${isSubItem ? "project-sub-item" : ""}`;
        if (isSubItem) {
            div.style.paddingLeft = "30px";
            div.style.background = "rgba(255,255,255,0.02)";
        }
        div.onclick = () => switchChat(id);
        const safeTitle = escapeSidebarHtml(chat.title || "Yeni Sohbet");
        const starLabel = chat.starred ? "Yıldızı kaldır" : "Yıldızla";
        const starIcon = chat.starred ? "★" : "☆";

        div.innerHTML = `
            <div class="chat-item-title" title="${safeTitle}">
                <span aria-hidden="true">${starIcon}</span>
                <span>${safeTitle}</span>
            </div>
            <div class="chat-actions">
                <button class="action-btn chat-menu-btn" onclick="toggleChatMenu('${id}', event)" title="Sohbet menüsü" aria-label="Sohbet menüsü">⋮</button>
            </div>
            <div class="chat-action-menu" id="menu-${id}">
                <button class="chat-menu-item" onclick="toggleStarChat('${id}', event)">${starLabel}</button>
                <button class="chat-menu-item" onclick="renameChat('${id}', event)">Yeniden adlandır</button>
                <button class="chat-menu-item" onclick="assignChatToProject('${id}', event)">Projeye ekle</button>
                <button class="chat-menu-item danger" onclick="deleteChat('${id}', event)">Sil</button>
            </div>
        `;
        return div;
    }

    function renderSidebar() {
        chatListDiv.innerHTML = "";
        normalizeAllChatMetadata();

        // Ana sidebar sadece projesiz sohbetleri gösterir; projeli sohbetler kendi proje sayfasında listelenir.
        const allIds = Object.keys(sessions).filter(id => !sessions[id]?.projectId);

        if (typeof renderProjectSection === 'function') {
            const pSec = renderProjectSection();
            if (pSec) chatListDiv.appendChild(pSec);
        }

        const starredIds = getSortedChatIds(allIds.filter(id => sessions[id]?.starred === true));
        const recentIds = getSortedChatIds(allIds.filter(id => sessions[id]?.starred !== true));
        const starredSection = renderChatSection("Yıldızlı", starredIds);
        if (starredSection) chatListDiv.appendChild(starredSection);
        const recentSection = renderChatSection("Son Sohbetler", recentIds);
        if (recentSection) chatListDiv.appendChild(recentSection);

         else {
            chatListDiv.scrollTop = 0; // Doğal olarak üstten başla
        }
    }

    // ----- PROJELER (sohbet gruplama) -----
    function getSortedProjectIds() {
        return Object.keys(projects).sort((a, b) => (Number(projects[b]?.updatedAt) || 0) - (Number(projects[a]?.updatedAt) || 0));
    }

    function createProjectRecord(name, description) {
        const id = "proj_" + Date.now();
        projects[id] = {
            id,
            name: name,
            description: description || "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            starred: false,
            archived: false
        };
        saveDatabase();
        return id;
    }


    function cinocodeAsyncPrompt(titleText, defaultValue = "", placeholderText = "") {
        return new Promise((resolve) => {
            const modal = document.getElementById('cinocodeCustomPromptModal');
            const title = document.getElementById('customPromptTitle');
            const input = document.getElementById('customPromptInput');
            const cancelBtn = document.getElementById('customPromptCancelBtn');
            const confirmBtn = document.getElementById('customPromptConfirmBtn');

            if (!modal || !title || !input || !cancelBtn || !confirmBtn) {
                resolve(window.prompt(titleText, defaultValue));
                return;
            }

            title.textContent = titleText;
            input.value = defaultValue;
            input.placeholder = placeholderText;
            modal.style.display = 'flex';
            input.focus();

            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
                input.onkeydown = null;
            };

            confirmBtn.onclick = () => {
                const val = input.value;
                cleanup();
                resolve(val);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(null);
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    confirmBtn.click();
                } else if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            };
        });
    }

    async function promptCreateProject() {
        const name = await cinocodeAsyncPrompt("Proje adı:", "", "Örn: Yeni Proje");
        if (!name || !name.trim()) return;
        const description = await cinocodeAsyncPrompt("Proje açıklaması (opsiyonel):", "") || "";
        const id = createProjectRecord(name.trim(), description.trim());
        activeProjectId = id;
        renderProjectsScreen();
    }

    function toggleProjectMenu(id, event) {
        event.stopPropagation();
        document.querySelectorAll('.chat-action-menu').forEach(menu => {
            if (menu.id !== 'project-menu-' + id) menu.classList.remove('active');
        });
        const menu = document.getElementById('project-menu-' + id);
        if (menu) menu.classList.toggle('active');
    }

    function toggleStarProject(id, event) {
        event.stopPropagation();
        if (!projects[id]) return;
        projects[id].starred = !projects[id].starred;
        projects[id].updatedAt = Date.now();
        saveDatabase();
        renderProjectsScreen();
    }

    async function editProjectDetails(id, event) {
        event.stopPropagation();
        if (!projects[id]) return;
        const newName = prompt("Proje adı:", projects[id].name);
        if (newName === null || !newName.trim()) return;
        const newDesc = prompt("Proje açıklaması:", projects[id].description || "");
        projects[id].name = newName.trim();
        projects[id].description = (newDesc || "").trim();
        projects[id].updatedAt = Date.now();
        saveDatabase();
        renderProjectsScreen();
    }

    function archiveProject(id, event) {
        event.stopPropagation();
        if (!projects[id]) return;
        projects[id].archived = !projects[id].archived;
        projects[id].updatedAt = Date.now();
        saveDatabase();
        renderProjectsScreen();
    }

    function deleteProject(id, event) {
        event.stopPropagation();
        if (!projects[id]) return;
        if (!confirm('Projeyi silmek istediğine emin misin? İçindeki sohbetler silinmez, sadece projesiz kalır.')) return;
        Object.keys(sessions).forEach(cid => {
            if (sessions[cid] && sessions[cid].projectId === id) {
                sessions[cid].projectId = null;
            }
        });
        delete projects[id];
        if (activeProjectId === id) activeProjectId = null;
        saveDatabase();
        renderProjectsScreen();
    }

    function assignChatToProject(id, event) {
        event.stopPropagation();
        if (!sessions[id]) return;
        const projectIds = getSortedProjectIds().filter(pid => !projects[pid].archived);
        if (projectIds.length === 0) {
            alert('Henüz bir proje yok. Önce "📁 Projeler" ekranından yeni proje oluştur.');
            return;
        }
        const list = projectIds.map((pid, i) => `${i + 1}. ${projects[pid].name}`).join('\n');
        const currentIndex = sessions[id].projectId ? projectIds.indexOf(sessions[id].projectId) + 1 : 0;
        const choice = prompt(`Bu sohbeti hangi projeye eklemek istersin?\n\n0. Projesiz bırak\n${list}\n\nNumara gir:`, String(currentIndex));
        if (choice === null) return;
        const num = parseInt(choice.trim(), 10);
        if (!Number.isFinite(num)) return;
        if (num === 0) {
            sessions[id].projectId = null;
        } else if (num >= 1 && num <= projectIds.length) {
            sessions[id].projectId = projectIds[num - 1];
        } else {
            return;
        }
        sessions[id].updatedAt = Date.now();
        saveDatabase();
    }

    function openProjectsScreen() {
        activeProjectId = null;
        document.getElementById('messages').style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'none';
        const libScreen = document.getElementById('libraryScreen');
        if (libScreen) libScreen.style.display = 'none';
        const sc = document.getElementById("suggestionChipsContainer");
        if (sc) sc.style.display = "none";
        document.getElementById('projectsScreen').style.display = 'flex';
        renderProjectsScreen();
    }

    function closeProjectsScreen() {
        if (activeProjectId) {
            activeProjectId = null;
            renderProjectsScreen();
            return;
        }
        document.getElementById('projectsScreen').style.display = 'none';
        renderCurrentChat();
    }

    function openProject(projectId) {
        activeProjectId = projectId;
        renderProjectsScreen();
    }

    function openChatFromProject(id) {
        document.getElementById('projectsScreen').style.display = 'none';
        switchChat(id);
    }

    function startNewChatInProject(projectId) {
        document.getElementById('projectsScreen').style.display = 'none';
        createNewChat({ projectId: projectId });
    }

    function uploadDocumentToProject(projectId) {
        if (!projectId || !projects[projectId]) {
            showNonBlockingToast('Belgenin ekleneceği proje bulunamadı.');
            return;
        }
        const activeChat = sessions[currentChatId];
        document.getElementById('projectsScreen').style.display = 'none';
        if (!activeChat || activeChat.projectId !== projectId) {
            createNewChat({ projectId });
        } else {
            renderCurrentChat();
        }
        setTimeout(() => {
            triggerFileInput('docUpload');
        }, 0);
    }

    function promptAddNote(projectId) {
        const note = prompt("Yeni notunuzu girin:");
        if (note && note.trim()) {
            if (projects[projectId]) {
                if (!projects[projectId].notes) projects[projectId].notes = [];
                projects[projectId].notes.push({
                    content: note.trim(),
                    createdAt: new Date().toISOString()
                });
                saveDatabase();
                renderProjectsScreen();
            }
        }
    }

    function deleteNote(projectId, index) {
        if (confirm("Bu notu silmek istediğinize emin misiniz?")) {
            if (projects[projectId] && projects[projectId].notes) {
                projects[projectId].notes.splice(index, 1);
                saveDatabase();
                renderProjectsScreen();
            }
        }
    }

    function renderProjectsScreen() {
        const titleEl = document.getElementById('projectsScreenTitle');
        const content = document.getElementById('projectsScreenContent');
        const newProjectBtn = document.getElementById('newProjectScreenBtn');
        if (!titleEl || !content) return;

                if (activeProjectId && projects[activeProjectId]) {
            const project = projects[activeProjectId];
            if (!project.notes) project.notes = [];
            titleEl.textContent = "💻 " + project.name;
            if (newProjectBtn) newProjectBtn.style.display = 'none';

            let html = `<div style="grid-column:1/-1; margin-bottom:15px;">
                ${project.description ? `<div style="color:var(--cc-text-muted); margin-bottom:12px;">${escapeSidebarHtml(project.description)}</div>` : ""}

                <div style="display:flex; gap:15px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom:10px; margin-bottom:15px; margin-top:5px;">
                    <button onclick="window.switchProjectTab('sohbetler')" style="background:none; border:none; color:${currentProjectTab === 'sohbetler' ? 'var(--cc-accent-brand)' : 'var(--cc-text-muted)'}; font-weight:${currentProjectTab === 'sohbetler' ? 'bold' : 'normal'}; font-size:14px; cursor:pointer; transition: color 0.2s;">💬 Sohbetler</button>
                    <button onclick="window.switchProjectTab('notlar')" style="background:none; border:none; color:${currentProjectTab === 'notlar' ? 'var(--cc-accent-brand)' : 'var(--cc-text-muted)'}; font-weight:${currentProjectTab === 'notlar' ? 'bold' : 'normal'}; font-size:14px; cursor:pointer; transition: color 0.2s;">📝 Notlar</button>
                    <button onclick="window.switchProjectTab('dosyalar')" style="background:none; border:none; color:${currentProjectTab === 'dosyalar' ? 'var(--cc-accent-brand)' : 'var(--cc-text-muted)'}; font-weight:${currentProjectTab === 'dosyalar' ? 'bold' : 'normal'}; font-size:14px; cursor:pointer; transition: color 0.2s;">📎 Dosyalar</button>
                </div>`;

            if (currentProjectTab === 'sohbetler') {
                html += `<button class="run-code-btn" style="background:#a6e3a1; color:var(--cc-bg-main); width:auto; padding:8px 16px; margin-bottom:15px;" onclick="startNewChatInProject('${activeProjectId}')">+ Yeni Sohbet</button></div>`;
                const chatIds = getSortedChatIds(Object.keys(sessions).filter(id => sessions[id]?.projectId === activeProjectId));
                if (chatIds.length === 0) {
                    html += `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--cc-text-muted);">Bu projede henüz sohbet yok.</div>`;
                } else {
                    chatIds.forEach(id => {
                        const chat = sessions[id];
                        html += `<div class="archive-card" style="background:var(--cc-bg-surface); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:14px; cursor:pointer; transition: all 0.2s;" onclick="openChatFromProject('${id}')" onmouseover="this.style.borderColor='var(--cc-border)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                            <div style="color:var(--cc-text-primary); font-weight:600; margin-bottom:6px;">${escapeSidebarHtml(chat.title || "Yeni Sohbet")}</div>
                            <div style="color:#6c7086; font-size:12px;">${formatDateHeader(new Date(chat.updatedAt).toISOString())}</div>
                        </div>`;
                    });
                }
            } else if (currentProjectTab === 'notlar') {
                html += `<div style="margin-bottom:15px;"><button onclick="promptAddNote('${activeProjectId}')" class="action-btn" style="padding:8px 16px; border-radius:var(--cc-radius); border:none; background:var(--cc-accent-brand); color:var(--cc-bg-main); font-weight:bold; cursor:pointer;">+ Yeni Not Ekle</button></div>`;
                if (project.notes.length === 0) {
                    html += `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--cc-text-muted);">Henüz not eklenmemiş.</div>`;
                } else {
                    html += `<div style="grid-column:1/-1; display:flex; flex-direction:column; gap:10px;">`;
                    project.notes.forEach((note, idx) => {
                        html += `<div class="archive-card" style="background:var(--cc-bg-surface); padding:14px; border: 1px solid rgba(255,255,255,0.08); border-radius:var(--cc-radius); position:relative;">
                                    <div style="font-size:14px; color:var(--cc-text-primary); white-space:pre-wrap;">${escapeSidebarHtml(note.content)}</div>
                                    <button onclick="deleteNote('${activeProjectId}', ${idx})" style="position:absolute; top:10px; right:10px; background:none; border:none; color:var(--cc-red); cursor:pointer; font-size:16px;" title="Notu Sil">🗑</button>
                                 </div>`;
                    });
                    html += `</div>`;
                }
            } else if (currentProjectTab === 'dosyalar') {
                html += `<div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:600; color:var(--cc-text-primary);">Dosyalar</div>
                            <button onclick="uploadDocumentToProject('${activeProjectId}')" class="action-btn" style="padding:6px 12px; border-radius:var(--cc-radius); border:none; background:var(--cc-accent-brand); color:var(--cc-bg-main); font-weight:bold; cursor:pointer;">+ Dosya Yükle</button>
                         </div>`;
                html += `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--cc-text-muted); border: 2px dashed rgba(255,255,255,0.1); border-radius: var(--cc-radius);">
                            <div style="font-size:30px; margin-bottom:10px;">📄</div>
                            <div>PDF, TXT, DOCX veya kod dosyası yükleyin</div>
                            <div style="font-size:12px; margin-top:5px; color:#6c7086;">Belge aktif proje sohbetine eklenir ve analiz bağlamında kullanılır.</div>
                         </div>`;
            }
            content.innerHTML = html;
        } else {
            titleEl.textContent = "📁 Projeler";
            if (newProjectBtn) newProjectBtn.style.display = '';
            const projectIds = getSortedProjectIds().filter(id => !projects[id].archived);
            if (projectIds.length === 0) {
                content.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:50px; color:var(--cc-text-muted);">Henüz proje yok. "+ Yeni Proje" ile başla.</div>`;
                return;
            }
            let html = '';
            projectIds.forEach(id => {
                const project = projects[id];
                const chatCount = Object.keys(sessions).filter(cid => sessions[cid]?.projectId === id).length;
                const starIcon = project.starred ? "★" : "☆";
                const safeName = escapeSidebarHtml(project.name);
                html += `<div class="archive-card" style="background:var(--cc-bg-surface); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:14px; position:relative;">
                    <div style="cursor:pointer;" onclick="openProject('${id}')">
                        <div style="color:var(--cc-text-primary); font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:6px;"><span>${starIcon}</span><span>${safeName}</span></div>
                        ${project.description ? `<div style="color:var(--cc-text-muted); font-size:12px; margin-bottom:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeSidebarHtml(project.description)}</div>` : ""}
                        <div style="color:#6c7086; font-size:11px;">${chatCount} sohbet · ${formatDateHeader(new Date(project.updatedAt).toISOString())}</div>
                    </div>
                    <button class="action-btn chat-menu-btn" onclick="toggleProjectMenu('${id}', event)" style="position:absolute; top:10px; right:10px;" title="Proje menüsü">...</button>
                    <div class="chat-action-menu" id="project-menu-${id}">
                        <button class="chat-menu-item" onclick="toggleStarProject('${id}', event)">${project.starred ? "Yıldızı kaldır" : "Yıldızla"}</button>
                        <button class="chat-menu-item" onclick="editProjectDetails('${id}', event)">Düzenle</button>
                        <button class="chat-menu-item" onclick="archiveProject('${id}', event)">${project.archived ? "Arşivden çıkar" : "Arşivle"}</button>
                        <button class="chat-menu-item danger" onclick="deleteProject('${id}', event)">Sil</button>
                    </div>
                </div>`;
            });
            content.innerHTML = html;
        }
    }

    function getSafeExternalHttpUrl(value) {
        try {
            const parsed = new URL(String(value || ''), window.location.href);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
        } catch (error) {
            return '';
        }
    }

    async function searchInternetImages(query) {
        const cleanQuery = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
        if (!cleanQuery) throw new Error('missing_query');
        const response = await fetch('/.netlify/functions/image-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: cleanQuery })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'image_search_failed');
        return Array.isArray(data.images) ? data.images : [];
    }

    function appendInternetImageResults(target, message) {
        const images = message && Array.isArray(message.webImages) ? message.webImages : [];
        if (!target || !images.length || target.querySelector('.web-image-results')) return;

        const section = document.createElement('section');
        section.className = 'web-image-results';
        section.style.cssText = 'margin-top:12px; width:100%;';

        const meta = document.createElement('div');
        meta.style.cssText = 'color:var(--cc-text-muted); font-size:12px; margin-bottom:8px;';
        meta.textContent = `${images.length} açık lisanslı sonuç · Openverse`;
        section.appendChild(meta);

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; width:100%;';
        images.forEach((item) => {
            const thumbnail = getSafeExternalHttpUrl(item.thumbnail || item.imageUrl);
            const landingUrl = getSafeExternalHttpUrl(item.landingUrl);
            if (!thumbnail || !landingUrl) return;

            const card = document.createElement('article');
            card.style.cssText = 'min-width:0; background:var(--cc-bg-surface); border:1px solid var(--cc-border); border-radius:var(--cc-radius); overflow:hidden;';

            const link = document.createElement('a');
            link.href = landingUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = 'Kaynak sayfasını aç';

            const image = document.createElement('img');
            image.src = thumbnail;
            image.alt = String(item.title || 'İnternet görseli').slice(0, 240);
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
            image.style.cssText = 'display:block; width:100%; aspect-ratio:4/3; object-fit:cover; background:var(--cc-bg-main);';
            link.appendChild(image);
            card.appendChild(link);

            const detail = document.createElement('div');
            detail.style.cssText = 'padding:9px;';
            const title = document.createElement('div');
            title.style.cssText = 'font-size:12px; font-weight:700; color:var(--cc-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            title.textContent = String(item.title || 'İsimsiz görsel');
            const credit = document.createElement('div');
            credit.style.cssText = 'font-size:10px; color:var(--cc-text-muted); margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const license = item.license ? ` · ${String(item.license).toUpperCase()}` : '';
            credit.textContent = `${item.creator || 'Bilinmeyen üretici'}${license}`;
            detail.append(title, credit);
            card.appendChild(detail);
            grid.appendChild(card);
        });
        section.appendChild(grid);
        target.appendChild(section);
    }

    function searchSimilarImagesFromPrompt(prompt) {
        // Stil son-ekleri ("high quality, cinematic...") atılır ve kalıcı medya kaynağı
        // tercihi DEĞİŞTİRİLMEZ: bu tek seferlik, kullanıcı kontrollü bir aramadır.
        const coreSubject = getCoreImageSubject(String(prompt || lastMediaPrompt || ''));
        if (!coreSubject) {
            showNonBlockingToast('Aranacak görsel konusu bulunamadı.');
            return;
        }
        setAppMode('image');
        setComposerValue(`İnternetten benzerini bul: ${coreSubject}`);
        sendMessage();
    }

    function hasValidImageUrl(url) {
        const value = String(url || "").trim();
        if (!value) return false;
        if (isPlaceholderErrorImage(value)) return false;
        return /^(https?:|data:image\/|blob:)/i.test(value);
    }

        function isPlaceholderErrorImage(urlOrData) {
        const raw = String(urlOrData || "");
        let decoded = raw;
        try { decoded = decodeURIComponent(raw); } catch(e) {}
        const value = (raw + " " + decoded).toLocaleLowerCase("tr-TR").replace(/\+/g, " ");
        if (!value) return true;

        const dummyDomains = [
            "via.placeholder.com",
            "placeholder.com",
            "placehold.co",
            "dummyimage.com",
            "fakeimg.pl",
            "placekitten.com",
            "placebear.com"
        ];
        const isDummy = dummyDomains.some(domain => value.includes(domain));

        const hasErrorColor = value.includes("f38ba8");
        const hasErrorText = /(baglanti|baglanti|hata|hatasi|hatasi|error|connection error|network error)/i.test(value);
        return isDummy
            || (isDummy && (hasErrorColor || hasErrorText))
            || value.includes("baglanti hatasi")
            || value.includes("baglanti hatasi");
    }

    function isFailedImageResult(result) {
        if (!result) return true;
        if (typeof result === "string") return !hasValidImageUrl(result);
        if (result.success === false || result.error) return true;
        return !hasValidImageUrl(result.url || result.imageUrl || result.data || result.src);
    }

    function getImageProviderStatus(error, cardElement = null) {
        if (cardElement && cardElement.getAttribute('data-runware-error')) {
            const runwareErr = cardElement.getAttribute('data-runware-error');
            if (runwareErr === 'unauthorized' || runwareErr === 'provider_unauthorized') return { ok: false, reason: 'provider_unauthorized' };
            if (runwareErr === 'missing_env') return { ok: false, reason: 'provider_missing_env' };
            if (runwareErr === 'provider_quota' || runwareErr === 'runware_insufficient_credits') return { ok: false, reason: 'provider_quota' };
            if (runwareErr === 'provider_timeout') return { ok: false, reason: 'provider_timeout' };
            if (runwareErr === 'not_found') return { ok: false, reason: 'runware_not_found' };
            if (runwareErr === 'cors_or_blocked') return { ok: false, reason: 'cors_or_browser_block' };
            if (runwareErr === 'network') return { ok: false, reason: 'network_error' };
        }
        const message = String(error && (error.message || error.error || error.status || error) || "").toLocaleLowerCase("tr-TR");
        if (/429|quota|limit|rate/.test(message)) return { ok: false, reason: 'quota_or_limit' };
        if (/cors|blocked|file:/.test(message) || window.location.protocol === "file:") return { ok: false, reason: 'cors_or_browser_block' };
        if (/network|timeout|failed to fetch|load error/.test(message)) return { ok: false, reason: 'network_error' };
        return { ok: false, reason: 'provider_unavailable' };
    }

    function getVideoProviderStatus() {
        return { ok: false, reason: 'missing_video_provider' };
    }

    function renderProviderErrorCard(kind, status) {
        const reason = status && status.reason ? status.reason : 'unknown_error';
        const title = kind === 'video' ? 'Video üretilemedi' : 'Görsel üretilemedi';
        const messages = {
            missing_key: 'Görsel üretilemedi. API anahtarı eksik veya sağlayıcı yapılandırılmamış.',
            missing_video_provider: 'Gerçek video sağlayıcısı bağlı değil. CinoCode şu an storyboard/slideshow önizlemesi hazırlıyor.',
            missing_endpoint: 'Sağlayıcı endpointi yapılandırılmamış.',
            provider_unavailable: 'Sağlayıcı şu anda yanıt vermiyor veya kullanılamıyor.',
            quota_or_limit: 'Sağlayıcı kota veya hız limitine takıldı.',
            network_error: 'Ağ bağlantısı veya zaman aşımı nedeniyle üretim tamamlanamadı.',
            cors_or_browser_block: 'Tarayıcı/CORS engeli nedeniyle sağlayıcıya ulaşılamadı. Mobil tarayıcı/CORS/içerik engeli olabilir.',
            provider_unauthorized: 'Görsel sağlayıcı anahtarı geçersiz veya yetkisiz (403).',
            provider_missing_env: 'Hiçbir görsel sağlayıcısı yapılandırılmamış.',
            provider_quota: 'Görsel sağlayıcının kotası veya kredisi yetersiz.',
            provider_timeout: 'Görsel sağlayıcısı zaman aşımına uğradı.',
            runware_missing_env: 'Netlify RUNWARE_API_KEY eksik. Netlify Environment Variables bölümüne eklenmeli.',
            runware_not_found: 'Görsel endpoint bulunamadı. Netlify function veya provider endpoint kontrol edilmeli (404).',
            fallback_failed: 'Yedek görsel sağlayıcısı da yanıt vermedi.',
            unknown_error: 'Görsel üretiminde bilinmeyen bir hata oluştu.'
        };
        const safeMessage = String(messages[reason] || messages.unknown_error)
            .replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

        // Safe Diagnostics
        const providerName = kind === 'video' ? 'Video provider not configured' : (reason.startsWith('runware_') ? 'Runware Proxy' : 'AI image provider chain');
        const nextSteps = {
            runware_missing_env: 'Netlify Dashboard > Site settings > Environment variables bölümüne RUNWARE_API_KEY ekle.',
            provider_unauthorized: 'İlgili sağlayıcı anahtarını iptal edip yenisini Netlify ve local .env içine girin.',
            provider_missing_env: 'Netlify veya local .env içine en az bir görsel sağlayıcı anahtarı ekleyin.',
            provider_quota: 'Sağlayıcı panelindeki kredi ve kota durumunu kontrol edin.',
            provider_timeout: 'Biraz sonra tekrar deneyin veya başka bir görsel sağlayıcısı yapılandırın.',
            cors_or_browser_block: 'Mobil tarayıcıda içerik engelleyicileri (adblock) kapatıp tekrar deneyin.',
            missing_video_provider: 'Gerçek video için backend video provider ve ilgili API/env yapılandırılmalıdır.',
            default: 'Ağ bağlantınızı veya API durumlarını kontrol edin.'
        };
        const safeNextStep = nextSteps[reason] || nextSteps.default;
        const timeString = new Date().toLocaleTimeString();

        return `<div class="media-error-message" data-provider-error="${reason}" style="text-align:left; margin: 12px 0; background:var(--cc-bg-surface); border:1px solid #f38ba8; border-radius: var(--cc-radius); padding:12px; color:var(--cc-text-primary);">
                    <div style="color:#f38ba8; font-weight:700; margin-bottom:6px;">${title}</div>
                    <div style="font-size:13px; line-height:1.5; margin-bottom: 8px;">${safeMessage}</div>
                    <details style="font-size:11px; color:var(--cc-text-muted); border-top: 1px solid var(--cc-border); padding-top: 6px; cursor: pointer;">
                        <summary style="outline:none; user-select:none; color:#f9e2af; font-weight:600;">Teknik detayları göster</summary>
                        <div style="margin-top: 6px; font-family: monospace; background:var(--cc-bg-main); padding: 6px; border-radius: var(--cc-radius); line-height:1.4; word-break: break-all;">
                            • Provider: ${providerName}<br>
                            • Reason: ${reason}<br>
                            • Time: ${timeString}<br>
                            • Next Step: ${safeNextStep}
                        </div>
                    </details>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
                        <button type="button" onclick="retryLastMediaPrompt('image', lastMediaPrompt)" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">Tekrar Dene</button>
                        <button type="button" onclick="copyPromptTextFallback(lastMediaPrompt || '', this)" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">Promptu Kopyala</button>
                        <button type="button" onclick="searchSimilarImagesFromPrompt(lastMediaPrompt)" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">İnternetten Benzerini Bul</button>
                    </div>
                </div>`;
    }

    function renderMediaErrorMessage(message, status = null) {
        if (status) return renderProviderErrorCard('image', status);
        const safeMessage = String(message || "Görsel üretilemedi. Sağlayıcıya ulaşılamadı veya zaman aşımı oldu.")
            .replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))
            .replace(/\?/g, '');

        return `<div class="media-error-message" style="text-align:left; margin: 12px 0; background:var(--cc-bg-surface); border:1px solid #f38ba8; border-radius: var(--cc-radius); padding:12px; color:var(--cc-text-primary);">
                    <div style="color:#f38ba8; font-weight:700; margin-bottom:6px;">Üretim Başarısız</div>
                    <div style="font-size:13px; line-height:1.5; margin-bottom: 8px;">${safeMessage}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <button class="icon-btn" onclick="navigator.clipboard.writeText(this.parentElement.parentElement.innerText); showNonBlockingToast('Kopyalandı.');" style="font-size:11px; padding:6px 12px; border: 1px solid rgba(255, 255, 255, 0.08); background:var(--cc-border); min-height:32px;">📋 Hatayı Kopyala</button>
                        <button class="icon-btn" onclick="retryLastMediaPrompt('image', lastMediaPrompt)" style="font-size:11px; padding:6px 12px; border: 1px solid rgba(255, 255, 255, 0.08); background:var(--cc-border); min-height:32px;">🔄 Tekrar Dene</button>
                    </div>
                </div>`;
    }

    function handleGeneratedImageError(img) {
        if (!img) return;
        const retryCount = parseInt(img.dataset.retryCount || '0', 10);
        const currentSrc = img.src || '';
        if (retryCount < 2 && currentSrc.includes('image.pollinations.ai')) {
            img.dataset.retryCount = String(retryCount + 1);
            const newSeed = Math.floor(Math.random() * 999999);
            const newSrc = currentSrc.replace(/seed=\d+/, 'seed=' + newSeed);
            setTimeout(() => { img.src = newSrc; }, 1200);
            return;
        }
        const card = img && img.closest ? img.closest('[data-generated-image-card="true"]') : null;
        if (card) {
            let promptText = "";
            try {
                if (card.dataset.runwarePrompt) {
                    promptText = card.dataset.runwarePrompt;
                } else if (card.dataset.imageUrl) {
                    const encoded = card.dataset.imageUrl.split('/prompt/')[1].split('?')[0];
                    promptText = decodeURIComponent(encoded);
                }
            } catch(e){}

            const title = card.dataset.imageTitle || "Görsel";
            let backendError = card.getAttribute('data-runware-error') || 'network_error';
            let errReasonStr = backendError === 'missing_env' ? 'missing_env (API Anahtarları Eksik)' : backendError;
            let providerStr = backendError !== 'network_error' && backendError !== 'unknown' ? 'AI image backend' : 'AI provider fallback';

            card.outerHTML = `
                <div class="media-error-message" style="text-align:left; margin: 12px 0; background:var(--cc-bg-surface); border:1px solid #f38ba8; border-radius: var(--cc-radius); padding:12px; color:var(--cc-text-primary);">
                    <div style="color:#f38ba8; font-weight:700; margin-bottom:6px;">${title} üretilemedi</div>
                    <div style="font-size:13px; line-height:1.5; margin-bottom: 8px;">Sağlayıcı reddetti veya bağlantı koptu. (Asıl Hata: ${errReasonStr})</div>
                    <details style="font-size:11px; color:var(--cc-text-muted); border-top: 1px solid var(--cc-border); padding-top: 6px; margin-bottom:10px; cursor: pointer;">
                        <summary style="outline:none; user-select:none; color:#f9e2af; font-weight:600;">Teknik detayları göster</summary>
                        <div style="margin-top:6px; font-family:monospace; background:var(--cc-bg-main); padding:8px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08); word-wrap:break-word;">
                            Reason: ${backendError}<br>
                            Endpoint: ${providerStr}
                        </div>
                    </details>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <button type="button" onclick="retryLastMediaPrompt('image', decodeURIComponent('${encodeURIComponent(promptText)}'))" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">Tekrar Dene</button>
                        <button type="button" onclick="copyPromptTextFallback(decodeURIComponent('${encodeURIComponent(promptText)}'), this)" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">Promptu Kopyala</button>
                        <button type="button" onclick="searchSimilarImagesFromPrompt(decodeURIComponent('${encodeURIComponent(promptText)}'))" style="background:var(--cc-border); color:var(--cc-text-primary); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:6px 12px; font-size:11px; cursor:pointer;">İnternetten Benzerini Bul</button>
                    </div>
                </div>`;
        }
        scrubPlaceholderErrorImages(messagesDiv || document);
    }

    function handleGeneratedImageLoad(img) {
        const card = img && img.closest ? img.closest('[data-generated-image-card="true"]') : null;
        const imgUrl = card ? card.dataset.imageUrl : (img ? img.src : "");
        if (isPlaceholderErrorImage(imgUrl)) {
            scrubPlaceholderErrorImages(card || (img && img.parentElement) || document);
            return;
        }
        if (!hasValidImageUrl(imgUrl)) return;
        if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
        if(!window.artifactRenderedSet.has(imgUrl)) {
            window.artifactRenderedSet.add(imgUrl);
            addArtifactToList('image', (card && card.dataset.imageTitle) || 'Görsel', imgUrl);
        }
    }

    function getPlaceholderImageCard(img) {
        if (!img || !img.closest) return null;
        return img.closest('[data-generated-image-card="true"]')
            || (img.parentElement && img.parentElement.tagName === 'DIV' ? img.parentElement : null)
            || img.closest('.artifact-card')
            || img.closest('.message');
    }

    function scrubPlaceholderErrorImages(root = document) {
        try {
            const scope = root || document;
            const images = [];
            if (scope.tagName === 'IMG') images.push(scope);
            if (scope.querySelectorAll) images.push(...scope.querySelectorAll('img'));
            images.forEach(img => {
                const src = img.getAttribute('src') || img.src || "";
                if (!isPlaceholderErrorImage(src)) return;
                const card = getPlaceholderImageCard(img);
                if (card) {
                    card.outerHTML = renderMediaErrorMessage("Görsel üretilemedi.", getImageProviderStatus("image load error"));
                } else {
                    img.remove();
                }
            });
        } catch(e) {
            console.warn("Placeholder görsel temizleme hatası:", e);
        }
    }

    function setupPlaceholderImageObserver() {
        if (window.placeholderImageObserver || !messagesDiv || typeof MutationObserver === 'undefined') return;
        window.placeholderImageObserver = new MutationObserver((mutations) => {
            let shouldScrub = false;
            mutations.forEach(mutation => {
                mutation.addedNodes && mutation.addedNodes.forEach(node => {
                    if (!node || node.nodeType !== 1) return;
                    if (node.tagName === 'IMG' || (node.querySelector && node.querySelector('img'))) shouldScrub = true;
                });
            });
            if (shouldScrub) {
                requestAnimationFrame(() => scrubPlaceholderErrorImages(messagesDiv));
            }
        });
        window.placeholderImageObserver.observe(messagesDiv, { childList: true, subtree: true });
    }

    function renderContentWithImages(text, isLast = false) {
        text = String(text || "");
        // Hafıza sistemini yakala (Kullanıcı arayüzünde BİLMEMESİ GEREKİYOR, TERTEMİZ GİZLİ KALMALI)
        text = text.replace(/\[REMEMBER:([\s\S]*?)\]/gi, (match, fact) => {
            let memory = localStorage.getItem('cinocode_memory_' + (loggedUser || "default")) || "";
            if (!memory.includes(fact.trim())) {
                memory += "\n- " + fact.trim();
                localStorage.setItem('cinocode_memory_' + (loggedUser || "default"), memory);
                console.log("Memory saved: ", fact);
            }
            return "";
        });

        // Sızıntıları UI'dan temizle
        let safeText = sanitizeAssistantOutput(text);

        let html = renderMarkdownSafely(safeText);
        html = html.replace(/\[GENERATE_IMAGE:\s*(.*?)\]/gi, (match, promptText) => {
            if (isTechnicalText(promptText)) return '';
            let finalPrompt = buildCleanMediaPrompt(promptText, "image");
            lastMediaPrompt = finalPrompt;
            lastMediaType = "image";

            const imageTitle = finalPrompt.substring(0, 15).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])) + '...';
            const safePrompt = finalPrompt.replace(/"/g, '&quot;');

            // Her koşulda Runware (local key yoksa Netlify proxy üzerinden) tetiklenir
            if (true) {
                // Runware async: önce spinner göster, sonra triggerRunwareImages() dolduracak
                const cardId = 'rw-card-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
                setTimeout(() => triggerRunwareImages(), 50);
                return `<div id="${cardId}" data-generated-image-card="true" data-runware-prompt="${safePrompt}" data-image-title="${imageTitle}" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 10px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                            <div class="runware-spinner" style="color:var(--cc-text-muted); font-size:13px; padding:40px 0;">Görsel üretiliyor (Runware)...</div>
                            <img data-runware-img="1" src="" style="max-width:100%; border-radius: var(--cc-radius); display:none; margin: 0 auto 10px auto;" onload="this.style.display='block'; handleGeneratedImageLoad(this)" onerror="handleGeneratedImageError(this)">
                            <button class="run-code-btn" style="background:var(--cc-accent-brand); color:var(--cc-bg-main); width:auto; padding:8px 15px; display:none;" onclick="downloadImage(this.previousElementSibling.src, 'CinoCode_Gorsel.jpg')">💾 Resmi İndir</button>
                        </div>`;
            }

            // Runware yoksa Pollinations (direkt HTTPS)
            const encodedPrompt = encodeURIComponent(String(finalPrompt).substring(0, 400));
            const randomSeed = Math.floor(Math.random() * 1000000);
            const imgUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;

            if (isFailedImageResult(imgUrl)) {
                return renderMediaErrorMessage();
            }
            return `<div data-generated-image-card="true" data-image-url="${imgUrl}" data-image-title="${imageTitle}" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 10px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                        <img src="${imgUrl}" style="max-width:100%; border-radius: var(--cc-radius); display:block; margin: 0 auto 10px auto; min-height: 200px; background: var(--cc-bg-elevated) center/cover no-repeat;" onload="handleGeneratedImageLoad(this)" onerror="handleGeneratedImageError(this)">
                        <button class="run-code-btn" style="background:var(--cc-accent-brand); color:var(--cc-bg-main); width:auto; padding:8px 15px;" onclick="downloadImage('${imgUrl}', 'CinoCode_Gorsel.jpg')">💾 Resmi İndir</button>
                    </div>`;
        });
        // VIDEO regex
        html = html.replace(/\[GENERATE_VIDEO:\s*(.*?)\]/gi, (match, promptText) => {
            if (!isLast) {
                if (isTechnicalText(promptText)) return '';
                const staleContainerId = 'stale-video-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
                const safePromptAttr = String(promptText).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
                return `<div id="${staleContainerId}" style="padding: 15px; border: 1px dashed #cba6f7; border-radius: var(--cc-radius); margin-top: 10px; color: var(--cc-text-primary); background: rgba(203,166,247,0.05); text-align:center;">
                    <div style="margin-bottom:10px;"><i class="fas fa-video"></i> 🎥 Bu videonun kaydı sayfa yenilendiği için tarayıcı belleğinden silindi.</div>
                    <button class="run-code-btn" style="background:#cba6f7; color:var(--cc-bg-main); width:auto; padding:8px 16px; font-weight:bold;" onclick="regenerateVideo('${safePromptAttr}', '${staleContainerId}')">🔄 Videoyu Yeniden Oluştur</button>
                </div>`;
            }
            if (isTechnicalText(promptText)) return '';
            let finalPrompt = buildCleanMediaPrompt(promptText, "video");
            lastMediaPrompt = finalPrompt;
            lastMediaType = "video";
            const safePromptValue = finalPrompt.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const publicPrompt = getPublicVideoSubject(promptText);

            window.videoCache = window.videoCache || {};
            window.videoStoryboardCache = window.videoStoryboardCache || {};
            if (window.videoStoryboardCache[finalPrompt]) {
                return window.videoStoryboardCache[finalPrompt];
            }
            if (window.videoCache[finalPrompt]) {
                const cachedUrl = window.videoCache[finalPrompt];
                return `<div style="text-align:center; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                            <div style="color: #f9e2af; font-size: 13px; margin-bottom: 10px;">Storyboard/slideshow taslağı (önbellekten)</div>
                            <video controls autoplay style="max-width:100%; border-radius: var(--cc-radius); border: 2px solid var(--cc-accent-brand); box-shadow: 0 4px 12px rgba(0,0,0,0.5);" src="${cachedUrl}"></video>
                            <div class="artifact-card-actions">
                                <button class="artifact-dl-btn" onclick="downloadVideo('${cachedUrl}', 'CinoCode_Video.webm')">İndir</button>
                                <button class="artifact-dl-btn" style="background:var(--cc-accent-brand); color:var(--cc-bg-main);" onclick="replayVideo('${safePromptValue}', '${cachedUrl}')">Yeniden Oynat</button>
                            </div>
                        </div>`;
            }

            const persistedDataUrl = getPersistedVideoData(finalPrompt);
            if (persistedDataUrl) {
                window.videoCache[finalPrompt] = persistedDataUrl;
                return `<div style="text-align:center; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                            <div style="color: #f9e2af; font-size: 13px; margin-bottom: 10px;">Storyboard/slideshow taslağı (kaydedilmiş)</div>
                            <video controls style="max-width:100%; border-radius: var(--cc-radius); border: 2px solid var(--cc-accent-brand); box-shadow: 0 4px 12px rgba(0,0,0,0.5);" src="${persistedDataUrl}"></video>
                            <div class="artifact-card-actions">
                                <button class="artifact-dl-btn" onclick="downloadVideo('${persistedDataUrl}', 'CinoCode_Video.webm')">İndir</button>
                                <button class="artifact-dl-btn" style="background:#cba6f7; color:var(--cc-bg-main);" onclick="triggerVideoRenderOnDemand('${finalPrompt.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', 'video-replay-' + Date.now())">Yeniden Oluştur</button>
                            </div>
                        </div>`;
            }

            window.queuedVideoPrompts = window.queuedVideoPrompts || new Set();
            const videoId = 'video-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
            const escapedPrompt = promptText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const pendingText = window.queuedVideoPrompts.has(finalPrompt)
                ? 'Bu video isteği kuyrukta veya işlemde olabilir. Sayfa yenilendiyse otomatik tekrar başlatılmaz.'
                : 'Bu geçici video önizlemesi sayfa yenilenince kaybolmuş olabilir. Yeniden oluşturmak için butona bas.';
            return `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="color: var(--cc-text-muted); font-size: 14px; margin-bottom: 8px;">Bu gerçek video değil, storyboard/slideshow taslağıdır.</div>
                        <div style="color:#f9e2af; font-size:12px; margin-bottom:10px;">${pendingText}</div>
                        <div class="artifact-card-actions" style="justify-content:center;">
                            <button class="run-code-btn" style="background: linear-gradient(135deg, var(--cc-accent-brand), #cba6f7); color:var(--cc-bg-main); width:auto; padding:10px 20px; font-weight:bold; border-radius: var(--cc-radius);" onclick="triggerVideoRenderOnDemand('${escapedPrompt}', '${videoId}')">Yeniden Oluştur</button>
                        </div>
                    </div>`;
        });
        return html;
    }

    async function downloadImage(url, filename) {
        try {
            if (isPlaceholderErrorImage(url)) {
                showNonBlockingToast("Bu görsel üretilemediği için indirilemez.");
                return;
            }
            if (!hasValidImageUrl(url)) {
                showNonBlockingToast("Görsel indirilemedi. Geçerli bir görsel URL'si yok.");
                return;
            }
            const response = await fetch(url);
            if (!response.ok) throw new Error("image download failed");
            const blob = await response.blob();
            if (!blob || !String(blob.type || "").startsWith("image/")) throw new Error("downloaded content is not an image");
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
            console.error("İndirme hatası:", e);
            window.open(url, '_blank'); // Fallback olarak yeni sekmede aç
        }
    }

    // ========== AI VIDEO SLIDESHOW MOTORU ==========
    let isVideoGenerating = false;
    let videoQueue = []; // Video taleplerini sırayla işlemek için kuyruk yapısı
    const maxQueueLength = 3;
    let activeRecorder = null; // Aktif MediaRecorder referansı
    let isGenerationCancelled = false; // İptal kontrol flag'i

    window.videoCache = window.videoCache || {};
    window.queuedVideoPrompts = window.queuedVideoPrompts || new Set();
    window.currentVideoPrompt = null;

    function triggerVideoRenderOnDemand(promptText, containerId) {
        let finalPrompt = buildCleanMediaPrompt(promptText, "video");
        window.queuedVideoPrompts = window.queuedVideoPrompts || new Set();
        window.queuedVideoPrompts.add(finalPrompt);

        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div style="color: var(--cc-text-primary); font-size: 16px; margin-bottom: 10px;">📖 Gerçek video modeli bağlı değil; storyboard/slideshow önizlemesi hazırlanıyor...</div>
                <div style="background: var(--cc-border); border-radius: var(--cc-radius); height: 20px; overflow: hidden; margin-bottom: 8px;">
                    <div id="${containerId}-progress" style="background: linear-gradient(90deg, var(--cc-accent-brand), #cba6f7); height: 100%; width: 0%; border-radius: var(--cc-radius); transition: width 0.5s ease;"></div>
                </div>
                <div id="${containerId}-status" style="color: var(--cc-text-muted); font-size: 13px;">Bu gerçek video değil, storyboard/slideshow taslağıdır. Gerçek video için sağlayıcı/API anahtarı gerekir.</div>
                <button class="run-code-btn" style="background: #f38ba8; color: var(--cc-bg-main); font-size: 11px; padding: 4px 8px; margin-top: 8px; font-weight: bold;" onclick="cancelVideoGeneration('${containerId}')">❌ İptal Et</button>
            `;
        }

        queueVideoSlideshow(finalPrompt, containerId);
    }

    function startOrQueueVideo(prompt) {
        const videoId = 'video-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

        // Dynamic generation target container on message log
        const list = document.getElementById("messages");
        if (list) {
            const card = document.createElement("div");
            card.className = "message bot";
            card.innerHTML = `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                                <div style="color: var(--cc-text-primary); font-size: 16px; margin-bottom: 10px;">📖 Gerçek video modeli bağlı değil; storyboard/slideshow önizlemesi hazırlanıyor...</div>
                                <div style="background: var(--cc-border); border-radius: var(--cc-radius); height: 20px; overflow: hidden; margin-bottom: 8px;">
                                    <div id="${videoId}-progress" style="background: linear-gradient(90deg, var(--cc-accent-brand), #cba6f7); height: 100%; width: 0%; border-radius: var(--cc-radius); transition: width 0.5s ease;"></div>
                                </div>
                                <div id="${videoId}-status" style="color: var(--cc-text-muted); font-size: 13px;">Bu gerçek video değil, storyboard/slideshow taslağıdır. Gerçek video için sağlayıcı/API anahtarı gerekir.</div>
                            </div>`;
            list.appendChild(card);
            scrollToBottom();
        }

        queueVideoSlideshow(prompt, videoId);
    }

    function cancelCurrentVideo() {
        if (isVideoGenerating) {
            isGenerationCancelled = true;
            if (window.queuedVideoPrompts && window.currentVideoPrompt) {
                window.queuedVideoPrompts.delete(window.currentVideoPrompt);
            }
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                try { activeRecorder.stop(); } catch(e){}
            }
            isVideoGenerating = false;
        }
    }

    function queueVideoSlideshow(prompt, containerId, options = {}) {
        if (videoQueue.length >= maxQueueLength) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div style="color: #f38ba8; padding: 10px;">❌ Kuyruk dolu! (Maksimum 3 video bekleyebilir). Lütfen daha sonra deneyin.</div>';
            }
            return;
        }


        const rawPrompt = options.rawPrompt || prompt;
        const corePrompt = getCoreVideoPrompt(rawPrompt);
        if (!corePrompt || corePrompt.length < 8) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div style="color: #f38ba8; padding: 20px;">Video promptu boş veya bozuk görünüyor. Lütfen üretilecek sahneyi daha net yazarak tekrar deneyin.</div>';
            }
            return;
        }
        videoQueue.push({ prompt, containerId, requestMeta: { rawPrompt, corePrompt, requestedDuration: parseRequestedVideoDuration(rawPrompt) } });
        processVideoQueue();
    }

    function cancelVideoGeneration(containerId) {
        // 1. Eğer kuyruktaki bir video ise kuyruktan sil
        const queueIdx = videoQueue.findIndex(item => item.containerId === containerId);
        let wasActive = false;

        if (queueIdx !== -1) {
            const item = videoQueue[queueIdx];
            if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(item.prompt);
            videoQueue.splice(queueIdx, 1);
            console.log("Kuyruktaki video iptal edildi.");
        } else if (isVideoGenerating) {
            // 2. Eğer şu an üretilen video ise motoru durdur
            isGenerationCancelled = true;
            wasActive = true;
            if (window.queuedVideoPrompts && window.currentVideoPrompt) {
                window.queuedVideoPrompts.delete(window.currentVideoPrompt);
            }
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                try { activeRecorder.stop(); } catch(e){}
            }
            console.log("Aktif video üretimi iptal edildi.");
        }

        // Arayüzü temizle
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<div style="color: #f38ba8; padding: 10px;">⚠️ Video üretimi iptal edildi.</div>';
        }

        // Not: isGenerationCancelled false yapma işlemi executeVideoGeneration içindeki finally bloğunda yapılıyor.
        // Aynı şekilde processVideoQueue de o fonksiyon bitince otomatik çağrılıyor.
        // Sadece bekleyen hiçbir şey yoksa (kuyruktan silindiyse vs.) tetikleyebiliriz.
        if (!isVideoGenerating && !wasActive) {
            processVideoQueue();
        }
    }

    async function processVideoQueue() {
        if (isVideoGenerating || videoQueue.length === 0) {
            // Eğer aktif bir video varsa veya kuyruk boşsa bekle
            if (videoQueue.length > 1) {
                const nextItem = videoQueue[videoQueue.length - 1];
                const statusTxt = document.getElementById(nextItem.containerId + '-status');
                if (statusTxt) {
                    statusTxt.textContent = `⏳ Kuyrukta bekleniyor... Sıra: ${videoQueue.length - 1}`;
                }
            }
            return;
        }

        const task = videoQueue.shift();
        await executeVideoGeneration(task.prompt, task.containerId, task.requestMeta || {});
        processVideoQueue(); // Bir sonraki göreve geç
    }

    async function executeVideoGeneration(prompt, containerId, requestMeta = {}) {
        const container = document.getElementById(containerId);
        const progressBar = document.getElementById(containerId + '-progress');
        const statusText = document.getElementById(containerId + '-status');
        if (!container) return;

        // MediaRecorder desteği kontrolü
        if (typeof MediaRecorder === 'undefined') {
            container.innerHTML = '<div style="color: #f38ba8; padding: 20px;">❌ Tarayıcınız video kaydını desteklemiyor. Lütfen Chrome veya Edge kullanın.</div>';
            return;
        }

        isVideoGenerating = true;
        window.currentVideoPrompt = prompt;

        try {
            const savedMode = localStorage.getItem('video_mode') || 'fast_clip';
            let SCENE_COUNT = 3;
            let SCENE_DURATION = 3500;
            let FPS = 15;
            let WIDTH = 384;
            let HEIGHT = 384;
            let modeLabel = "Hızlı Klip";
            let isLongVideo = false;
            const savedVideoQuality = localStorage.getItem('video_quality') || 'standard';

            if (savedMode === 'fast_clip') {
                SCENE_COUNT = 3;
                SCENE_DURATION = 2000;
                FPS = 15;
                WIDTH = 384;
                HEIGHT = 384;
                modeLabel = "Hızlı Klip";
            } else if (savedMode === 'standard_video') {
                SCENE_COUNT = 4;
                SCENE_DURATION = 3000;
                FPS = 18;
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Standart Video";
            } else if (savedMode === 'cinematic') {
                SCENE_COUNT = 5;
                SCENE_DURATION = 4000;
                FPS = 24;
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Sinematik";
            } else if (savedMode === 'scene_long') {
                SCENE_COUNT = 6;
                SCENE_DURATION = 8000;
                FPS = 20;
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Sahne Sahne Uzun";
                isLongVideo = true;
            } else if (savedMode === 'experimental_long') {
                SCENE_COUNT = 8;
                SCENE_DURATION = 10000;
                FPS = 20;
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Deneysel Uzun";
                isLongVideo = true;
            }

            if (savedVideoQuality === 'high') {
                WIDTH = Math.max(WIDTH, 640);
                HEIGHT = Math.max(HEIGHT, 640);
            } else if (savedVideoQuality === 'cinematic') {
                WIDTH = Math.max(WIDTH, 768);
                HEIGHT = Math.max(HEIGHT, 768);
                FPS = Math.max(FPS, 24);
                if (savedMode === 'fast_clip') {
                    SCENE_COUNT = 4;
                    SCENE_DURATION = 2500;
                } else if (savedMode === 'standard_video') {
                    SCENE_COUNT = 5;
                    SCENE_DURATION = 3500;
                }
            }

            let videoDurationSec = Math.round((SCENE_COUNT * SCENE_DURATION) / 1000);
            const requestedDuration = requestMeta.requestedDuration || parseRequestedVideoDuration(requestMeta.rawPrompt || prompt);
            const REQUESTED_DURATION_CAP_SEC = 60;
            let requestedDurationNotice = "";
            if (requestedDuration) {
                const targetSeconds = Math.min(requestedDuration.seconds, REQUESTED_DURATION_CAP_SEC);
                if (targetSeconds >= 3) {
                    // İstenen süreye mümkün olduğunca yaklaş: sahne sayısını koru, sahne süresini yeniden hesapla.
                    SCENE_DURATION = Math.max(1000, Math.min(15000, Math.round((targetSeconds * 1000) / SCENE_COUNT)));
                    videoDurationSec = Math.round((SCENE_COUNT * SCENE_DURATION) / 1000);
                }
                if (requestedDuration.seconds > REQUESTED_DURATION_CAP_SEC) {
                    requestedDurationNotice = `İstenen süre: ${requestedDuration.label}. Tarayıcı içi video modu en fazla ~${REQUESTED_DURATION_CAP_SEC} saniyelik storyboard/slideshow taslağı üretebilir, bu yüzden ~${videoDurationSec} saniye üretilecek. Daha uzun gerçek video için video sağlayıcı/endpoint gerekir.`;
                }
            }
            const corePrompt = requestMeta.corePrompt || getCoreVideoPrompt(prompt);
            if (!corePrompt || corePrompt.length < 8) {
                throw new Error("Video promptu boş veya bozuk görünüyor.");
            }
            const visualPrompt = buildCleanMediaPrompt(corePrompt, "video");

            // Uzun video modu için kullanıcı bilgilendirme
            if (isLongVideo) {
                if (statusText) statusText.textContent = `📖 [${modeLabel} Mod] Uzun video sahne sahne oluşturulacak (${SCENE_COUNT} sahne, ~${videoDurationSec} sn)`;
            }
            if (requestedDurationNotice && statusText) {
                statusText.textContent = requestedDurationNotice;
            }

            // Prompt geliştirme (video için)
            const enhancedPrompt = enhanceVideoPrompt(visualPrompt, savedVideoQuality, isLongVideo);

            // 1. ADIM: AI görsellerini üret
            const images = [];
            const variations = [
                'wide angle establishing shot', 'dramatic close up detail',
                'aerial view from above', 'sunset golden hour lighting',
                'misty dawn atmosphere', 'night scene neon lights',
                'cinematic side perspective', 'epic panoramic landscape',
                'gorgeous macro shot', 'action tracking view',
                'high contrast moody lighting', 'vibrant colorful landscape'
            ];

            // Bütün sahneleri aynı anda indir (Paralel işlem hızı!)
            const batchSize = SCENE_COUNT;
            for (let batch = 0; batch < SCENE_COUNT; batch += batchSize) {
                const batchPromises = [];
                const batchEnd = Math.min(batch + batchSize, SCENE_COUNT);

                // Tahmini kalan süreyi hesapla
                const remainingImages = SCENE_COUNT - batch;
                const estSeconds = Math.ceil(remainingImages * 3.5); // resim başına ~3.5 sn

                if (statusText) statusText.textContent = `? [${modeLabel} Mod] Sahneler indiriliyor... (${Math.min(batch + batchSize, SCENE_COUNT)}/${SCENE_COUNT}) - Kalan süre: ~${estSeconds + videoDurationSec} sn (Video Süresi: ${videoDurationSec} sn)`;
                if (progressBar) progressBar.style.width = ((batch / SCENE_COUNT) * 50) + '%';

                for (let i = batch; i < batchEnd; i++) {
                    const scenePrompt = `${enhancedPrompt}, ${variations[i]}, cinematic 4k, masterpiece`;
                    // Use robust loader with fallbacks
                    batchPromises.push(loadSceneImage(scenePrompt, i).catch(e => {
                        console.error(`[VIDEO][SCENE ${i+1}] ALL FALLBACKS FAILED:`, e.message);
                        return null;
                    }));
                }

                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(img => { if (img) images.push(img); });

                if (isGenerationCancelled) return;
            }

            if (images.length === 0) {
                console.error(`[VIDEO FATAL] Video render failed. Expected scenes, got ${images.length}. Check network tab for pollination errors.`);
                let errorMsg = '❌ Video oluşturulamadı. ';
                errorMsg += 'Yeterli görsel üretilemedi. İnternet bağlantınızı kontrol edin veya daha kısa bir mod seçin.';
                if (window.location.protocol === "file:") {
                    errorMsg += ' CinoCode video motoru doğrudan dosya (file://) protokolüyle açıldığında CORS engeline takılabilir. Lütfen Netlify linkinden veya netlify dev üzerinden test edin.';
                }
                if (isLongVideo) {
                    errorMsg += ' Bu mod uzun video için sahne sahne çalışır.';
                }
                container.innerHTML = `<div style="color: #f38ba8; padding: 20px;">${errorMsg}</div>`;
                if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(prompt);
                return;
            }

            if (images.length < 2) {
                console.warn(`[VIDEO FALLBACK] Expected ${SCENE_COUNT} scenes, got ${images.length}. Showing storyboard fallback instead of fake success.`);
                const safePrompt = String(getPublicVideoSubject(requestMeta.rawPrompt || prompt || '')).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
                const fileWarning = window.location.protocol === "file:"
                    ? `<div style="color:#f9e2af; font-size:12px; margin-top:10px;">CinoCode video motoru doğrudan dosya (file://) protokolüyle açıldığında CORS engeline takılabilir. Lütfen Netlify linkinden veya netlify dev üzerinden test edin.</div>`
                    : "";
                const durationFallbackNotice = requestedDurationNotice
                    ? `<div style="color:#f9e2af; font-size:13px; margin-bottom:10px;">${requestedDurationNotice}</div>`
                    : "";
                if (progressBar) progressBar.style.width = '100%';
                if (statusText) statusText.textContent = 'Storyboard fallback gösteriliyor.';
                const storyboardHtml = `
                    <div style="text-align:left; background:var(--cc-bg-surface); padding:15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="color:#f9e2af; font-size:13px; margin-bottom:10px;">Bu gerçek video değil, video üretimi için yeterli sahne üretilemediği için oluşturulan storyboard taslağıdır.</div>
                        ${durationFallbackNotice}
                        <div style="color:#f38ba8; font-size:14px; margin-bottom:12px;">Video için yeterli sahne üretilemedi. Bunun yerine 3 sahnelik storyboard taslağı hazırladım.</div>
                        <div style="display:grid; gap:10px;">
                            <div style="background:var(--cc-bg-elevated); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:10px;"><b>Sahne 1: Giriş</b><br><span style="color:var(--cc-text-muted);">${safePrompt} konusunu kuran geniş açılı açılış karesi.</span></div>
                            <div style="background:var(--cc-bg-elevated); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:10px;"><b>Sahne 2: Gelişme</b><br><span style="color:var(--cc-text-muted);">Ana aksiyonun ve atmosferin belirginleştiği sinematik orta plan.</span></div>
                            <div style="background:var(--cc-bg-elevated); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: var(--cc-radius); padding:10px;"><b>Sahne 3: Aksiyon/Final</b><br><span style="color:var(--cc-text-muted);">Kapanış etkisi veren, hareket ve gerilimi yükselten final karesi.</span></div>
                        </div>
                        ${fileWarning}
                    </div>
                `;
                window.videoStoryboardCache = window.videoStoryboardCache || {};
                window.videoStoryboardCache[prompt] = storyboardHtml;
                container.innerHTML = storyboardHtml;
                if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(prompt);
                return;
            }

            // 2. ADIM: Canvas oluştur ve animasyonu kaydet
            const canvas = document.createElement('canvas');
            canvas.width = WIDTH;
            canvas.height = HEIGHT;
            const ctx = canvas.getContext('2d');

            // MediaRecorder başlat
            const stream = canvas.captureStream(FPS);

            // --- PROCEDURAL AUDIO (Background Music) ---
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioDest = audioCtx.createMediaStreamDestination();
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();
            osc1.type = 'sine'; osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(110.00, audioCtx.currentTime); // A2
            osc2.frequency.setValueAtTime(164.81, audioCtx.currentTime); // E3
            filter.type = 'lowpass'; filter.frequency.value = 500;
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 1); // Fade In
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime + videoDurationSec - 1);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + videoDurationSec); // Fade Out
            osc1.connect(filter); osc2.connect(filter); filter.connect(gainNode); gainNode.connect(audioDest);
            osc1.start(); osc2.start();
            osc1.stop(audioCtx.currentTime + videoDurationSec); osc2.stop(audioCtx.currentTime + videoDurationSec);
            const combinedTracks = [...stream.getVideoTracks()];
            if (audioDest.stream.getAudioTracks().length > 0) combinedTracks.push(...audioDest.stream.getAudioTracks());
            const combinedStream = new MediaStream(combinedTracks);
            // -------------------------------------

            const chunks = [];
            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
            }
            const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 2000000 });
            activeRecorder = recorder; // İptal kontrolü için kaydet
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

            const videoReady = new Promise((resolve) => {
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    resolve(blob);
                };
            });

            recorder.start();

            // 3. ADIM: Ken Burns animasyonu çalıştır
            const totalFrames = images.length * (SCENE_DURATION / 1000) * FPS;
            const framesPerScene = (SCENE_DURATION / 1000) * FPS;
            const transitionFrames = Math.floor(FPS * 1); // 1 saniyelik geçiş
            let frame = 0;

            await new Promise((resolve) => {
                function renderFrame() {
                    // Eğer video iptal edildiyse işlemi anında sonlandır
                    if (isGenerationCancelled) {
                        resolve();
                        return;
                    }

                    if (frame >= totalFrames) {
                        resolve();
                        return;
                    }

                    const sceneIndex = Math.min(Math.floor(frame / framesPerScene), images.length - 1);
                    const nextSceneIndex = Math.min(sceneIndex + 1, images.length - 1);
                    const frameInScene = frame % framesPerScene;
                    const progress = frameInScene / framesPerScene;

                    // Ken Burns efekti: yavaş zoom + pan
                    const zoomStart = 1.0;
                    const zoomEnd = 1.15;
                    const zoom = zoomStart + (zoomEnd - zoomStart) * progress;
                    const panX = Math.sin(progress * Math.PI) * 30 * (sceneIndex % 2 === 0 ? 1 : -1);
                    const panY = Math.cos(progress * Math.PI) * 20 * (sceneIndex % 3 === 0 ? 1 : -1);

                    // Ana sahneyi çiz
                    ctx.save();
                    ctx.translate(WIDTH / 2 + panX, HEIGHT / 2 + panY);
                    ctx.scale(zoom, zoom);
                    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
                    ctx.drawImage(images[sceneIndex], 0, 0, WIDTH, HEIGHT);
                    ctx.restore();

                    // Crossfade geçişi (son 1 saniye)
                    if (frameInScene >= framesPerScene - transitionFrames && nextSceneIndex !== sceneIndex) {
                        const alpha = (frameInScene - (framesPerScene - transitionFrames)) / transitionFrames;
                        ctx.globalAlpha = alpha;
                        ctx.drawImage(images[nextSceneIndex], 0, 0, WIDTH, HEIGHT);
                        ctx.globalAlpha = 1.0;
                    }

                    // İlerleme güncelle
                    const totalProgress = 60 + (frame / totalFrames) * 35;
                    if (progressBar) progressBar.style.width = totalProgress + '%';

                    // Kalan saniye hesabı (20 FPS hızıyla render ediliyor)
                    const remainingFrames = totalFrames - frame;
                    const remainingSecs = Math.ceil(remainingFrames / FPS);
                    if (statusText) statusText.textContent = `📖 Video kaydediliyor... (${Math.floor(totalProgress)}%) - Kalan süre: ~${remainingSecs} saniye`;

                    frame++;
                    // requestAnimationFrame yerine setTimeout ile FPS kontrolü
                    setTimeout(renderFrame, 1000 / FPS);
                }
                renderFrame();
            });

            // 4. ADIM: Kaydı durdur ve videoyu göster
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                try { activeRecorder.stop(); } catch(e){}
            }
            const videoBlob = await videoReady;

            // Eğer son aşamada iptal edildiyse HTML'i güncelleme
            if (isGenerationCancelled) {
                return;
            }
            if (!videoBlob || videoBlob.size === 0) {
                throw new Error("MediaRecorder video blob üretmedi.");
            }

            const videoUrl = URL.createObjectURL(videoBlob);
            if (!videoUrl || !videoUrl.startsWith("blob:")) {
                throw new Error("Geçerli video artifact URL oluşturulamadı.");
            }

            // Cache the video URL in session dict
            window.videoCache = window.videoCache || {};
            window.videoCache[prompt] = videoUrl;
            if (window.queuedVideoPrompts) {
                window.queuedVideoPrompts.delete(prompt);
            }

            // Sayfa yenilenince/yeni mesajda kaybolmaması için küçük videoları kalıcı önbelleğe yaz.
            if (videoBlob.size <= PERSISTED_VIDEO_MAX_BYTES) {
                blobToDataUrl(videoBlob).then(dataUrl => {
                    setPersistedVideoData(prompt, dataUrl);
                }).catch(e => console.warn('[VIDEO] blobToDataUrl failed:', e.message));
            } else {
                console.warn('[VIDEO] Video too large to persist (' + videoBlob.size + ' bytes); will be lost on reload.');
            }

            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'Storyboard/slideshow taslağı oluşturuldu.';
            const durationNoticeHtml = requestedDurationNotice
                ? `<div style="color:#f9e2af; font-size:13px; margin-bottom:10px;">${requestedDurationNotice}</div>`
                : "";

            // Video oynatıcıyı ekrana bas
            container.innerHTML = `
                <div style="text-align:center; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="color: #f9e2af; font-size: 13px; margin-bottom: 10px;">Bu gerçek video sağlayıcı çıktısı değil, video üretimi için oluşturulan görsel storyboard/slideshow taslağıdır.</div>
                    ${durationNoticeHtml}
                    <div style="color: #a6e3a1; font-size: 14px; margin-bottom: 10px;">Storyboard/slideshow taslağı oluşturuldu. Mevcut çıktı: yaklaşık ${videoDurationSec} saniyelik taslak, ${images.length} sahne.</div>
                    <div style="color:var(--cc-text-muted); font-size:13px; margin-bottom:10px;">Konu: ${getPublicVideoSubject(requestMeta.rawPrompt || prompt)}</div>
                    <video controls autoplay style="max-width:100%; border-radius: var(--cc-radius); border: 2px solid var(--cc-accent-brand); box-shadow: 0 4px 12px rgba(0,0,0,0.5);" src="${videoUrl}"></video>
                    <div class="artifact-card-actions" style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px;">
                        <button class="artifact-dl-btn" data-video-action="download" data-video-url="${videoUrl}">⬇️ İndir</button>
                        <button class="artifact-dl-btn" style="background:#cba6f7; color:var(--cc-bg-main);" data-video-action="regenerate" data-video-prompt="${encodeURIComponent(String(prompt).substring(0, 400))}" data-video-container="${containerId}">🔄 Yeniden Oluştur</button>
                        <button class="artifact-dl-btn" style="background:var(--cc-accent-brand); color:var(--cc-bg-main);" data-video-action="edit" data-video-prompt="${encodeURIComponent(String(prompt).substring(0, 400))}">✏️ Düzenle</button>
                        <button class="artifact-dl-btn" style="background:#f38ba8; color:var(--cc-bg-main);" data-video-action="delete" data-video-container="${containerId}">🗑️ Sil</button>
                    </div>
                </div>
            `;

            // Artifacts paneline ekle
            if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
            if(!window.artifactRenderedSet.has(videoUrl)) {
                window.artifactRenderedSet.add(videoUrl);
                setTimeout(() => addArtifactToList('video', '📖 ' + prompt.substring(0, 12) + '...', videoUrl, prompt), 100);
            }
        } catch (err) {
            console.error("Video render hatası:", err);
            if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(prompt);
            if (container) {
                let errorMsg = '❌ Video oluşturulurken bir sorun oluştu. ';
                if (err.message.includes('timeout') || err.message.includes('network')) {
                    errorMsg += 'İnternet bağlantısı zaman aşımına uğradı veya API yanıt vermedi.';
                } else if (err.message.includes('MediaRecorder')) {
                    errorMsg += 'Tarayıcınız video kaydını desteklemiyor. Chrome veya Edge kullanın.';
                } else {
                    errorMsg += 'Gerçek video oluşturulamadı. Video endpointi çalışmıyor veya video sağlayıcı yapılandırılmamış. Tekrar deneyin veya daha kısa bir mod seçin.';
                }
                if (window.location.protocol === "file:") {
                    errorMsg += ' CinoCode video motoru doğrudan dosya (file://) protokolüyle açıldığında CORS engeline takılabilir. Lütfen Netlify linkinden veya netlify dev üzerinden test edin.';
                }
                container.innerHTML = `<div style="color: #f38ba8; padding: 20px;">${errorMsg}</div>`;
            }
        } finally {
            isVideoGenerating = false; // Yeni video üretimini serbest bırak
            activeRecorder = null;
            // İptal bayrağını temizle
            isGenerationCancelled = false;
            window.currentVideoPrompt = null;
        }
    }

    function loadImageWithTimeout(url, timeoutMs = 20000) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let finished = false;

            const timer = setTimeout(() => {
                if (finished) return;
                finished = true;
                reject(new Error("timeout"));
            }, timeoutMs);

            img.onload = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                resolve(img);
            };

            img.onerror = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                reject(new Error("image load error"));
            };

            img.crossOrigin = "anonymous";
            img.referrerPolicy = "no-referrer";
            img.src = url;
        });
    }

    function downloadVideo(url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CinoCode_Video_' + Date.now() + '.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function regenerateVideo(prompt, containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="color: #cba6f7; font-size: 14px; margin-bottom: 10px;">🎬 Video yeniden oluşturuluyor...</div>
                    <div id="${containerId}-progress" style="width: 100%; height: 6px; background: var(--cc-border); border-radius: var(--cc-radius); margin-bottom: 10px; overflow: hidden;">
                        <div style="width: 0%; height: 100%; background: linear-gradient(90deg, #cba6f7, var(--cc-accent-brand)); transition: width 0.3s;"></div>
                    </div>
                    <div id="${containerId}-status" style="color: var(--cc-text-muted); font-size: 12px;">Hazırlanıyor...</div>
                </div>
            `;
        }
        queueVideoSlideshow(prompt, containerId);
    }

    function editVideoPrompt(prompt) {
        setComposerValue(prompt);
    }

    function deleteVideoCard(containerId) {
        if (confirm("Bu videoyu silmek istiyor musun?")) {
            const container = document.getElementById(containerId);
            if (container) {
                container.remove();
            }
            // LocalStorage'dan da silmeye çalış
            try {
                let library = JSON.parse(localStorage.getItem('cinocode_library')) || [];
                library = library.filter(item => !item.id || !item.id.includes(containerId));
                localStorage.setItem('cinocode_library', JSON.stringify(library));
            } catch(e) {
                console.error("Library silme hatası:", e);
            }
        }
    }


    function copyPromptTextFallback(text, btnElement) {
        function fallbackCopyToClipboard(txt) {
            const textarea = document.createElement('textarea');
            textarea.value = txt;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(textarea);
        }

        const handleSuccess = () => {
            if (btnElement) {
                const t = btnElement.textContent;
                btnElement.textContent = 'Kopyalandı!';
                setTimeout(() => btnElement.textContent = t, 2000);
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(handleSuccess).catch(() => {
                fallbackCopyToClipboard(text);
                handleSuccess();
            });
        } else {
            fallbackCopyToClipboard(text);
            handleSuccess();
        }
    }

    function retryLastMediaPrompt(type, promptText) {
        const prompt = String(promptText || lastMediaPrompt || '').trim();
        if (!prompt) {
            showNonBlockingToast('Tekrar denenecek prompt bulunamadı.');
            return;
        }
        const mediaType = type || lastMediaType || 'image';
        setAppMode(mediaType === 'video' ? 'video' : 'image');
        const cleanPrompt = String(prompt).replace(/^(?:\s*(?:Resim\s*çiz|Resim|Video\s*oluştur|Video\s*olustur)\s*:\s*)+/i, '').trim();
        setComposerValue(mediaType === 'video' ? `Video oluştur: ${cleanPrompt}` : `Resim çiz: ${cleanPrompt}`, { focus: false });
        sendMessage();
    }
    function copyPromptToClipboard(prompt) {
        navigator.clipboard.writeText(prompt).then(() => {
            alert("✅ Prompt kopyalandı!");
        }).catch(err => {
            console.error("Kopyalama hatası:", err);
            alert("❌ Kopyalama başarısız");
        });
    }

    // Global scope'a ata
    window.downloadVideo = downloadVideo;
    window.regenerateVideo = regenerateVideo;
    window.editVideoPrompt = editVideoPrompt;
    window.deleteVideoCard = deleteVideoCard;
    window.copyPromptToClipboard = copyPromptToClipboard;
    window.retryLastMediaPrompt = retryLastMediaPrompt;
    window.toggleLikeMessage = toggleLikeMessage;
    window.toggleDislikeMessage = toggleDislikeMessage;
    window.copyUserMessage = copyUserMessage;
    window.resendUserMessage = resendUserMessage;
        window.continueFromMessage = continueFromMessage;
    window.branchChatFromMessage = continueFromMessage;
    window.shareMessage = shareMessage;
    window.shareUserMessage = shareUserMessage;
    window.shortenMessage = shortenMessage;
    window.copyMessageMarkdown = copyMessageMarkdown;
    window.improveUserPrompt = improveUserPrompt;
    window.toggleMsgMoreMenu = toggleMsgMoreMenu;
    window.triggerCameraCapture = triggerCameraCapture;
    window.closeCameraModal = closeCameraModal;
    window.captureCameraPhoto = captureCameraPhoto;
    window.handleMediaSelect = handleMediaSelect;
    window.handleAudioSelect = handleAudioSelect;
    window.copyPromptTextFallback = copyPromptTextFallback;

    function enhanceVideoPrompt(basePrompt, quality, isLongVideo) {
        let enhanced = basePrompt;

        // Kalite bazlı geliştirmeler
        if (quality === 'high') {
            enhanced += ', detailed camera movement, professional lighting, high resolution, sharp focus';
        } else if (quality === 'cinematic') {
            enhanced += ', cinematic camera angles, dramatic lighting, film grain, depth of field, professional color grading, smooth transitions';
        }

        // Uzun video için sahne tutarlılığı
        if (isLongVideo) {
            enhanced += ', consistent character design, scene-to-scene continuity, detailed environment, narrative flow, smooth scene transitions';
        }

        // Genel video geliştirmeleri
        enhanced += ', dynamic composition, visual storytelling, engaging atmosphere';

        return enhanced;
    }


    function editMessage(index, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const chat = sessions[currentChatId];
        if (!chat || !chat.messages[index]) return;

        const msg = chat.messages[index];
        setComposerValue(msg.content);

        if (typeof showNonBlockingToast === 'function') {
            showNonBlockingToast("Düzenleme modu: Metin giriş alanına kopyalandı.");
        }

        const inputArea = document.getElementById("messageInput");
        if (inputArea) inputArea.focus();
    }

    function getMessageCopyText(content) {
        const raw = String(content || "");
        // [GENERATE_IMAGE:...]/[GENERATE_VIDEO:...] gibi internal işaretleyicileri kullanıcıya kopyalama;
        // parantez içindeki asıl prompt'u çıkarıp teknik/stil suffix'lerini temizle.
        const match = raw.match(/^\s*\[(?:GENERATE_IMAGE|GENERATE_VIDEO):\s*([\s\S]*?)\]\s*$/i);
        if (!match) return raw;
        return getPublicVideoSubject(match[1]);
    }



    function continueFromMessage(index) {
        const chat = sessions[currentChatId];
        if (!chat || !chat.messages) return;

        const slicedHistory = chat.messages.slice(0, index + 1);
        if (slicedHistory.length === 0) return;

        const newId = "chat_" + Date.now();
        const baseTitle = chat.title || "";

        let newTitle;
        if (isBadAutoTitle(baseTitle)) {
            const firstUserMsg = slicedHistory.find(m => m.role === "user");
            newTitle = generateChatTitleFromMessage(firstUserMsg ? firstUserMsg.content : "", "");
        } else {
            const cleanedBase = baseTitle.replace(/\s*—\s*(Devam|Buradan Devam)$/i, "").trim();
            newTitle = `${cleanedBase} — Devam`;
        }

        sessions[newId] = {
            title: newTitle,
            messages: JSON.parse(JSON.stringify(slicedHistory)),
            createdAt: Date.now(),
            starred: false,
            manualTitle: chat.manualTitle || false,
            updatedAt: Date.now(),
            projectId: chat.projectId || null
        };
        currentChatId = newId;
        saveDatabase();
        renderCurrentChat();
        showNonBlockingToast("Yeni sohbet bu mesajdan başlatıldı.");
    }

    function toggleLikeMessage(index, btn) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        msg.liked = !msg.liked;
        if (msg.liked) msg.disliked = false;
        saveDatabase();
        renderCurrentChat();
    }
    function toggleDislikeMessage(index, btn) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        msg.disliked = !msg.disliked;
        if (msg.disliked) msg.liked = false;
        saveDatabase();
        renderCurrentChat();
    }



    function shareMessage(index) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        const text = getMessageCopyText(msg.content);
        if (navigator.share) {
            navigator.share({ text: text }).catch(() => {});
        } else {
            navigator.clipboard.writeText(text);
            showNonBlockingToast("Paylaşım desteklenmiyor, mesaj kopyalandı.");
        }
    }

    function shareUserMessage(index) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        if (navigator.share) {
            navigator.share({ text: msg.content }).catch(() => {});
        } else {
            navigator.clipboard.writeText(msg.content);
            showNonBlockingToast("Paylaşım desteklenmiyor, mesaj kopyalandı.");
        }
    }

    function shortenMessage(index) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        const text = getMessageCopyText(msg.content);
        setComposerValue(`Bana bunu daha kısa ve net hale getir: ${text}`);
        showNonBlockingToast("Kısaltma isteği composer'a alındı.");
    }

    function copyMessageMarkdown(index) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        navigator.clipboard.writeText(msg.content);
        showNonBlockingToast("Markdown metin kopyalandı.");
    }

    function improveUserPrompt(index) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        setComposerValue(`Bu promptu daha net ve etkili hale getir: ${msg.content}`);
        showNonBlockingToast("Prompt iyileştirme için composer'a alındı.");
    }

    function toggleMsgMoreMenu(index, event) {
        event.stopPropagation();
        document.querySelectorAll('.chat-action-menu').forEach(menu => {
            if (menu.id !== 'msg-more-menu-' + index) {
                menu.classList.remove('active');
                const parentActions = menu.closest('.msg-actions');
                if (parentActions) parentActions.classList.remove('has-active-menu');
            }
        });
        const menu = document.getElementById('msg-more-menu-' + index);
        if (menu) {
            menu.classList.toggle('active');
            const parentActions = menu.closest('.msg-actions');
            if (parentActions) {
                if (menu.classList.contains('active')) {
                    parentActions.classList.add('has-active-menu');
                } else {
                    parentActions.classList.remove('has-active-menu');
                }
            }
        }
    }

    function copyUserMessage(index, btn) {
        const msg = sessions[currentChatId].messages[index];
        if (!msg) return;
        navigator.clipboard.writeText(msg.content);
        showNonBlockingToast("Mesaj kopyalandı.");
    }

    function resendUserMessage(index) {
        const chat = sessions[currentChatId];
        if (!chat || !chat.messages || !chat.messages[index]) return;
        const msg = chat.messages[index];

        let isLastUser = true;
        for (let i = index + 1; i < chat.messages.length; i++) {
            if (chat.messages[i].role === "user") {
                isLastUser = false;
                break;
            }
        }

        if (isLastUser) {
            setComposerValue(msg.content);
            if (msg.images && msg.images.length > 0) {
                selectedImageBase64 = msg.images[0];
                const preview = document.getElementById('imagePreview');
                const container = document.getElementById('imagePreviewContainer');
                if (preview && container) {
                    preview.src = selectedImageBase64;
                    container.style.display = 'block';
                }
            }
            sendMessage();
            showNonBlockingToast("Mesaj tekrar gönderiliyor...");
        } else {
            const slicedHistory = chat.messages.slice(0, index);
            const newId = "chat_" + Date.now();
            const baseTitle = chat.title || "";
            const cleanTitle = isBadAutoTitle(baseTitle) ? "" : baseTitle;
            const newTitle = cleanTitle ? `${cleanTitle} — Devam` : "Buradan Devam";

            sessions[newId] = {
                title: newTitle,
                messages: JSON.parse(JSON.stringify(slicedHistory)),
                createdAt: Date.now(),
                starred: false,
                manualTitle: chat.manualTitle || false,
                updatedAt: Date.now(),
                projectId: chat.projectId || null
            };
            currentChatId = newId;
            saveDatabase();

            setComposerValue(msg.content);
            if (msg.images && msg.images.length > 0) {
                selectedImageBase64 = msg.images[0];
                const preview = document.getElementById('imagePreview');
                const container = document.getElementById('imagePreviewContainer');
                if (preview && container) {
                    preview.src = selectedImageBase64;
                    container.style.display = 'block';
                }
            }
            renderCurrentChat();
            sendMessage();
            showNonBlockingToast("Yeni sohbette tekrar gönderiliyor...");
        }
    }

    function copyMessage(index, btn) {
        const msg = sessions[currentChatId].messages[index];
        navigator.clipboard.writeText(getMessageCopyText(msg.content));
        const oldText = btn.innerText;
        btn.innerText = "✅";
        setTimeout(() => btn.innerText = oldText, 2000);
    }

    function speakMessage(index) {
        const msg = sessions[currentChatId].messages[index];
        stopSpeaking();
        speakText(msg.content);
    }

    function regenerateMessage() {
        const chat = sessions[currentChatId];
        if (chat.messages.length > 1) {
            if (chat.messages[chat.messages.length - 1].role === "assistant") {
                chat.messages.pop();
            }
            const lastUserMsg = chat.messages[chat.messages.length - 1];
            chat.messages.pop(); // Pop user msg to re-send it
            saveDatabase();

            setComposerValue(lastUserMsg.content);
            if(lastUserMsg.images && lastUserMsg.images.length > 0) {
                selectedImageBase64 = lastUserMsg.images[0];
                document.getElementById('imagePreview').src = selectedImageBase64;
                document.getElementById('imagePreviewContainer').style.display = 'block';
            }
            sendMessage();
        }
    }

    function renderCurrentChat() {
        const libScreen = document.getElementById("libraryScreen");
        if (libScreen) libScreen.style.display = "none";
        messagesDiv.innerHTML = "";
        const history = sessions[currentChatId].messages;

        // Eğer sadece system prompt varsa (yeni sohbet) Quick Start göster
        if (history.length <= 1) {
            document.getElementById("welcomeScreen").style.display = "flex";
            messagesDiv.style.display = "none";
            const personaValue = document.getElementById("personaSelect") ? document.getElementById("personaSelect").value : "kanka";
            const welcomeGreetingTextEl = document.getElementById("welcomeGreetingText");
            if (welcomeGreetingTextEl) {
                welcomeGreetingTextEl.textContent = getWelcomeGreetingText(personaValue);
            }
        } else {
            document.getElementById("welcomeScreen").style.display = "none";
            messagesDiv.style.display = "flex";
        }

        history.forEach((msg, index) => {
            if (msg.role === "system") return;

            const div = document.createElement("div");
            div.className = `message ${msg.role === "user" ? "user" : "bot"}`;

            if (msg.role === "user") {
                let htmlContent = `<div style="white-space:pre-wrap;">${escapeHtmlText(msg.content)}</div>`;
                if (msg.images && msg.images.length > 0) {
                    const safeImageSrc = getSafeMessageImageSrc(msg.images[0]);
                    if (safeImageSrc) {
                        htmlContent += `<img src="${safeImageSrc}" alt="Kullanıcı görseli" style="max-height:200px; border-radius: var(--cc-radius); display:block; margin-top:8px; border: 2px solid var(--cc-accent-brand);">`;
                    }
                }
                if (msg.documentText) {
                    htmlContent += `<div style="margin-top:8px; padding:8px 12px; border-radius: var(--cc-radius); background:rgba(255,255,255,0.1); border:1px solid var(--cc-accent-brand); display:inline-flex; align-items:center; gap:8px;">
                        <span style="font-size:1.5em;">📄</span>
                        <span><b>${escapeHtmlText(msg.documentName || 'Ekli Belge')}</b></span>
                    </div>`;
                }

                const uiMode = localStorage.getItem('cinocodeUiMode') || 'new';
                if (uiMode === 'classic') {
                    // Simple user actions: Edit, Copy
                    htmlContent += `<div class="msg-actions">
                        <button class="msg-action-btn" onclick="editMessage(${index}, event)" title="Düzenle">✏️</button>
                        <button class="msg-action-btn" onclick="copyUserMessage(${index}, this)" title="Kopyala">📋</button>
                    </div>`;
                } else {
                    htmlContent += `<div class="msg-actions" style="position:relative;">
                        <button class="msg-action-btn" onclick="editMessage(${index}, event)" title="Mesajı düzenle">✏️</button>
                        <button class="msg-action-btn" onclick="copyUserMessage(${index}, this)" title="Mesajı kopyala">📋</button>

                        <div style="position:relative; display:inline-block;">
                            <button class="msg-action-btn" onclick="toggleMsgMoreMenu(${index}, event)" title="Daha Fazla">⋯</button>
                            <div class="chat-action-menu" id="msg-more-menu-${index}" style="right:0; top:100%; min-width:180px;">
                                <button class="chat-menu-item" onclick="shareUserMessage(${index})">↗ Paylaş</button>
                                <button class="chat-menu-item" onclick="speakMessage(${index})">🔊 Sesli Oku</button>
                                <button class="chat-menu-item" onclick="continueFromMessage(${index})">↳ Buradan Devam Et</button>
                                <button class="chat-menu-item" onclick="resendUserMessage(${index})">🔄 Tekrar Gönder</button>
                                <button class="chat-menu-item" onclick="improveUserPrompt(${index})">✨ Promptu İyileştir</button>
                            </div>
                        </div>
                    </div>`;
                }

                div.innerHTML = htmlContent;
            } else {
                div.innerHTML = renderContentWithImages(msg.content, index === history.length - 1);
                appendInternetImageResults(div, msg);
                addCopyButtons(div);

                const actionDiv = document.createElement("div");
                actionDiv.className = "msg-actions";

                const uiMode = localStorage.getItem('cinocodeUiMode') || 'new';
                actionDiv.innerHTML = buildMsgActionsHTML(index, msg, uiMode, index === history.length - 1);
                div.appendChild(actionDiv);
                const prevUser = [...history.slice(0, index)].reverse().find(m => m.role === "user" && m.content);
                appendSmartSuggestions(div, msg.content, prevUser ? prevUser.content : "");
            }
            messagesDiv.appendChild(div);
            if (msg.role === 'assistant' && typeof applyShowMoreLogic === 'function') {
                applyShowMoreLogic(div);
            }
        });
        // En sona görünmez bir çapa (anchor) div ekle
        let bottomAnchor = document.getElementById('chat-bottom-anchor');
        if (!bottomAnchor) {
            bottomAnchor = document.createElement('div');
            bottomAnchor.id = 'chat-bottom-anchor';
            bottomAnchor.style.height = '1px';
        }
        messagesDiv.appendChild(bottomAnchor);
        setupPlaceholderImageObserver();
        scrubPlaceholderErrorImages(messagesDiv);
        requestAnimationFrame(() => scrubPlaceholderErrorImages(messagesDiv));
        setTimeout(() => scrubPlaceholderErrorImages(messagesDiv), 300);
        // Birden fazla gecikmeyle scroll yap (resimler/kodlar yüklenene kadar)
        scrollToBottom();
        setTimeout(scrollToBottom, 150);
        setTimeout(scrollToBottom, 500);
    }

    function scrollToBottom() {
        // CSS'teki scroll-behavior: smooth kaydırmayı yavaşlatıyor, geçici olarak kapat
        messagesDiv.style.scrollBehavior = 'auto';
        messagesDiv.scrollTop = messagesDiv.scrollHeight + 99999;
        // Kısa bir süre sonra smooth'a geri dön (yeni mesaj yazarken güzel görünsün)
        setTimeout(() => { messagesDiv.style.scrollBehavior = 'smooth'; }, 100);
    }

    // ----- SESLİ KONUzMA (TTS & STT) -----
    let isRecording = false;
    let isStarting = false;
    let recognition = null;

    let sttFinalBuffer = '';         // Biriken final metni
    let sttFlushTimer = null;         // Debounce timer
    const STT_FLUSH_DELAY = 400;      // ms — mobilde kısa cümle sonrası yazma gecikmesi

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1; // 3'ten 1'e düşürdük — mobilde hız artar
        recognition.lang = 'tr-TR';

        recognition.onstart = () => {
            isStarting = false;
            isRecording = true;
            sttFinalBuffer = '';  // Yeni oturum başlıyor, buffer temizle
            if (sttFlushTimer) { clearTimeout(sttFlushTimer); sttFlushTimer = null; }
            document.getElementById("micBtn").classList.add("listening");
            userInput.placeholder = "Dinliyorum... Konuşun...";
        };

        recognition.onresult = (e) => {
            // Tüm final sonuçları biriktir — kelime kelime değil cümle bazında flush
            let newFinal = '';
            let interimStr = '';

            for (let i = e.resultIndex; i < e.results.length; ++i) {
                const result = e.results[i];
                const textVal = result[0].transcript;
                if (result.isFinal) {
                    newFinal += (newFinal ? ' ' : '') + textVal.trim();
                } else {
                    interimStr += textVal;
                }
            }

            if (newFinal) {
                sttFinalBuffer += (sttFinalBuffer ? ' ' : '') + newFinal;

                // Debounce: 400ms sessizlik sonra yaz
                if (sttFlushTimer) clearTimeout(sttFlushTimer);
                sttFlushTimer = setTimeout(() => {
                    if (!sttFinalBuffer) return;
                    const cleaned = dedupeSpeechTranscript(sttFinalBuffer.trim());
                    sttFinalBuffer = '';
                    sttFlushTimer = null;
                    if (!isDuplicateSttFinal(cleaned)) {
                        const cur = userInput.value;
                        userInput.value = cur ? cur + ' ' + cleaned : cleaned;
                        autoResize(userInput);
                        saveComposerDraft();
                        try {
                            const sendBtn = document.getElementById('sendBtn') || document.querySelector('.send-btn');
                            if (sendBtn) sendBtn.disabled = false;
                        } catch(e) {}
                    }
                    userInput.placeholder = "CinoCode'a bir şeyler sor...";
                }, STT_FLUSH_DELAY);
            }

            // Interim sonucu placeholder'da göster — kullanıcı ne söylüyor görsün
            if (interimStr) {
                userInput.placeholder = '📖 ' + interimStr.trim();
            }
        };

        recognition.onerror = (err) => {
            isStarting = false;
            console.error("STT Hatası:", err);
            if (err.error === 'not-allowed') {
                alert("Tarayıcı mikrofon iznini engellemiş olabilir. Lütfen siteye mikrofon izni verin.");
            } else if (err.error !== 'no-speech') {
                console.log("Mikrofon hatası: " + err.error);
            }
            if (err.error !== 'no-speech') stopMic();
        };
        recognition.onend = () => {
            isStarting = false;
            // Buffer'da bekleyen varsa hemen yaz
            if (sttFinalBuffer && sttFinalBuffer.trim()) {
                if (sttFlushTimer) clearTimeout(sttFlushTimer);
                sttFlushTimer = null;
                const cleaned = dedupeSpeechTranscript(sttFinalBuffer.trim());
                sttFinalBuffer = '';
                if (!isDuplicateSttFinal(cleaned)) {
                    const cur = userInput.value;
                    userInput.value = cur ? cur + ' ' + cleaned : cleaned;
                    autoResize(userInput);
                    saveComposerDraft();
                }
            }
            if (isRecording) {
                setTimeout(() => {
                    if (isRecording) {
                        try { recognition.start(); } catch(e) { stopMic(); }
                    }
                }, 100);
            } else {
                stopMic();
            }
        };
    }

    function toggleMic() {
        if (!recognition) return alert("Tarayıcınız mikrofon desteklemiyor veya sayfa yeniden yüklenmesi gerekebilir.");
        if (isRecording || isStarting) {
            stopMic();
        } else {
            // userInput.value = ""; // İPTAL! Artık eski yazdıklarını veya dosya eklerini silmeyecek!
            isStarting = true;
            try {
                recognition.start();
            } catch(e) {
                isStarting = false;
                if (e.name === 'NotAllowedError') {
                    alert("Tarayıcı mikrofon iznini engellemiş olabilir. Lütfen siteye mikrofon izni verin.");
                } else {
                    console.log("Mikrofon zaten açık:", e);
                }
            }
        }
    }

    function stopMic() {
        isStarting = false;
        if (!isRecording) return;
        isRecording = false;
        // Buffer'ı temizle
        if (sttFlushTimer) { clearTimeout(sttFlushTimer); sttFlushTimer = null; }
        sttFinalBuffer = '';
        if (recognition) {
            try { recognition.stop(); } catch(e) {}
        }
        document.getElementById("micBtn").classList.remove("listening");
        userInput.placeholder = "CinoCode'a bir şeyler sor...";
    }

    let isSpeakerOn = true;
    const synth = window.speechSynthesis;

    const VOICE_DEFAULT_LABELS = {
        male_local: { icon: "👨🏻", name: "Deniz (Cihazın Kendi Sesi)" },
        male_edge_tolga: { icon: "👨🏽", name: "Tolga (Standart Erkek)" },
        female_gtts: { icon: "👩🏽", name: "Ayşe Abla (Standart Kadın Sesi)" },
        male_gtts: { icon: "👨🏿", name: "Cüneyt Abi (HD Erkek Ses)" },
        female_edge: { icon: "👩🏾", name: "Cino Abla (HD Kadın Ses)" },
        female_melis: { icon: "👩🏼", name: "Melis (Enerjik Kadın)" },
        female_zeynep: { icon: "👩🏻", name: "Zeynep (Sakin Kadın)" },
        male_emre: { icon: "👨🏼", name: "Emre (Enerjik Erkek)" },
        male_baris: { icon: "👨🏾", name: "Barış (Sakin Erkek)" }
    };

    function getVoiceCustomNames() {
        try { return JSON.parse(localStorage.getItem('cinocode_voice_custom_names') || '{}'); } catch (e) { return {}; }
    }

    function getVoiceDisplayName(voiceId) {
        const custom = getVoiceCustomNames();
        if (custom[voiceId]) return custom[voiceId];
        const def = VOICE_DEFAULT_LABELS[voiceId];
        return def ? def.name : voiceId;
    }

    function setVoiceCustomName(voiceId, name) {
        const custom = getVoiceCustomNames();
        if (name && name.trim()) {
            custom[voiceId] = name.trim();
        } else {
            delete custom[voiceId];
        }
        localStorage.setItem('cinocode_voice_custom_names', JSON.stringify(custom));
    }

    function resetVoiceCustomName(voiceId) {
        const custom = getVoiceCustomNames();
        delete custom[voiceId];
        localStorage.setItem('cinocode_voice_custom_names', JSON.stringify(custom));
    }


    function toggleVoiceQuickSettings(e) {
        if(e) e.stopPropagation();
        const popover = document.getElementById('voiceQuickSettingsPopover');
        const btn = document.getElementById('voiceQuickSettingsBtn');
        if (!popover) return;
        if (popover.style.display === 'none') {
            if(btn) {
                const rect = btn.getBoundingClientRect();
                popover.style.top = (rect.bottom + 8) + 'px';
                popover.style.left = (rect.left - 250) + 'px';
                popover.style.right = 'auto';
            }
            updateVoiceQuickSettingsPopover();
            popover.style.display = 'block';
        } else {
            popover.style.display = 'none';
        }
    }

            function updateVoiceQuickSettingsPopover() {
        const popover = document.getElementById('voiceQuickSettingsPopover');
        if (!popover) return;

        popover.style.maxHeight = '75vh';
        popover.style.overflowY = 'auto';

        // Her açılışta içeriği zorla oluştur, böylece eksik render imkansızlaşır.
        popover.innerHTML = `
            <div style="font-weight:bold; font-size:13px; margin-bottom:8px; border-bottom:1px solid var(--cc-border); padding-bottom:6px;">Ses Ayarları</div>
            <div style="font-size:12px; margin-bottom:8px;"><strong>Seçili Ses:</strong> <span id="quickSelectedVoiceName" style="color:var(--cc-accent-brand);">-</span></div>
            <div style="display:flex; gap:4px; margin-bottom:10px;">
                <button type="button" onclick="quickEditSelectedVoice(event)" style="background:var(--cc-border); border:none; color:var(--cc-accent-brand); cursor:pointer; font-size:11px; padding:4px 8px; border-radius: var(--cc-radius);">Görünen adı değiştir</button>
                <button type="button" onclick="quickResetSelectedVoice(event)" style="background:var(--cc-border); border:none; color:#f38ba8; cursor:pointer; font-size:11px; padding:4px 8px; border-radius: var(--cc-radius);">Varsayılana döndür</button>
            </div>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; margin-bottom:10px; padding-top:6px; border-top:1px solid var(--cc-border);">
                <input type="checkbox" id="quickVoiceLockToggle" style="margin-top:2px; accent-color:#a6e3a1;" onchange="quickSyncVoiceLock(this.checked)">
                <span style="font-size:11px; line-height:1.2;">
                    <strong>Ses sabit kalsın</strong><br>
                    <span style="color:var(--cc-text-muted); font-size:10px;">Açıkken seçili ses, Türkçe/İngilizce karışık metinlerde değişmez.</span>
                </span>
            </label>
            <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer; margin-bottom:10px; padding-top:6px; border-top:1px solid var(--cc-border);">
                <input type="checkbox" id="quickVoiceReadEmojisToggle" style="margin-top:2px; accent-color:var(--cc-accent-brand);" onchange="quickSyncVoiceReadEmojis(this.checked)">
                <span style="font-size:11px; line-height:1.2;">
                    <strong>Emojileri de oku</strong><br>
                    <span style="color:var(--cc-text-muted); font-size:10px;">Açıkken TTS, metindeki emoji sembollerini okumaya çalışır.</span>
                </span>
            </label>
            <details style="border-top:1px solid var(--cc-border); padding-top:6px;" open>
                <summary style="font-size:11px; cursor:pointer; color:#a6e3a1; font-weight:600;">Tüm ses adlarını düzenle</summary>
                <div id="quickVoiceAllList" style="margin-top:6px; max-height:40vh; overflow-y:auto; display:flex; flex-direction:column; gap:4px; padding-right:4px;"></div>
            </details>
        `;

        const voiceSelect = document.getElementById('voiceSelect');
        const voiceId = voiceSelect ? voiceSelect.value : '';
        const nameSpan = document.getElementById('quickSelectedVoiceName');
        if (nameSpan) {
            if (voiceId) {
                if (voiceId.startsWith('native_')) {
                    const idx = parseInt(voiceId.split('_')[1]);
                    const voices = window.speechSynthesis.getVoices();
                    nameSpan.textContent = voices[idx] ? voices[idx].name : voiceId;
                } else {
                    nameSpan.textContent = getVoiceDisplayName(voiceId);
                }
            } else {
                nameSpan.textContent = '-';
            }
        }

        const lockToggle = document.getElementById('quickVoiceLockToggle');
        if (lockToggle) {
            lockToggle.checked = isTtsVoiceLockEnabled();
        }
        const emojisToggle = document.getElementById('quickVoiceReadEmojisToggle');
        if (emojisToggle) {
            emojisToggle.checked = isTtsReadEmojisEnabled();
        }


        const listDiv = document.getElementById('quickVoiceAllList');
        if (listDiv) {
            const custom = getVoiceCustomNames();
            let listHtml = '';
            Object.keys(VOICE_DEFAULT_LABELS).forEach(vid => {
                const displayName = getVoiceDisplayName(vid);
                const isCustom = !!custom[vid];
                listHtml += `<div style="display:flex; align-items:center; justify-content:space-between; gap:6px; padding:3px 0; border-bottom:1px solid var(--cc-border); font-size:11px;">
                    <span style="color:var(--cc-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${escapeSidebarHtml(displayName)}</span>
                    <span style="display:flex; gap:1px; flex-shrink:0;">
                        <button type="button" onclick="promptRenameVoice('${vid}')" title="Görünen adı değiştir" style="background:transparent; border:none; color:var(--cc-accent-brand); cursor:pointer; font-size:12px; padding:0 4px;">✏️</button>
                        ${isCustom ? `<button type="button" onclick="resetVoiceName('${vid}')" title="Varsayılana döndür" style="background:transparent; border:none; color:#f38ba8; cursor:pointer; font-size:12px; padding:0 4px;">↩</button>` : ''}
                    </span>
                </div>`;
            });
            listDiv.innerHTML = listHtml;
        }
    }

    function quickSyncVoiceLock(checked) {
        localStorage.setItem('cinocode_tts_voice_lock_enabled', checked ? '1' : '0');
        const mainToggle = document.getElementById('ttsVoiceLockToggle');
        if (mainToggle) mainToggle.checked = checked;
    }

    function quickEditSelectedVoice(e) {
        if(e) e.stopPropagation();
        const voiceSelect = document.getElementById('voiceSelect');
        const voiceId = voiceSelect ? voiceSelect.value : '';
        if (!voiceId) return;
        if (voiceId.startsWith('native_')) {
            showToast("Cihaz sesleri için isim değiştirilemez.", "warning");
            return;
        }
        promptRenameVoice(voiceId);
    }

    function quickResetSelectedVoice(e) {
        if(e) e.stopPropagation();
        const voiceSelect = document.getElementById('voiceSelect');
        const voiceId = voiceSelect ? voiceSelect.value : '';
        if (!voiceId) return;
        if (voiceId.startsWith('native_')) {
            showToast("Cihaz sesleri varsayılana döndürülemez.", "warning");
            return;
        }
        resetVoiceName(voiceId);
    }

    // Dismiss listeners
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('voiceQuickSettingsPopover');
        const btn = document.getElementById('voiceQuickSettingsBtn');
        if (popover && popover.style.display === 'block') {
            if (!popover.contains(e.target) && e.target !== btn) {
                popover.style.display = 'none';
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const popover = document.getElementById('voiceQuickSettingsPopover');
            if (popover && popover.style.display === 'block') {
                popover.style.display = 'none';
            }
        }
    });

    function promptRenameVoice(voiceId) {
        setTimeout(() => { if (typeof updateVoiceQuickSettingsPopover === "function") updateVoiceQuickSettingsPopover(); }, 50);
        const currentName = getVoiceDisplayName(voiceId);
        const newName = prompt("Bu sesin görünen adını gir:", currentName);
        if (newName === null) return;
        setVoiceCustomName(voiceId, newName);
        populateVoices();
        renderVoiceNameEditor();
    }

    function resetVoiceName(voiceId) {
        setTimeout(() => { if (typeof updateVoiceQuickSettingsPopover === "function") updateVoiceQuickSettingsPopover(); }, 50);
        resetVoiceCustomName(voiceId);
        populateVoices();
        renderVoiceNameEditor();
    }

    function renderVoiceNameEditor() {
        const container = document.getElementById('voiceNameEditorList');
        if (!container) return;
        const custom = getVoiceCustomNames();
        let html = '';
        Object.keys(VOICE_DEFAULT_LABELS).forEach(voiceId => {
            const displayName = getVoiceDisplayName(voiceId);
            const isCustom = !!custom[voiceId];
            html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:1px solid var(--cc-border);">
                <span style="color:var(--cc-text-primary); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeSidebarHtml(displayName)}</span>
                <span style="display:flex; gap:2px; flex-shrink:0;">
                    <button type="button" onclick="promptRenameVoice('${voiceId}')" title="İsmi değiştir" style="background:transparent; border:none; color:var(--cc-accent-brand); cursor:pointer; font-size:14px; padding:2px 6px;">✏️</button>
                    ${isCustom ? `<button type="button" onclick="resetVoiceName('${voiceId}')" title="Varsayılana dön" style="background:transparent; border:none; color:#f38ba8; cursor:pointer; font-size:14px; padding:2px 6px;">↺</button>` : ''}
                </span>
            </div>`;
        });
        container.innerHTML = html;
    }

    function populateVoices() {
        let defaultHtml = '';
        Object.keys(VOICE_DEFAULT_LABELS).forEach(voiceId => {
            const def = VOICE_DEFAULT_LABELS[voiceId];
            defaultHtml += `<option value="${voiceId}">${def.icon} ${escapeSidebarHtml(getVoiceDisplayName(voiceId))}</option>\n`;
        });

        let voices = synth.getVoices();
        if (voices.length > 0) {
            defaultHtml += `<optgroup label="Cihaz Sesleri (Tüm Sesler)">`;
            voices.forEach((v, idx) => {
                let isTr = (v.lang || "").toLowerCase().includes("tr") ? "\u{1F1F9}\u{1F1F7} " : "\u{1F50A} ";
                const val = v.voiceURI ? `native_uri_${encodeURIComponent(v.voiceURI)}` : `native_${idx}`;
                defaultHtml += `<option value="${val}">${isTr}${v.name}</option>`;
            });
            defaultHtml += `</optgroup>`;
        }

        voiceSelect.innerHTML = defaultHtml;
        const voiceSelectMobile = document.getElementById('voiceSelectMobile');
        if (voiceSelectMobile) voiceSelectMobile.innerHTML = defaultHtml;

        const savedVoice = localStorage.getItem("cinocode_voice_idx");
        if (savedVoice !== null) {
            if (voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
                voiceSelect.value = savedVoice;
            }
            if (voiceSelectMobile && voiceSelectMobile.querySelector(`option[value="${savedVoice}"]`)) {
                voiceSelectMobile.value = savedVoice;
            }
        }

        if (document.getElementById("voiceControlsContainer")) document.getElementById("voiceControlsContainer").style.display = "inline-flex";
        else voiceSelect.style.display = "block";
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }

    // Anında çalıştır ki en azından varsayılan 5 seçenek hemen dolsun
    populateVoices();

    // Agresif Uyandirma (Polling)
    let voicePolls = 0;
    let voicePollInterval = setInterval(() => {
        if (synth.getVoices().length > 0) {
            populateVoices();
            clearInterval(voicePollInterval);
        }
        if (++voicePolls > 10) clearInterval(voicePollInterval); // 5 saniye sonra pes et
    }, 500);

    function saveVoicePref() {
        setTimeout(() => { if (typeof updateVoiceQuickSettingsPopover === "function") updateVoiceQuickSettingsPopover(); }, 50);
        localStorage.setItem("cinocode_voice_idx", voiceSelect.value);
    }

    function initCustomPersonaDropdown() {
        const select = document.getElementById('personaSelect');
        const selectMobile = document.getElementById('personaSelectMobile');
        if (!select) return;

        // Hide original selects
        select.style.display = 'none';
        if (selectMobile) selectMobile.style.display = 'none';

        // Inject custom styles if not already present
        if (!document.getElementById('customPersonaStyles')) {
            const style = document.createElement('style');
            style.id = 'customPersonaStyles';
            style.textContent = `
                .custom-persona-opt:hover, .custom-persona-opt-mobile:hover {
                    background: var(--cc-border) !important;
                }
                .custom-persona-opt.active, .custom-persona-opt-mobile.active {
                    background: rgba(166, 227, 161, 0.15) !important;
                    color: #a6e3a1 !important;
                    font-weight: bold !important;
                }
                #customProfessionsHeader:hover, #customProfessionsHeaderMobile:hover {
                    background: var(--cc-border) !important;
                }
            `;
            document.head.appendChild(style);
        }

        const coreModes = {
            "kanka": { label: "🤖 Standart Zeka (Kanka)", text: "🤖 Kanka" },
            "usta_yazilimci": { label: "💻 Usta Yazılımcı", text: "💻 Usta Yazılımcı" },
            "akademik_koc": { label: "📚 Sınav Koçu", text: "📚 Sınav Koçu" },
            "dil_kocu": { label: "🌍 Özel Dil Koçu", text: "🌍 Özel Dil Koçu" },
            "derin_arastirma": { label: "🔍 Derin Araştırma", text: "🔍 Derin Araştırma" }
        };

        const professions = {
            "profesor": { emoji: "🎓", name: "Profesör / Akademisyen" },
            "doktor": { emoji: "🩺", name: "Doktor" },
            "dis_hekimi": { emoji: "🦷", name: "Diş Hekimi" },
            "psikolog": { emoji: "🧠", name: "Psikolog" },
            "ogretmen": { emoji: "🏫", name: "Öğretmen" },
            "mimar": { emoji: "📐", name: "Mimar" },
            "avukat": { emoji: "⚖️", name: "Avukat" },
            "muhasebeci": { emoji: "📊", name: "Muhasebeci" },
            "yazilim_muhendisi": { emoji: "💻", name: "Yazılım Mühendisi" },
            "makine_muhendisi": { emoji: "⚙️", name: "Makine Mühendisi" },
            "sef": { emoji: "🍳", name: "Şef / Aşçı" },
            "fitness_kocu": { emoji: "💪", name: "Fitness Koçu" },
            "diyetisyen": { emoji: "🍎", name: "Diyetisyen" },
            "veteriner": { emoji: "🐾", name: "Veteriner" },
            "grafik_tasarimci": { emoji: "🎨", name: "Grafik Tasarımcı" },
            "pazarlama_uzmani": { emoji: "📈", name: "Pazarlama Uzmanı" },
            "finans_danismani": { emoji: "💰", name: "Finans Danışmanı" },
            "emlak_danismani": { emoji: "🏠", name: "Emlak Danışmanı" },
            "gazeteci": { emoji: "📰", name: "Gazeteci" },
            "muzisyen": { emoji: "🎵", name: "Müzisyen" }
        };

        // Populate professions list in custom HTML
        const listContainer = document.getElementById('customProfessionsList');
        const listContainerMobile = document.getElementById('customProfessionsListMobile');

        let pListHtml = '';
        Object.keys(professions).forEach(key => {
            const p = professions[key];
            pListHtml += `<div class="custom-persona-opt" data-val="${key}" style="padding:6px; border-radius: var(--cc-radius); cursor:pointer; color:var(--cc-text-primary); display:flex; align-items:center; gap:6px;">${p.emoji} ${p.name}</div>`;
        });
        if (listContainer) listContainer.innerHTML = pListHtml;

        let pListMobileHtml = '';
        Object.keys(professions).forEach(key => {
            const p = professions[key];
            pListMobileHtml += `<div class="custom-persona-opt-mobile" data-val="${key}" style="padding:8px 6px; border-radius: var(--cc-radius); cursor:pointer; color:var(--cc-text-primary); display:flex; align-items:center; gap:6px;">${p.emoji} ${p.name}</div>`;
        });
        if (listContainerMobile) listContainerMobile.innerHTML = pListMobileHtml;

        // Toggle dropdown panels on button click
        const btn = document.getElementById('customPersonaDropdownBtn');
        const dropdownList = document.getElementById('customPersonaDropdownList');
        if (btn && dropdownList) {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = dropdownList.style.display === 'flex';
                closeAllCustomDropdowns();
                dropdownList.style.display = isVisible ? 'none' : 'flex';
            };
        }

        const btnMobile = document.getElementById('customPersonaDropdownBtnMobile');
        const dropdownListMobile = document.getElementById('customPersonaDropdownListMobile');
        if (btnMobile && dropdownListMobile) {
            btnMobile.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const isVisible = dropdownListMobile.style.display === 'flex';
                closeAllCustomDropdowns();
                dropdownListMobile.style.display = isVisible ? 'none' : 'flex';
            };
        }

        // Toggle professions nested panel inside dropdown on header click
        const profHeader = document.getElementById('customProfessionsHeader');
        const profPanel = document.getElementById('customProfessionsPanel');
        const profArrow = document.getElementById('customProfessionsArrow');
        if (profHeader && profPanel && profArrow) {
            profHeader.onclick = (e) => {
                e.stopPropagation();
                const isVisible = profPanel.style.display === 'flex';
                profPanel.style.display = isVisible ? 'none' : 'flex';
                profArrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(90deg)';
                if (!isVisible) {
                    document.getElementById('personaSearch').focus();
                }
            };
        }

        const profHeaderMobile = document.getElementById('customProfessionsHeaderMobile');
        const profPanelMobile = document.getElementById('customProfessionsPanelMobile');
        const profArrowMobile = document.getElementById('customProfessionsArrowMobile');
        if (profHeaderMobile && profPanelMobile && profArrowMobile) {
            profHeaderMobile.onclick = (e) => {
                e.stopPropagation();
                const isVisible = profPanelMobile.style.display === 'flex';
                profPanelMobile.style.display = isVisible ? 'none' : 'flex';
                profArrowMobile.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(90deg)';
                if (!isVisible) {
                    document.getElementById('personaSearchMobile').focus();
                }
            };
        }

        // Handle item selection
        function selectItem(val) {
            select.value = val;
            if (selectMobile) selectMobile.value = val;
            select.dispatchEvent(new Event('change'));
            closeAllCustomDropdowns();
        }

        document.addEventListener('click', (e) => {
            const targets = [
                '.custom-persona-opt',
                '.custom-persona-opt-mobile'
            ];
            targets.forEach(selector => {
                document.querySelectorAll(selector).forEach(opt => {
                    if (opt.contains(e.target) || opt === e.target) {
                        e.stopPropagation();
                        selectItem(opt.dataset.val);
                    }
                });
            });
        });

        // Scoped Search functionality
        const searchInput = document.getElementById('personaSearch');
        if (searchInput) {
            searchInput.onclick = (e) => e.stopPropagation();
            searchInput.oninput = (e) => {
                const query = e.target.value.toLowerCase().trim();
                document.querySelectorAll('#customProfessionsList .custom-persona-opt').forEach(opt => {
                    const txt = opt.textContent.toLowerCase();
                    opt.style.display = txt.includes(query) ? 'flex' : 'none';
                });
            };
        }

        const searchInputMobile = document.getElementById('personaSearchMobile');
        if (searchInputMobile) {
            searchInputMobile.onclick = (e) => e.stopPropagation();
            searchInputMobile.oninput = (e) => {
                const query = e.target.value.toLowerCase().trim();
                document.querySelectorAll('#customProfessionsListMobile .custom-persona-opt-mobile').forEach(opt => {
                    const txt = opt.textContent.toLowerCase();
                    opt.style.display = txt.includes(query) ? 'flex' : 'none';
                });
            };
        }

        // Global click to close panels
        document.addEventListener('click', (e) => {
            const container = document.getElementById('customPersonaDropdownContainer');
            const containerMobile = document.getElementById('customPersonaDropdownContainerMobile');

            // Eğer tıklanan yer dropdown butonları veya listelerinin içi DEĞİLSE kapat
            const clickedInside = (container && container.contains(e.target)) ||
                                 (containerMobile && containerMobile.contains(e.target));
            if (!clickedInside) {
                closeAllCustomDropdowns();
            }
        });

        function closeAllCustomDropdowns() {
            if (dropdownList) dropdownList.style.display = 'none';
            if (dropdownListMobile) dropdownListMobile.style.display = 'none';
        }

        // Sync visual UI with model state
        window.syncCustomPersonaUi = function() {
            const currentVal = select.value;
            let displayLabel = "🤖 Kanka";
            if (coreModes[currentVal]) {
                displayLabel = coreModes[currentVal].text;
            } else if (professions[currentVal]) {
                displayLabel = `${professions[currentVal].emoji} ${professions[currentVal].name}`;
            } else if (window.professionsList) {
                const found = window.professionsList.find(p => p.id === currentVal);
                if (found) displayLabel = `${found.emoji} ${found.name}`;
            }

            const labelEl = document.getElementById('customPersonaDropdownLabel');
            if (labelEl) labelEl.textContent = displayLabel;

            const labelElMobile = document.getElementById('customPersonaDropdownLabelMobile');
            if (labelElMobile) labelElMobile.textContent = displayLabel;

            // Update active states
            document.querySelectorAll('.custom-persona-opt').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.val === currentVal);
            });
            document.querySelectorAll('.custom-persona-opt-mobile').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.val === currentVal);
            });
        };

        // Listen for original select changes to sync visual custom UI
        select.addEventListener('change', window.syncCustomPersonaUi);
        if (selectMobile) selectMobile.addEventListener('change', window.syncCustomPersonaUi);

        // Periodically sync just in case select.value changes programmatically
        setInterval(window.syncCustomPersonaUi, 250);

        // Initial sync
        window.syncCustomPersonaUi();
    }

    function toggleSpeaker() {
        isSpeakerOn = !isSpeakerOn;
        const sBtn = document.getElementById("speakerBtn");
        if (isSpeakerOn) {
            if (sBtn) {
                sBtn.innerText = "\u{1F50A}";
                sBtn.classList.add("active");
            }
            if (document.getElementById("voiceControlsContainer")) document.getElementById("voiceControlsContainer").style.display = "inline-flex";
            else voiceSelect.style.display = "block";
            // Mobil audio unlock — konuşmacı açılınca hemen unlock
            if (!isAudioUnlocked) {
                isAudioUnlocked = true;
                try {
                    let silentUtterance = new SpeechSynthesisUtterance(" ");
                    silentUtterance.volume = 0;
                    window.speechSynthesis.speak(silentUtterance);
                    let silentAudio = new Audio();
                    silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
                    silentAudio.play().catch(e => {});
                } catch(e) {}
            }
            // Eğer synth paused kaldıysa resume et
            try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch(e) {}
        } else {
            if (sBtn) {
                sBtn.innerText = "\u{1F507}";
                sBtn.classList.remove("active");
            }
            if (document.getElementById("voiceControlsContainer")) document.getElementById("voiceControlsContainer").style.display = "none";
            else voiceSelect.style.display = "none";
            stopSpeaking();
        }
    }

    let ttsQueue = [];
    let isPlayingTTS = false;

    function getTtsUrl() {
        let savedTtsUrl = localStorage.getItem("tts_url");
        if (savedTtsUrl && savedTtsUrl.trim() !== "") {
            let url = savedTtsUrl.trim();
            if (!url.includes("/api/tts")) {
                if (url.endsWith("/")) {
                    url += "api/tts";
                } else {
                    url += "/api/tts";
                }
            }
            return url;
        }
        const ollamaIpStr = localStorage.getItem("ollama_ip");
        if (ollamaIpStr && ollamaIpStr.startsWith("http")) {
            try {
                const urlObj = new URL(ollamaIpStr);
                return `http://${urlObj.hostname}:8001/api/tts`;
            } catch(e) {}
        }
        return "http://" + window.location.hostname + ":8001/api/tts";
    }

    // Dil Koçu: hedef dil adı → BCP-47 dil kodu haritası
    const dilKocuLangMap = {
        "İngilizce":           "en-US",
        "İspanyolca":          "es-ES",
        "Almanca":             "de-DE",
        "Rusça":               "ru-RU",
        "Çince (Mandarin)":    "zh-CN",
        "Fransızca":           "fr-FR",
        "Japonca":             "ja-JP",
        "Korece":              "ko-KR",
        "Arapça":              "ar-SA",
        "İtalyanca":           "it-IT",
        "Portekizce":          "pt-BR",
        "Hollandaca":          "nl-NL",
        "İsveççe":             "sv-SE",
        "Yunanca":             "el-GR",
        "Hintçe":              "hi-IN"
    };

    // ===== SAYI → KELİME ÇEVİRİCİ (İngilizce, Almanca, İspanyolca, Fransızca) =====
    function numberToWords(n, langCode) {
        if (isNaN(n) || n < 0 || n > 999999) return n.toString();
        const lang = (langCode || 'en-US').split('-')[0];

        if (lang === 'en') {
            const ones = ['zero','one','two','three','four','five','six','seven','eight','nine',
                          'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
                          'seventeen','eighteen','nineteen'];
            const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? '-' + ones[n%10] : '');
            if (n < 1000) return ones[Math.floor(n/100)] + ' hundred' + (n%100 ? ' and ' + numberToWords(n%100, langCode) : '');
            return Math.floor(n/1000) + ' thousand' + (n%1000 ? ' ' + numberToWords(n%1000, langCode) : '');
        }
        if (lang === 'de') {
            const ones = ['null','ein','zwei','drei','vier','fünf','sechs','sieben','acht','neun',
                          'zehn','elf','zwölf','dreizehn','vierzehn','fünfzehn','sechzehn',
                          'siebzehn','achtzehn','neunzehn'];
            const tens = ['','','zwanzig','dreißig','vierzig','fünfzig','sechzig','siebzig','achtzig','neunzig'];
            if (n < 20) return ones[n];
            if (n < 100) return (n%10 ? ones[n%10] + 'und' : '') + tens[Math.floor(n/10)];
            return ones[Math.floor(n/100)] + 'hundert' + (n%100 ? numberToWords(n%100, langCode) : '');
        }
        if (lang === 'es') {
            const ones = ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                          'diez','once','doce','trece','catorce','quince','dieciséis',
                          'diecisiete','dieciocho','diecinueve'];
            const tens = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' y ' + ones[n%10] : '');
            return n.toString();
        }
        if (lang === 'fr') {
            const ones = ['zéro','un','deux','trois','quatre','cinq','six','sept','huit','neuf',
                          'dix','onze','douze','treize','quatorze','quinze','seize',
                          'dix-sept','dix-huit','dix-neuf'];
            const tens = ['','','vingt','trente','quarante','cinquante','soixante','soixante','quatre-vingt','quatre-vingt'];
            if (n < 20) return ones[n];
            if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? '-' + ones[n%10] : '');
            return n.toString();
        }
        // Diğer diller: rakamı olduğu gibi bırak, TTS motoru halleder
        return n.toString();
    }

    function convertNumbersToWords(text, langCode) {
        // Sadece tek başına duran rakamları dönüştür (IPA içindeki rakamları değil)
        return text.replace(/\b(\d{1,6})\b/g, (match, num) => {
            return numberToWords(parseInt(num), langCode);
        });
    }

    // Dil koçu modunda metinden SADECE hedef dil satırlarını çıkar
    function splitDilKocuSegments(rawText) {
        const targetLang = (typeof getDilKocuLang === 'function') ? getDilKocuLang() : 'İngilizce';
        const targetCode = dilKocuLangMap[targetLang] || 'en-US';
        const results = []; // { text, lang }

        const lines = rawText.split(/\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // "→ Türkçe: ..." → ATLA
            if (trimmed.match(/^→\s*Türkçe\s*:/i)) continue;
            // Türkçe anlamı / açıklama satırları → ATLA
            if (trimmed.match(/^(Türkçe anlamı|Örnek|Dilbilgisi|Motivasyon|Harika|Çok doğru|Neredeyse|Bu kelimeyi)/i)) continue;
            // [KELİME ÖĞRENİLDİ] etiketi → ATLA
            if (trimmed.includes('KELİME ÖĞRENİLDİ')) continue;
            // Başlık/meta satırlar → ATLA
            if (trimmed.match(/^(Hedef Dil:|DİL KOÇU MODU|Günlük Hedef:|Seviye:|===)/i)) continue;

            // "→ [Herhangi dil]: cümle" formatı — hedef dil cümlesi
            const arrowMatch = trimmed.match(/^→\s*[\p{L} ()]+:\s*(.+)$/iu);
            if (arrowMatch) {
                let sentence = arrowMatch[1];
                sentence = convertNumbersToWords(sentence, targetCode);
                results.push({ text: sentence, lang: targetCode });
                continue;
            }

            // **Kelime** bold satırı — hedef dil kelimesi
            const boldMatch = trimmed.match(/^\*{1,2}(.+?)\*{1,2}$/);
            if (boldMatch) {
                let word = boldMatch[1].replace(/\[.*?\]/g, '').trim();
                word = convertNumbersToWords(word, targetCode);
                results.push({ text: word, lang: targetCode });
                continue;
            }

            // IPA / fonetik satırı — ATLA (okunuşu parantez içinde, TTS'e uygun değil)
            if (trimmed.match(/^[*(]*(Okunuşu|IPA|fonetik)/i)) continue;
            if (trimmed.match(/\/[a-zæøɑɛɪɔʊəˈˌ]+\//)) continue; // IPA sembolleri içeren satır

            // Tablo satırı (|) → ATLA
            if (trimmed.startsWith('|')) continue;

            // Kısa Türkçe açıklamalar ("Rica ederim", "Merhaba" vb tablodan gelen) — ATLA
            // Eğer satır tamamen ASCII+Türkçe harflerden oluşuyorsa ve çok kısa değilse büyük ihtimal Türkçe
            // Basit heuristic: hedef dil İngilizce ise Türkçe karakter içeriyorsa atla
            const trChars = /[ğüşıöçzÜzİÖÇ]/;
            if (trChars.test(trimmed) && targetCode !== 'tr-TR') continue;

            // Geri kalan — büyük ihtimalle hedef dil içeriği, oku
            const cleaned = trimmed.replace(/[*_#`[\]()]/g, '').trim();
            if (cleaned.length > 1) {
                const withWords = convertNumbersToWords(cleaned, targetCode);
                results.push({ text: withWords, lang: targetCode });
            }
        }

        return results.filter(s => s.text.trim().length > 0);
    }

    function detectTtsLanguage(text) {
        const normalized = (text || "").toLowerCase()
            .replace(/https?:\/\/\S+/g, " ")
            .replace(/[^a-zçğıöşü\s']/gi, " ");
        const words = normalized.split(/\s+/).filter(Boolean);
        const trWords = new Set(["ve","veya","ile","bir","bu","su","şu","o","ben","sen","biz","siz","ne","nasil","nasıl","neden","nerede","hangi","icin","için","cok","çok","daha","de","da","mi","mı","mu","mü","merhaba","selam","tesekkur","teşekkür","lutfen","lütfen","evet","hayir","hayır","var","yok","olarak","ama","fakat","cunku","çünkü","sonuc","sonuç","ozet","özet","cevap","soru","konu","bolum","bölüm","nedir"]);
        const enWords = new Set(["the","and","or","with","a","an","this","that","i","you","we","they","what","how","why","where","which","for","very","more","is","are","am","do","does","did","hello","hi","thanks","please","yes","no","have","has","as","but"]);
        const technicalEnWords = new Set(["capacitor","capacitance","dielectric","voltage","charge","electric","field","energy","circuit","current","resistance","equation","formula","chapter","summary"]);

        let trScore = 0;
        let enScore = 0;
        if (/[çğıöşü]/i.test(normalized)) trScore += 2;

        words.forEach(word => {
            if (trWords.has(word)) trScore++;
            if (enWords.has(word)) enScore++;
            if (technicalEnWords.has(word)) enScore += 3;
            if (/(tion|ment|ing|ity|ance|ence|ous|ive|al)$/.test(word)) enScore++;
            if (/(lar|ler|dir|dır|tir|tır|mak|mek)$/.test(word)) trScore++;
        });

        return enScore > trScore ? "en-US" : "tr-TR";
    }

    function splitTtsByLanguage(text) {
        const chunks = (text || "")
            .split(/\n+/)
            .flatMap(part => part.match(/[^.!?]+[.!?]*/g) || [part])
            .map(part => part.trim())
            .filter(Boolean);
        const segments = [];

        chunks.forEach(chunk => {
            const lang = detectTtsLanguage(chunk);
            const last = segments[segments.length - 1];
            if (last && last.lang === lang) {
                last.text += " " + chunk;
            } else {
                segments.push({ text: chunk, lang });
            }
        });

        return segments;
    }

    function findVoiceByLanguage(voices, langCode) {
        const requested = (langCode || "tr-TR").toLowerCase();
        const prefix = requested.split("-")[0];
        return voices.find(v => (v.lang || "").toLowerCase() === requested) ||
               voices.find(v => (v.lang || "").toLowerCase().startsWith(prefix));
    }

    function playNextTTS() {
        if (!isSpeakerOn || ttsQueue.length === 0) {
            isPlayingTTS = false;
            return;
        }
        isPlayingTTS = true;
        // Synth paused kaldıysa (bazı mobile tarayıcılarda olur) — resume et
        try { if (synth.paused) synth.resume(); } catch(e) {}
        let text = ttsQueue.shift();
        // Kısa cümleleri birleştir: az sayıda TTS isteğiyle akıcılık artar
        while (ttsQueue.length > 0 && text.length < 60) {
            text += ' ' + ttsQueue.shift();
        }

        let cleanText = text.replace(/```[\s\S]*?```/g, " kod parçası ").replace(/`.*?`/g, "").replace(/[#*_-]/g, "");
        cleanText = cleanText.replace(/\[GENERATE_IMAGE:.*?\]/g, " Resmi hazırlıyorum. ");
        cleanText = cleanText.replace(/CinoCode/gi, "Cinokod").trim();
        if (!cleanText) { playNextTTS(); return; }

        if (!isSpeakerOn) { isPlayingTTS = false; return; }

        const currentSpeechRunId = speechRunId;
        const currentSelectedVoiceId = voiceSelect.value;

        // ===== DİL KOÇU MODU: Çok dilli TTS =====
        const isDilKocuActive = (document.getElementById('personaSelect') &&
                                  document.getElementById('personaSelect').value === 'dil_kocu');
        if (isDilKocuActive && (currentSelectedVoiceId === "male_local" || currentSelectedVoiceId.startsWith("native_"))) {
            // Metni segmentlere böl, sırayla her birini kendi diliyle oku
            const segments = splitDilKocuSegments(text);
            if (segments.length > 0) {
                speakSegments(segments, 0, currentSpeechRunId, currentSelectedVoiceId);
                return;
            }
        }

        const segments = splitTtsByLanguage(cleanText);
        if (segments.length > 0) {
            speakSegments(segments, 0, currentSpeechRunId, currentSelectedVoiceId);
            return;
        }
    }

    // Segmentleri sırayla oku (recursive)
    function speakSegments(segments, idx, expectedRunId, expectedVoiceId) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || idx >= segments.length) {
            if (isSpeakerOn && speechRunId === expectedRunId) playNextTTS();
            else isPlayingTTS = false;
            return;
        }
        const seg = segments[idx];
        const cleanSeg = seg.text.replace(/[#*_[\]()]/g, "").trim();
        if (!cleanSeg) { speakSegments(segments, idx + 1, expectedRunId, expectedVoiceId); return; }

        const onDone = () => {
            if (isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) {
                speakSegments(segments, idx + 1, expectedRunId, expectedVoiceId);
            } else {
                isPlayingTTS = false;
            }
        };

        if (expectedVoiceId === "male_local" || expectedVoiceId.startsWith("native_") || seg.lang !== "tr-TR") {
            speakWithLocalVoice(cleanSeg, expectedRunId, expectedVoiceId, seg.lang, onDone);
        } else {
            speakWithServer(cleanSeg, expectedRunId, expectedVoiceId, seg.lang, onDone);
        }
    }

    // FAZ 21 GÖREV E: TTS Hız Kontrolü (Global)
    window.fz19GetTtsSpeed = function() {
        try {
            let speed = parseFloat(localStorage.getItem('fz19_tts_speed'));
            if(isNaN(speed) || speed < 1 || speed > 3) speed = 1.0;
            return speed;
        } catch(e) { return 1.0; }
    };

    window.fz19UpdateTtsSpeed = function() {
        const slider = document.getElementById('fz19TtsSpeedSlider');
        const label = document.getElementById('fz19TtsSpeedLabel');
        if(!slider || !label) return;

        const speed = parseFloat(slider.value);
        label.innerText = speed.toFixed(1) + "x";
        try { localStorage.setItem('fz19_tts_speed', speed); } catch(e) {}

        if(window.sharedAudio && !window.sharedAudio.paused && window.sharedAudio.fz19BaseRate) {
            let finalRate = window.sharedAudio.fz19BaseRate * speed;
            finalRate = Math.min(3.5, Math.max(0.5, finalRate));
            window.sharedAudio.playbackRate = finalRate;
        }
    };

    const SERVER_TTS_VOICE_IDS = Object.freeze({
        female_gtts: 'female_gtts',
        female_edge: 'female_edge',
        female_melis: 'female_melis',
        female_zeynep: 'female_zeynep',
        male_gtts: 'male_gtts',
        male_edge_tolga: 'male_edge_tolga',
        male_emre: 'male_emre',
        male_baris: 'male_baris'
    });

    function getServerTtsVoiceId(expectedVoiceId) {
        return SERVER_TTS_VOICE_IDS[expectedVoiceId] || 'male_gtts';
    }

    function speakWithServer(cleanText, expectedRunId, expectedVoiceId, langCode = "tr-TR", onDone = null) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) {
            isPlayingTTS = false;
            return;
        }
        const vName = getServerTtsVoiceId(expectedVoiceId);

        if (!window.sharedAudio) window.sharedAudio = new Audio();
        const audio = window.sharedAudio;
        window.currentAudio = audio;

        // Karakter pitch/rate ayarı sunucuda uygulanır. İstemci yalnız kullanıcı hızını uygular.
        audio.fz19BaseRate = 1.0;
        let finalRate = window.fz19GetTtsSpeed();
        finalRate = Math.min(3.5, Math.max(0.5, finalRate));

        audio.defaultPlaybackRate = finalRate;
        audio.playbackRate = finalRate;

        audio.onplay = () => {
            const liveRate = Math.min(3.5, Math.max(0.5, (audio.fz19BaseRate || 1) * window.fz19GetTtsSpeed()));
            audio.playbackRate = liveRate;
            setTtsRouteMeta("server_character_voice", expectedVoiceId, { name: vName, lang: langCode }, "");
        };

        let fallbackStarted = false;
        const fallbackToLocalOnce = (reason, error) => {
            if (fallbackStarted) return;
            fallbackStarted = true;
            console.warn(`TTS fallback tetiklendi: ${reason}`, error);
            showNonBlockingToast("Sunucuya ulaşılamadı, tarayıcı sesine geçildi.", "warning");

            audio.onended = null;
            audio.onerror = null;
            audio.onplay = null;
            try { audio.pause(); } catch(e){}
            audio.currentTime = 0;

            if (isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) {
                speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId, langCode, onDone);
            }
        };

        audio.onended = () => {
            if (onDone) onDone();
            else if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS();
            else isPlayingTTS = false;
        };

        audio.onerror = (err) => {
            fallbackToLocalOnce("Sunucu hatası (onerror)", err);
        };

        fetch(getTtsUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, voice: vName, lang: langCode })
        }).then(response => {
            if (!response.ok) throw new Error(`TTS sunucusu ${response.status} döndürdü.`);
            return response.blob();
        }).then(blob => {
            if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) return;
            if (!blob || !String(blob.type || '').startsWith('audio/')) throw new Error('Geçersiz TTS ses yanıtı.');
            if (window.currentTtsObjectUrl) URL.revokeObjectURL(window.currentTtsObjectUrl);
            window.currentTtsObjectUrl = URL.createObjectURL(blob);
            audio.src = window.currentTtsObjectUrl;
            return audio.play();
        }).catch(e => {
            fallbackToLocalOnce("Sunucu isteği veya oynatma başarısız", e);
        });
    }


    function quickSyncVoiceReadEmojis(checked) {
        localStorage.setItem('cinocode_tts_read_emojis', checked ? '1' : '0');
    }
    function isTtsReadEmojisEnabled() {
        const stored = localStorage.getItem('cinocode_tts_read_emojis');
        return stored == null ? true : stored === '1';
    }

    function isTtsVoiceLockEnabled() {
        const stored = localStorage.getItem('cinocode_tts_voice_lock_enabled');
        return stored == null ? true : stored === '1';
    }

    // Mobil cihazlarda ses adları masaüstünden çok farklı olabiliyor (ör. "Tolga" yerine
    // sadece "Turkish" gibi jenerik bir isim). Dar bir anahtar kelime listesi eşleşmeyi
    // kaçırıp yanlışlıkla kadın sesli bir fallback seçtiriyordu — listeyi genişlettik.
    const MALE_VOICE_KEYWORDS = ["cem", "erkek", "male", "tolga", "cüneyt", "cuneyt", "ahmet", "mehmet", "kerem", "burak", "mustafa", "david", "mark", "daniel", "fred", "george", "man"];
    const FEMALE_VOICE_KEYWORDS = ["emel", "yelda", "siri", "female", "kadın", "kadin", "ayşe", "ayse", "cino", "zira", "samantha", "victoria", "karen", "sara", "elif", "susan", "woman", "kız", "kiz"];

    function resolveTtsVoiceForSegment(voices, expectedVoiceId, langCode) {
        const requestedLang = (langCode || "tr-TR").toLowerCase();
        const trVoices = voices.filter(v => (v.lang || "").toLowerCase().includes("tr"));
        const detectedVoice = findVoiceByLanguage(voices, langCode);
        // Not: "female"/"woman" kelimeleri "male"/"man" alt string'ini içerir (fe+male, wo+man).
        // Bu yüzden önce kadın eşleşmesini eleyip SONRA erkek anahtar kelimesi arıyoruz — aksi halde
        // "Turkish Female" gibi bir ses yanlışlıkla erkek eşleşmesi sayılır.
        const isFemaleNamed = (v) => FEMALE_VOICE_KEYWORDS.some(k => (v.name || "").toLowerCase().includes(k));
        const isMaleNamed = (v) => !isFemaleNamed(v) && MALE_VOICE_KEYWORDS.some(k => (v.name || "").toLowerCase().includes(k));
        const findFemaleVoice = () => trVoices.find(isFemaleNamed);
        const findMaleVoice = () => trVoices.find(isMaleNamed);
        let selectedVoice = null;
        // Seçilen sesin cinsiyetinden emin miyiz? Değilsek speakWithLocalVoice telafi edici
        // (daha güçlü) bir pitch düzeltmesi uygulayacak.
        let genderMatchConfident = false;

        if (expectedVoiceId && expectedVoiceId.startsWith("native_")) {
            if (expectedVoiceId.startsWith("native_uri_")) {
                const uri = decodeURIComponent(expectedVoiceId.substring(11));
                selectedVoice = voices.find(v => v.voiceURI === uri || v.name === uri);
            } else {
                const idx = parseInt(expectedVoiceId.split("_")[1], 10);
                if (!isNaN(idx) && voices[idx]) selectedVoice = voices[idx];
            }
            genderMatchConfident = true; // kullanıcı bu cihaz sesini bilinçli seçti
        } else if (expectedVoiceId === "female_gtts" || expectedVoiceId === "female_edge" || expectedVoiceId === "female_melis" || expectedVoiceId === "female_zeynep") {
            selectedVoice = findFemaleVoice();
            genderMatchConfident = !!selectedVoice;
            if (!selectedVoice) selectedVoice = trVoices.find(v => !isMaleNamed(v)) || null;
        } else if (expectedVoiceId === "male_gtts" || expectedVoiceId === "male_edge_tolga" || expectedVoiceId === "male_emre" || expectedVoiceId === "male_baris") {
            selectedVoice = findMaleVoice();
            genderMatchConfident = !!selectedVoice;
            if (!selectedVoice) selectedVoice = trVoices.find(v => !isFemaleNamed(v)) || null;
        } else if (expectedVoiceId === "male_local") {
            selectedVoice = trVoices.length > 2 ? trVoices[2] : trVoices[0];
        }

        if (isTtsVoiceLockEnabled() && selectedVoice) {
            return { voice: selectedVoice, genderMatchConfident, fallbackReason: requestedLang !== (selectedVoice.lang || "").toLowerCase() ? "Ses sabit kalsın açık; seçili ses segment dili değişse de korundu." : "" };
        }
        if (requestedLang !== "tr-tr" && detectedVoice) return { voice: detectedVoice, genderMatchConfident: false, fallbackReason: "Ses sabit kalsın kapalı veya seçili ses yok; segment diline uygun yerel ses kullanıldı." };
        if (selectedVoice) return { voice: selectedVoice, genderMatchConfident, fallbackReason: "" };
        if (trVoices.length > 0) return { voice: trVoices[0], genderMatchConfident: false, fallbackReason: "Seçili karakter sesi bulunamadı; Türkçe yerel fallback kullanıldı." };
        if (voices.length > 0) return { voice: voices[0], genderMatchConfident: false, fallbackReason: "Türkçe ses bulunamadı; cihazın varsayılan Web Speech sesi kullanıldı." };
        return { voice: null, genderMatchConfident: false, fallbackReason: "Yerel Web Speech voice listesi boş; tarayıcı varsayılanı kullanılacak." };
    }

    function setTtsRouteMeta(engine, expectedVoiceId, voice, fallbackReason = "") {
        window.lastTtsRoute = {
            engine,
            selectedVoiceId: expectedVoiceId,
            resolvedVoiceName: voice && voice.name ? voice.name : "device-default",
            resolvedVoiceLang: voice && voice.lang ? voice.lang : "",
            fallbackReason,
            isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")
        };
    }

    function speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId, langCode = "tr-TR", onDone = null, voiceRetriesLeft = 5) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) {
            isPlayingTTS = false;
            return;
        }
        let voices = synth.getVoices();
        if (voices.length === 0 && voiceRetriesLeft > 0) {
            // Mobil Chrome/Safari'de ses listesi async ve geç doluyor; kısa süre bekleyip tekrar dene
            // (yoksa boş listeyle cihazın "varsayılan" sesine düşülüp pitch ayarı yanlış sese uygulanıyordu).
            setTimeout(() => speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId, langCode, onDone, voiceRetriesLeft - 1), 150);
            return;
        }
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = langCode;
        // Not: Yerel TTS motoru (SpeechSynthesis) çalma esnasında canlı hız
        // değişimini desteklemez (pause/resume yapsan bile cümleyi baştan okumaz),
        // ancak slider'dan ayarlanan hız YENİ başlayan her cümle için Web Speech API'ye uygulanacaktır.
        const resolvedVoice = resolveTtsVoiceForSegment(voices, expectedVoiceId, langCode);
        let fallbackReason = resolvedVoice.fallbackReason || "";
        if (resolvedVoice.voice) utterance.voice = resolvedVoice.voice;
        // Seçilen ses cinsiyetinden emin değilsek (mobilde isim eşleşmesi başarısız olduysa),
        // erkek sesler için pitch'i belirgin şekilde daha da düşürerek telafi et — aksi halde
        // yanlışlıkla seçilen kadın sesli fallback üstünde hafif bir pitch düşüşü yetersiz kalıyor.
        const genderConfident = resolvedVoice.genderMatchConfident;

        {
            // Tek Türkçe cihaz sesi olsa bile 8 isimli sesi kulakla ayırt edilebilir
            // kılmak için her birine BELİRGİN ve ÇAKIŞMAYAN pitch+rate kombinasyonu ver.
            // (Önceden female_zeynep == female_gtts ve male_baris ~ male_gtts idi.)
            if (expectedVoiceId === "female_gtts") {          // Ayşe Abla — nötr kadın
                utterance.pitch = 1.05;
                utterance.rate = 0.95;
            } else if (expectedVoiceId === "female_edge") {   // Cino Abla — tiz/parlak
                utterance.pitch = 1.35;
                utterance.rate = 1.05;
            } else if (expectedVoiceId === "female_melis") {  // Melis — enerjik/hızlı
                utterance.pitch = 1.5;
                utterance.rate = 1.2;
            } else if (expectedVoiceId === "female_zeynep") { // Zeynep — sakin/yavaş, orta-tiz
                utterance.pitch = 1.2;
                utterance.rate = 0.8;
            } else if (expectedVoiceId === "male_gtts") {     // Cüneyt Abi — bas/derin
                utterance.pitch = genderConfident ? 0.6 : 0.45;
                utterance.rate = 0.85;
            } else if (expectedVoiceId === "male_edge_tolga") { // Tolga — standart erkek
                utterance.pitch = genderConfident ? 1.0 : 0.75;
                utterance.rate = 1.0;
            } else if (expectedVoiceId === "male_emre") {     // Emre — enerjik/hızlı erkek
                utterance.pitch = genderConfident ? 0.9 : 0.68;
                utterance.rate = 1.2;
            } else if (expectedVoiceId === "male_baris") {    // Barış — sakin/yavaş, orta-bas
                utterance.pitch = genderConfident ? 0.78 : 0.58;
                utterance.rate = 0.9;
            } else if (expectedVoiceId === "male_local") {
                utterance.pitch = 1.0;
                utterance.rate = 1.0;
            }
        }

        // Kullanıcının ayarladığı dinamik hızı Web Speech API'ye (yerel ses) uygula
        try {
            const userSpeed = parseFloat(localStorage.getItem('fz19_tts_speed')) || 1.0;
            utterance.rate = Math.min(3.5, Math.max(0.5, utterance.rate * userSpeed));
        } catch(e) {}
        setTtsRouteMeta("web_speech_api", expectedVoiceId, utterance.voice, fallbackReason);

        utterance.onend = () => {
            if (onDone) onDone();
            else if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS();
            else isPlayingTTS = false;
        };
        utterance.onerror = () => {
            if (onDone) onDone();
            else if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS();
            else isPlayingTTS = false;
        };

        window.currentUtterance = utterance;
        synth.speak(utterance);
    }

    function speakText(text) {
        if (!isSpeakerOn) return;
        if (!isTtsReadEmojisEnabled()) {
            text = text.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
        }

        // Synth paused ise resume et (mobil sorun)
        try { if (synth.paused) synth.resume(); } catch(e) {}
        ttsQueue.push(text);
        if (!isPlayingTTS) {
            isPlayingTTS = true; // FIX: Race condition önleme - anında kilitle
            playNextTTS();
        }
    }

    // Tüm ses kaynaklarını anında sustur
    function stopAllAudio() {
        synth.cancel();
        if(window.currentAudio) {
            try {
                window.currentAudio.pause();
                window.currentAudio.currentTime = 0;
                window.currentAudio.src = "";
            } catch(e) {}
            window.currentAudio = null;
        }
        if (window.currentTtsObjectUrl) {
            try { URL.revokeObjectURL(window.currentTtsObjectUrl); } catch(e) {}
            window.currentTtsObjectUrl = null;
        }
    }

    function stopSpeaking() {
        speechRunId++; // Her yeni konuşma başlatma veya durdurma isteğinde run ID artırılarak eski async istekler kilitlenir
        ttsQueue = [];
        isPlayingTTS = false;
        stopAllAudio();
    }

    // ----- DİĞER FONKSİYONLAR -----
    const renderer = new marked.Renderer();
    renderer.code = function(codeOrToken, maybeLang) {
        const code = String(typeof codeOrToken === 'string' ? codeOrToken : codeOrToken.text || '');
        const rawLanguage = typeof codeOrToken === 'string' ? maybeLang : codeOrToken.lang;
        const language = String(rawLanguage || '').trim().split(/\s+/)[0].replace(/[^a-z0-9_+-]/gi, '').slice(0, 40);

        let highlighted = escapeHtmlText(code);
        if(language && window.hljs && window.hljs.getLanguage(language)) {
            highlighted = window.hljs.highlight(code, { language }).value;
        }

        let runBtn = "";
        let toggleBtn = `<button class="fz19-code-toggle-btn" onclick="this.closest('.code-wrapper').classList.toggle('fz19-expanded'); this.innerText = this.closest('.code-wrapper').classList.contains('fz19-expanded') ? 'Kodu Gizle ⌃' : 'Kodu Göster ⌄'">Kodu Göster ⌄</button>`;
        let topBarContent = toggleBtn;

        if (language === 'html' || language === 'javascript' || language === 'css') {
            let fullHtml = code;
            if (language === 'javascript') fullHtml = `<script>${code}<\\/script>`;
            if (language === 'css') fullHtml = `<style>${code}</style>`;

            // URL-encode single quotes to prevent breaking the onclick attribute
            const encodedCode = encodeURIComponent(fullHtml).replace(/'/g, "%27");
            topBarContent = toggleBtn + `<button class="run-code-btn" onclick="openArtifactOverlay('${encodedCode}')" style="margin-bottom: 0;">▶️ Kodu Çalıştır / Önizle</button>`;
            // Hack to only add to sidebar once per render
            if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
            if(!window.artifactRenderedSet.has(encodedCode)) {
                window.artifactRenderedSet.add(encodedCode);
                setTimeout(() => addArtifactToList('code', 'Oluşturulan Kod', encodedCode), 100);
            }
        }
        const trustedCodeBlock = `<div class="code-wrapper" style="position:relative;"><div class="fz19-sticky-code-bar" style="display:flex; justify-content:flex-end; gap:8px; align-items:center;">${topBarContent}</div><pre class="fz19-code-body"><code class="hljs ${language}">${highlighted}</code></pre></div>`;
        return registerTrustedRenderFragment(trustedCodeBlock);
    };
    marked.setOptions({ renderer: renderer, breaks: true });


    // ----- KÜTÜPHANE (LIBRARY) SİSTEMİ -----
    // FAZ 20: Kütüphane kotalarını her tür (type) için 50'yle sınırla (resimlerin kodlarla ezilmesini önler)
    function fz19EnforcePerTypeQuota(library) {
        const counts = {};
        return library.filter(item => {
            const t = item.type;
            counts[t] = (counts[t] || 0) + 1;
            return counts[t] <= 50;
        });
    }

    function saveToLibrary(type, title, encodedContent) {
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}

        // KOPYA KONTROLÜ (DUPLICATE CHECK)
        // Aynı içerik zaten varsa ekleme.
        const isDuplicate = library.some(item => item.type === type && item.content === encodedContent);
        if (isDuplicate) return;

        library.unshift({
            id: Date.now().toString() + Math.floor(Math.random()*10000),
            type: type,
            title: title,
            content: encodedContent,
            date: new Date().toISOString()
        });
        library = fz19EnforcePerTypeQuota(library); // Kota koruması
        try { localStorage.setItem('cinocode_library', JSON.stringify(library)); } catch(e) { console.error("Kütüphane kayıt hatası."); }
    }

    function deleteFromLibrary(id) {
        if(!confirm("Bu öğeyi kütüphaneden silmek istediğinize emin misiniz?")) return;
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}
        library = library.filter(i => i.id !== id);
        localStorage.setItem('cinocode_library', JSON.stringify(library));
        renderLibrary(currentLibraryTab);
    }

    function addArtifactToList(type, title, encodedContent, prompt = null) {
        const libraryItem = {
            id: Date.now().toString() + Math.floor(Math.random()*10000),
            type: type,
            title: title,
            content: encodedContent,
            date: new Date().toISOString()
        };
        if (prompt) {
            libraryItem.prompt = prompt;
        }

        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}
        library.unshift(libraryItem);
        library = fz19EnforcePerTypeQuota(library);
        try { localStorage.setItem('cinocode_library', JSON.stringify(library)); } catch(e) { console.error("Kütüphane kayıt hatası."); }

        const libScreen = document.getElementById('libraryScreen');
        if(libScreen && libScreen.style.display === 'flex') renderLibrary(currentLibraryTab);
    }

    function downloadVideo(blobUrl, filename) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    let currentLibraryTab = 'image';
    function openLibrary(tab) {
        currentLibraryTab = tab;
        document.getElementById('messages').style.display = 'none';
        document.getElementById('welcomeScreen').style.display = 'none';
        const sc = document.getElementById("suggestionChipsContainer");
        if(sc) sc.style.display = "none";

        const titleEl = document.getElementById('libraryTitle');
        if(tab === 'image') titleEl.innerHTML = "🖼️ Resim Arşivi";
        else if(tab === 'video') titleEl.innerHTML = "🎥 Video Arşivi";
        else if(tab === 'game') titleEl.innerHTML = "💻 Kod & Oyun Arşivi";
        else titleEl.innerHTML = "📄 Belgeler";

        document.querySelectorAll('.lib-sidebar-btn').forEach(b => b.classList.remove('active-lib'));
        if(tab === 'image') document.getElementById('libNavImage').classList.add('active-lib');
        if(tab === 'video') document.getElementById('libNavVideo').classList.add('active-lib');
        if(tab === 'doc') document.getElementById('libNavDoc').classList.add('active-lib');
        if(tab === 'game') document.getElementById('libNavGame').classList.add('active-lib');

        document.getElementById('libraryScreen').style.display = 'flex';
        renderLibrary(tab);
    }

    function closeLibrary() {
        document.getElementById('libraryScreen').style.display = 'none';
        document.querySelectorAll('.lib-sidebar-btn').forEach(b => b.classList.remove('active-lib'));
        renderCurrentChat();
    }

    function formatDateHeader(isoStr) {
        const d = new Date(isoStr);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        if(d.toDateString() === today.toDateString()) return "Bugün";
        if(d.toDateString() === yesterday.toDateString()) return "Dün";
        return d.toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' });
    }

    // FAZ 20 D1: HTML Kaçış (Escape) fonksiyonu ve Kütüphane Event Delegation
    function fz19EscapeHtml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    document.addEventListener('click', function(e) {
        if(e.target && e.target.classList.contains('fz19-open-artifact-btn')) {
            const libId = e.target.getAttribute('data-lib-id');
            if(libId) {
                let library = [];
                try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(err) {}
                const item = library.find(x => x.id === libId);
                if(item && item.content) {
                    openArtifactOverlay(item.content);
                }
            }
        }
    });

    // FAZ 20 D3: Yeniden adlandırma işlemi
    window.fz19RenameLibraryItem = function(id) {
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(err) {}
        const itemIndex = library.findIndex(x => x.id === id);
        if(itemIndex > -1) {
            const currentName = library[itemIndex].title;
            const newName = prompt("Yeni isim girin:", currentName);
            if(newName !== null && newName.trim() !== "") {
                library[itemIndex].title = newName.trim();
                try { localStorage.setItem('cinocode_library', JSON.stringify(library)); } catch(e) {}
                renderLibrary(currentLibraryTab);
            }
        }
    };

    function renderLibrary(tab) {
        const content = document.getElementById('libraryContent');
        const searchTerm = document.getElementById('librarySearch').value.toLowerCase();
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}

        let filtered = library.filter(item => {
            if (tab === 'game') return item.type === 'code';
            return item.type === tab;
        });
        if (searchTerm) {
            filtered = filtered.filter(item => item.title.toLowerCase().includes(searchTerm) || formatDateHeader(item.date).toLowerCase().includes(searchTerm));
        }

        if(filtered.length === 0) {
            content.innerHTML = `<div class="library-empty-state">Bu kategoride henüz bir içerik yok veya aramanla eşleşmedi.</div>`;
            return;
        }

        let html = '';
        let currentHeader = '';

        const sortVal = document.getElementById('fz19LibrarySort') ? document.getElementById('fz19LibrarySort').value : 'newest';
        let displayList = [...filtered];
        if (sortVal === 'oldest') {
            displayList.sort((a,b) => new Date(a.date) - new Date(b.date));
        } else if (sortVal === 'az') {
            displayList.sort((a,b) => (a.title || '').localeCompare(b.title || '', 'tr'));
        } else if (sortVal === 'size') {
            displayList.sort((a,b) => (b.content ? b.content.length : 0) - (a.content ? a.content.length : 0));
        }

        displayList.forEach(item => {
            const dateHeader = formatDateHeader(item.date);
            if((sortVal === 'newest' || sortVal === 'oldest') && dateHeader !== currentHeader) {
                html += `<div style="grid-column: 1 / -1; margin-top:10px; font-weight:bold; color:var(--cc-accent-brand); border-bottom:1px solid var(--cc-border); padding-bottom:5px;">📅 ${dateHeader}</div>`;
                currentHeader = dateHeader;
            }

            let icon = item.type === 'image' ? 'Görsel' : (item.type === 'video' ? 'Video' : (item.type === 'code' ? 'Kod' : 'Dosya'));

            // D1: Inline injection yerine data attribute
            let action = item.type === 'image' ? `downloadImage('${item.content}', 'CinoCode_Gorsel.jpg')` : '';
            let btnText = item.type === 'image' ? 'İndir' : (item.type === 'video' ? 'İndir' : (item.type === 'code' ? 'Çalıştır' : 'Önizle'));
            let dataAction = '';
            let dataUrl = '';
            let extraClass = '';
            let dataLibId = '';

            if (item.type === 'video') {
                dataAction = 'data-video-action="download"';
                dataUrl = `data-video-url="${item.content}"`;
                action = ''; // Video için onclick kullanma, event delegation kullan
            } else if (item.type !== 'image') {
                extraClass = 'fz19-open-artifact-btn';
                dataLibId = `data-lib-id="${item.id}"`;
            }

            let previewHtml = '';
            if(item.type === 'image') {
                previewHtml = `<img src="${item.content}" style="width:100%; height:140px; object-fit:cover; border-radius: var(--cc-radius); margin-bottom:10px; border: 1px solid rgba(255, 255, 255, 0.08);">`;
            } else if (item.type === 'video') {
                previewHtml = `<video src="${item.content}" style="width:100%; height:140px; object-fit:cover; border-radius: var(--cc-radius); margin-bottom:10px; background:var(--cc-bg-main); border: 1px solid rgba(255, 255, 255, 0.08);" controls></video>`;
            } else if (item.type === 'code') {
                previewHtml = `<div style="width:100%; height:140px; background:var(--cc-bg-main); border-radius: var(--cc-radius); margin-bottom:10px; border:1px solid #f9e2af; display:flex; align-items:center; justify-content:center; font-size:40px;">💻</div>`;
            } else {
                previewHtml = `<div style="width:100%; height:140px; background:var(--cc-bg-main); border-radius: var(--cc-radius); margin-bottom:10px; border: 1px solid rgba(255, 255, 255, 0.08); display:flex; align-items:center; justify-content:center; font-size:40px;">📄</div>`;
            }

            let extraButtons = '';
            if(item.type === 'video' && item.prompt) {
                let escapedPrompt = fz19EscapeHtml(item.prompt);
                extraButtons = `
                    <button class="artifact-dl-btn" style="background:#cba6f7; color:var(--cc-bg-main); padding:8px; border-radius: var(--cc-radius); font-size:11px;" data-video-action="regenerate" data-video-prompt="${escapedPrompt}" data-video-container="archive-${item.id}" title="Yeniden Oluştur">🔄</button>
                    <button class="artifact-dl-btn" style="background:var(--cc-accent-brand); color:var(--cc-bg-main); padding:8px; border-radius: var(--cc-radius); font-size:11px;" data-video-action="edit" data-video-prompt="${escapedPrompt}" title="Düzenle">✏️</button>
                `;
            }

            let escapedTitle = fz19EscapeHtml(item.title);

            // D2: Tarih gösterimi
            let cardDateStr = "";
            if (item.date) {
                const d = new Date(item.date);
                if (!isNaN(d)) {
                    cardDateStr = d.toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' }) + ", " + d.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
                }
            }

            let renameBtn = `<button class="artifact-dl-btn" style="background:#89dceb; color:var(--cc-bg-main); padding:8px; border-radius: var(--cc-radius);" onclick="fz19RenameLibraryItem('${item.id}')" title="Yeniden Adlandır">✏️</button>`;

            html += `
                <div class="artifact-card archive-card" style="position:relative; display:flex; flex-direction:column;">
                    ${previewHtml}
                    <div class="artifact-card-title" style="font-size:13px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${icon} <span title="${escapedTitle}">${escapedTitle}</span></div>
                    ${cardDateStr ? `<div style="font-size:11px; color:#6c7086; margin-bottom:10px;">${cardDateStr}</div>` : '<div style="margin-bottom:10px;"></div>'}
                    <div style="display:flex; gap:5px; margin-top:auto; flex-wrap:wrap;">
                        <button class="artifact-dl-btn ${extraClass}" style="flex:1; text-align:center; padding:8px; font-weight:bold;" ${dataAction} ${dataUrl} ${dataLibId} ${action ? `onclick="${action}"` : ''}>${btnText}</button>
                        ${extraButtons}
                        ${renameBtn}
                        <button class="artifact-dl-btn" style="background:#f38ba8; color:var(--cc-bg-main); padding:8px; border-radius: var(--cc-radius);" onclick="deleteFromLibrary('${item.id}')" title="Sil">🗑️</button>
                    </div>
                </div>
            `;
        });
        content.innerHTML = html;
    }

    function openArtifactOverlay(encodedHtml) {
        document.getElementById("artifactOverlay").style.display = "flex";
        const iframe = document.getElementById("artifactIframe");
        iframe.srcdoc = decodeURIComponent(encodedHtml);
        setTimeout(() => { iframe.focus(); }, 100);
    }
    function closeArtifactOverlay() {
        document.getElementById("artifactOverlay").style.display = "none";
        document.getElementById("artifactIframe").srcdoc = "";
    }

    let isWebSearchEnabled = false;
    function updateWebSearchVisualState() {
        const btn = document.getElementById("webSearchBtn");
        const menuText = document.getElementById("menuWebSearchText");
        const menuIcon = document.getElementById("menuWebSearchIcon");
        const menuBadge = document.getElementById("menuWebSearchBadge");
        if (btn) btn.classList.toggle("active", isWebSearchEnabled);
        if (userInput) userInput.placeholder = isWebSearchEnabled ? "🔍 Web destekli sorun..." : "CinoCode'a bir şeyler sor...";
        if (menuText) menuText.textContent = "Web destekli sohbet";
        if (menuIcon) menuIcon.textContent = "🔍";
        if (menuBadge) {
            menuBadge.textContent = isWebSearchEnabled ? "Açık" : "Kapalı";
            menuBadge.style.color = isWebSearchEnabled ? "#a6e3a1" : "#f9e2af";
        }
    }

    function toggleWebSearch() {
        if (!isFeatureEnabled('liveSearch')) {
            setFeatureValue('liveSearch', '1');
            applyFeatureUiState();
        }
        isWebSearchEnabled = !isWebSearchEnabled;
        updateWebSearchVisualState();
        showNonBlockingToast(isWebSearchEnabled ? 'Web destekli sohbet açıldı.' : 'Web destekli sohbet kapatıldı.');
    }

    function toggleWebSearchInMenu() {
        closeAttachMenu();
        toggleWebSearch();
    }

    async function doWebSearch(query) {
        if (!isWebSearchEnabled || !isFeatureEnabled('liveSearch')) return "";
        try {
            const response = await fetch('/.netlify/functions/web-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: String(query || '').slice(0, 500) })
            });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.results)) return "";
            const useful = data.results
                .filter(item => item && item.title && item.snippet && item.title !== 'Uyarı')
                .slice(0, 4);
            if (!useful.length) return "";
            return useful.map((item, index) => {
                const source = getSafeExternalHttpUrl(item.url || "");
                return `${index + 1}. ${item.title}: ${item.snippet}${source ? ` (Kaynak: ${source})` : ""}`;
            }).join("\n");
        } catch(e) {
            console.warn("Web arama hatası", e);
            return "";
        }
    }

    // ===== FAZ 19 — UI KİŞİSELLEŞTİRME (v1: temiz-ID'li 7 özellik) =====
    const FZ19_UI_PREFS_KEY = "ui_prefs";
    const FZ19_FEATURE_MAP = {
        styleMode:      "styleModeSelect",
        personaSelect:  "customPersonaDropdownContainer",
        voiceSelect:    "voiceControlsContainer",
        microphone:     "micBtn",
        ttsButton:      "speakerBtn",
        historySidebar: "sidebar",
        profileButton:  "userProfile"
    };
    const FZ19_THEME_PRESETS = {
        sade:    { styleMode:false, personaSelect:false, voiceSelect:false, microphone:false, ttsButton:false, historySidebar:false, profileButton:false },
        dengeli: { styleMode:false, personaSelect:true,  voiceSelect:false, microphone:true,  ttsButton:true,  historySidebar:false, profileButton:false },
        tam:     { styleMode:true,  personaSelect:true,  voiceSelect:true,  microphone:true,  ttsButton:true,  historySidebar:true,  profileButton:true }
    };
    function fz19DefaultUiPrefs() {
        return { version: 2, theme: "tam", visibility: { ...FZ19_THEME_PRESETS.tam }, lastUpdated: "" };
    }
    function fz19LoadUiPrefs() {
        try {
            const raw = localStorage.getItem(FZ19_UI_PREFS_KEY);
            if (!raw) return fz19DefaultUiPrefs();
            const parsed = JSON.parse(raw) || {};
            const vis = parsed.visibility || {};
            const visibility = {};
            Object.keys(FZ19_FEATURE_MAP).forEach(k => {
                visibility[k] = (typeof vis[k] === "boolean") ? vis[k] : true; // eksikse görünür
            });
            if ((Number(parsed.version) || 1) < 2 && !parsed.lastUpdated && parsed.theme === "dengeli") {
                return fz19DefaultUiPrefs();
            }
            return { version: 2, theme: parsed.theme || "tam", visibility, lastUpdated: parsed.lastUpdated || "" };
        } catch (e) {
            return fz19DefaultUiPrefs();
        }
    }
    function fz19SaveUiPrefs(prefs) {
        try {
            const clean = fz19LoadUiPrefs();
            if (prefs && prefs.theme) clean.theme = prefs.theme;
            if (prefs && prefs.visibility) {
                Object.keys(FZ19_FEATURE_MAP).forEach(k => {
                    if (typeof prefs.visibility[k] === "boolean") clean.visibility[k] = prefs.visibility[k];
                });
            }
            clean.lastUpdated = new Date().toISOString();
            localStorage.setItem(FZ19_UI_PREFS_KEY, JSON.stringify(clean));
            return clean;
        } catch (e) { return prefs; }
    }
    function fz19ApplyUiPrefs() {
        try {
            const prefs = fz19LoadUiPrefs();
            Object.keys(FZ19_FEATURE_MAP).forEach(k => {
                const el = document.getElementById(FZ19_FEATURE_MAP[k]);
                if (!el) return;
                if (prefs.visibility[k] === false) el.classList.add("fz19-hidden");
                else el.classList.remove("fz19-hidden");
            });
        } catch (e) { console.warn("fz19ApplyUiPrefs error:", e); }
    }

    // ===== FAZ 22: ÖZEL RENK KALICILIĞI =====
    const FZ22_COLOR_PREFS_KEY = 'fz22_color_prefs';
    function fz22LoadColorPrefs() {
        try {
            const raw = localStorage.getItem(FZ22_COLOR_PREFS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) { return {}; }
    }
    function fz22SaveColorPref(targetKey, color) {
        if (!targetKey || !color) return;
        try {
            const prefs = fz22LoadColorPrefs();
            prefs[targetKey] = color;
            localStorage.setItem(FZ22_COLOR_PREFS_KEY, JSON.stringify(prefs));
        } catch (e) { console.warn("fz22SaveColorPref error:", e); }
    }
    function fz22ApplyColorPref(targetKey, color) {
        if (!targetKey || !color) return;
        const elId = FZ19_FEATURE_MAP[targetKey];
        const el = elId ? document.getElementById(elId) : null;
        if (!el) return;
        el.style.setProperty('--fz22-accent', color);
        el.style.borderColor = color;
        el.style.boxShadow = `inset 0 0 0 1px ${color}55`;
    }
    function fz22ApplyColorPrefs() {
        try {
            const prefs = fz22LoadColorPrefs();
            Object.keys(prefs).forEach(k => fz22ApplyColorPref(k, prefs[k]));
        } catch (e) { console.warn("fz22ApplyColorPrefs error:", e); }
    }

    // ===== EVRENSEL SAĞ-TIK BAĞLAM MENÜSÜ (FAZ 22) =====
    document.addEventListener('contextmenu', function(e) {
        let el = e.target.closest('[id]');
        let matchedKey = null;
        while (el && !matchedKey) {
            matchedKey = Object.keys(FZ19_FEATURE_MAP).find(
                k => FZ19_FEATURE_MAP[k] === el.id
            );
            if (!matchedKey) el = el.parentElement ? el.parentElement.closest('[id]') : null;
        }
        if (!matchedKey) return;

        e.preventDefault();

        const menu = document.getElementById('ccContextMenu');
        if (menu) {
            menu.style.display = 'block';
            menu.setAttribute('aria-hidden', 'false');

            // Viewport boundary clamp logic
            let x = e.clientX;
            let y = e.clientY;
            const menuWidth = menu.offsetWidth || 160;
            const menuHeight = menu.offsetHeight || 40;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            if (x + menuWidth > windowWidth) {
                x = windowWidth - menuWidth - 5;
            }
            if (y + menuHeight > windowHeight) {
                y = windowHeight - menuHeight - 5;
            }

            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            menu.dataset.targetKey = matchedKey;
        }
    });

    // Event delegation for clicks (hide button action, color picks & click outside to close)
    document.addEventListener('click', function(e) {
        const menu = document.getElementById('ccContextMenu');
        if (!menu) return;

        if (e.target && e.target.classList && e.target.classList.contains('cc-color-dot') && e.target.dataset.color) {
            const targetKey = menu.dataset.targetKey;
            if (targetKey) {
                fz22SaveColorPref(targetKey, e.target.dataset.color);
                fz22ApplyColorPref(targetKey, e.target.dataset.color);
            }
            menu.style.display = 'none';
            menu.setAttribute('aria-hidden', 'true');
            return;
        }

        if (e.target && e.target.id === 'ccContextHideBtn') {
            const targetKey = menu.dataset.targetKey;
            if (targetKey) {
                const prefs = fz19LoadUiPrefs();
                if (!prefs.visibility) prefs.visibility = {};
                prefs.visibility[targetKey] = false;
                fz19SaveUiPrefs(prefs);
                fz19ApplyUiPrefs();
            }
            menu.style.display = 'none';
            menu.setAttribute('aria-hidden', 'true');
        } else if (!menu.contains(e.target)) {
            menu.style.display = 'none';
            menu.setAttribute('aria-hidden', 'true');
        }
    });

    // Custom color-picker input: live preview on 'input', persist on 'change'
    (function fz22WireColorPicker() {
        const picker = document.getElementById('ccContextColorPicker');
        if (!picker) return;
        const getTargetKey = () => {
            const menu = document.getElementById('ccContextMenu');
            return menu ? menu.dataset.targetKey : null;
        };
        picker.addEventListener('input', function() {
            const targetKey = getTargetKey();
            if (targetKey) fz22ApplyColorPref(targetKey, picker.value);
        });
        picker.addEventListener('change', function() {
            const targetKey = getTargetKey();
            if (targetKey) {
                fz22SaveColorPref(targetKey, picker.value);
                const menu = document.getElementById('ccContextMenu');
                if (menu) { menu.style.display = 'none'; menu.setAttribute('aria-hidden', 'true'); }
            }
        });
    })();

    // Close menu on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const menu = document.getElementById('ccContextMenu');
            if (menu) {
                menu.style.display = 'none';
                menu.setAttribute('aria-hidden', 'true');
            }
        }
    });

    window.addEventListener('beforeunload', (e) => {
        if (typeof isSavingDB !== 'undefined' && (isSavingDB || (typeof pendingSave !== 'undefined' && pendingSave))) {
            e.preventDefault();
            e.returnValue = "Değişiklikleriniz henüz kaydedilmedi. Lütfen bekleyin.";
            return e.returnValue;
        }
    });

    // ===== V2 MY APPS ECOSYSTEM =====
    const CINO_APPS = [
        { id: "webapp", title: "Web App Yap", icon: "🌐", category: "Code", prompt: "Arayüz, kod ve çalışır HTML akışı hazırla." },
        { id: "game", title: "Oyun Yap", icon: "🎮", category: "Game", prompt: "HTML5/Canvas oyun başlangıcı yap." },
        { id: "cinovidyo", title: "CinoVidyo", icon: "🎬", category: "Video", prompt: "Sen CinoVidyo'sun, profesyonel bir AI Video Stüdyosu yöneticisisin. Video senaryosu, kamera açıları ve promptları üret." },
        { id: "imagelab", title: "Görsel Üret", icon: "🖼️", category: "Design", prompt: "Görsel prompt ve stüdyo modu." },
        { id: "textgenerator", title: "Text Generator", icon: "💬", category: "Writing", prompt: "Sen efsanevi bir Metin Yazarısın. Makale, blog yazısı veya her türlü metin içeriğinde destek olursun." },
        { id: "pdfstudio", title: "PDF / Dosya Analiz", icon: "📄", category: "Document", prompt: "Dosya yükleme ve özet/analiz yap." },
        { id: "voice", title: "Sesli Asistan", icon: "🎙️", category: "Voice", prompt: "TTS ve mikrofon odaklı sohbet." },
        { id: "aiagents", title: "AI Agents", icon: "🤖", category: "Agents", prompt: "Sen AI Ajanlarının orkestrasyonunu yapan ana lidersin. İstenilen görevleri alt-ajanlara dağıtıp koordine edersin." }
    ];

    function openMyAppsHub() {
        closeMobileSidebar();
        const screensToHide = ['libraryScreen', 'projectsScreen', 'skillsScreen'];
        screensToHide.forEach(id => {
            const screen = document.getElementById(id);
            if (screen) screen.style.display = 'none';
        });
        const messages = document.getElementById('messages');
        const welcome = document.getElementById('welcomeScreen');
        if (messages) messages.style.display = 'none';
        if (welcome) welcome.style.display = 'flex';
        renderMyApps();
        requestAnimationFrame(() => {
            const grid = document.getElementById('myAppsGrid');
            if (!grid) return;
            grid.setAttribute('tabindex', '-1');
            grid.focus({ preventScroll: true });
            grid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    function renderMyApps() {
        const container = document.getElementById("myAppsGrid");
        if (!container) return;
        container.innerHTML = "";
        CINO_APPS.forEach(app => {
            const btn = document.createElement("button");
            btn.className = "new-project-card";
            btn.innerHTML = `<strong>${app.icon} ${app.title}</strong><span>${app.category} Uygulaması</span>`;
            btn.onclick = () => launchCinoApp(app.id);
            container.appendChild(btn);
        });
    }

    function launchCinoApp(appId) {
        const app = CINO_APPS.find(a => a.id === appId);
        if (!app) return;

        // Eski 'startNewProject' mantığına uyumluluk
        if(appId === 'webapp' || appId === 'game' || appId === 'video' || appId === 'image' || appId === 'pdf' || appId === 'voice') {
            startNewProject(appId);
            return;
        }

        // Yeni mantık
        const name = document.getElementById('newProjectName')?.value || app.title;
        setQuickStart(`${name ? name + ': ' : ''}${app.prompt}`);


    }

    window.onload = async () => {
        renderMyApps();
        fz22ApplyColorPrefs();
        if (window.CinoCodeAuth && typeof window.CinoCodeAuth.initializeAccountSession === 'function') {
            try {
                await window.CinoCodeAuth.initializeAccountSession();
            } catch (authError) {
                console.warn('Account session initialization failed', authError);
            }
            loggedUser = window.CinoCodeAuth.getStoredUserName();
        }
        if (window.location.protocol === 'file:') {
            const banner = document.createElement('div');
            banner.style = "background: #f38ba8; color: #11111b; text-align: center; padding: 10px; font-weight: bold; font-size: 13px; z-index: 9999; border-bottom: 2px solid #eba0ac;";
            banner.innerHTML = "⚠️ MİKROFON UYARISI: Uygulamayı masaüstünden (file:///) açtığınız için tarayıcınız mikrofonu engelliyor. Lütfen mikrofon için VS Code Live Server (localhost) kullanın.";
            document.body.insertBefore(banner, document.body.firstChild);
        }

        if (document.getElementById('loggedInUser')) {
            if (loggedUser && window.CinoCodeAuth && typeof window.CinoCodeAuth.rememberLocalProfile === 'function') {
                window.CinoCodeAuth.rememberLocalProfile(loggedUser);
            }
            if (!loggedUser && window.CinoCodeAuth && typeof window.CinoCodeAuth.openAccountAuthModal === 'function') {
                setTimeout(() => window.CinoCodeAuth.openAccountAuthModal(), 0);
            }

            if (loggedUser) {
                document.getElementById('loggedInUser').innerText = loggedUser;
                document.getElementById('loggedInUserWrapper').style.display = "inline";
            } else {
                document.getElementById('loggedInUserWrapper').style.display = "none";
            }
        }
        Promise.allSettled([
            (async () => {
                try {
                    await loadDatabase();
                } catch(e) {
                    console.error("Critical DB error during load", e);
                }
            })(),
            (async () => {
                setupPlaceholderImageObserver();
                scrubPlaceholderErrorImages(messagesDiv || document);
                setTimeout(() => scrubPlaceholderErrorImages(messagesDiv || document), 300);
                bindComposerDraftPreservation();
                restoreComposerDraftIfNeeded();
                repairBadChatTitles();
                checkOllamaStatus();
                setInterval(checkOllamaStatus, 5000);
                setTimeout(populateVoices, 500); // Safari/Firefox fallback

                isSidebarCollapsed = localStorage.getItem(SIDEBAR_STATE_KEY) === '1';
                applySidebarState(isSidebarCollapsed, false);
                applyFeatureUiState();
                fz19ApplyUiPrefs();
                restoreComposerDraftIfNeeded();
                loadMediaSourceSelection();
                try { renderUsageRoleUI(localStorage.getItem(USAGE_ROLE_KEY) || 'general'); } catch (e) {}
            })()
        ]).then(() => {
            console.log("[CinoCode] Tüm asenkron başlatma süreçleri tamamlandı veya bypass edildi.");
        });

        // Paste (CTRL+V) olayını dinle ve kopyalanan resimleri yakala
        document.addEventListener('paste', function(e) {
            if (e.clipboardData && e.clipboardData.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    let item = e.clipboardData.items[i];
                    if (item.type.indexOf('image') !== -1) {
                        let file = item.getAsFile();
                        if (file) {
                            const fakeEvent = { target: { files: [file] } };
                            handleImageSelect(fakeEvent);
                            e.preventDefault(); // Metin kutusuna karmaşık data yapışmasını engelle
                            return;
                        }
                    }
                }
            }
        });
        // Sayfa yüklenince kesinlikle en alta kaydır (resimler, fontlar, her şey yüklendikten sonra)
        setTimeout(scrollToBottom, 200);
        setTimeout(scrollToBottom, 600);
        setTimeout(scrollToBottom, 1200);
        setTimeout(scrollToBottom, 2500);

        // ===== DİL KOÇU + SINAV KOÇU: persona değişim dinleyicisi =====
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) {
            personaSel.addEventListener('change', function() {
                const val = this.value;
                const dilPanel = document.getElementById('dilKocuPanel');
                const sinavPanel = document.getElementById('sinavKocuPanel');
                dilPanel.classList.remove('active');
                sinavPanel.classList.remove('active');

                const welcomeGreetingTextEl = document.getElementById("welcomeGreetingText");
                if (welcomeGreetingTextEl) {
                    welcomeGreetingTextEl.textContent = getWelcomeGreetingText(val);
                }

                if (val === 'dil_kocu') {
                    dilPanel.classList.add('active');
                    // Gemini'ye otomatik geç
                    const modelSel = document.getElementById('modelSelect');
                    if (modelSel && !isProxyCloudModel(modelSel.value)) {
                        modelSel.value = 'gemini';
                    }
                    updateDilKocuPrompt();
                    updateDilKocuProgress();
                    updateDilKocuStreak();
                } else if (val === 'akademik_koc') {
                    sinavPanel.classList.add('active');
                    skpOnModeChange();
                    skpUpdateDocStatus();
                } else if (val === 'usta_yazilimci') {
                    openProfessionModal();
                }
            });
        }

        // Sayfa açılışında seçili persona panelini aç
        if (personaSel && personaSel.value === 'dil_kocu') {
            document.getElementById('dilKocuPanel').classList.add('active');
            updateDilKocuProgress();
            updateDilKocuStreak();
        } else if (personaSel && personaSel.value === 'akademik_koc') {
            document.getElementById('sinavKocuPanel').classList.add('active');
            skpOnModeChange();
        }
    };

    // ===== DİL KOÇU MODU: Global değişkenler =====
    let dilKocuQuizActive = false;
    let dilKocuLessonPrompt = "";

    function getDilKocuLang() {
        const el = document.getElementById('dk-lang');
        return el ? el.value : 'İngilizce';
    }
    function getDilKocuLevel() {
        const el = document.getElementById('dk-level');
        return el ? el.value : 'Başlangıç (A1-A2)';
    }
    function getDilKocuGoal() {
        const el = document.getElementById('dk-goal');
        const rawValue = el && el.value === 'custom'
            ? document.getElementById('dk-goal-custom')?.value
            : el?.value;
        return window.DilKocuCore
            ? window.DilKocuCore.normalizeGoal(rawValue)
            : Math.max(1, Math.min(parseInt(rawValue, 10) || 10, 500));
    }

    function updateDilKocuGoalCustom() {
        updateDilKocuProgress();
    }

    // Dil koçu injection — personas["dil_kocu"] üzerine eklenir
    function getDilKocuInjection() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const progress = getDilKocuProgressState();
        const goal = progress.goal;
        const lessonBatch = window.DilKocuCore
            ? window.DilKocuCore.getLessonBatchSize(goal, progress.remaining)
            : Math.min(progress.remaining, 10);
        const quizQuestionCount = window.DilKocuCore
            ? window.DilKocuCore.getQuizQuestionCount(goal)
            : Math.min(goal, 20, Math.max(5, Math.ceil(goal / 3)));

        const lessonNote = progress.remaining > 0
            ? `Bu öğretim yanıtında ${lessonBatch} yeni kelime/kalıp öğret. Günlük hedefin tamamını tek cevaba sıkıştırma; kalan ${progress.remaining} kelimeyi ${lessonBatch}'lik veya daha küçük gruplarla tamamla.`
            : 'Bugünkü günlük hedef tamamlandı. Yeni kelime sayacını artırmadan tekrar, konuşma pratiği veya pekiştirme sun.';
        const quizNote = dilKocuQuizActive
            ? `\n\n🎯 QUIZ MODU AKTİF: Şu anda kullanıcı quiz modunda. Daha önce öğrettiğin ${lang} kelimelerden ${quizQuestionCount} soruluk bir quiz yürüt. Soruları birer birer sor, cevapları değerlendir ve quiz bitince skoru Türkçe söyle. Quiz cevaplarında [KELİME ÖĞRENİLDİ ✅] etiketi kullanma; quiz günlük öğrenme sayacını artırmaz.`
            : '';

        return `\n\n===== DİL KOÇU MODU AKTİF =====\nHedef Dil: ${lang} | Seviye: ${level} | Günlük Hedef: ${goal} kelime | Bugün: ${progress.count}/${goal}\n\n⚠️ KRİTİK KURAL: Cevaplarına kesinlikle başka dil karıştırma! Hedef dil ${lang}, açıklamalar Türkçe. Çince, Japonca, Endonezce, Arapça vb. hiçbir dilde harf veya kelime kullanma. SADECE ${lang} + Türkçe.\n\nBu modda MUTLAKA şu formatta öğret:\n\n**[HEDEF DİLDEKİ KELİME / CÜMLE]**\n*(Okunuşu: fonetik/IPA)*\n🇹🇷 Türkçe anlamı: ...\n💡 Örnek cümle:\n  → ${lang}: [örnek cümle]\n  → Türkçe: [çevirisi]\n📚 Dilbilgisi/Mantık notu: [Türkçe açıklama]\n[KELİME ÖĞRENİLDİ ✅]\n\n- Seviye ${level} için uygun kelime ve yapılar kullan.\n- Eğer ${level} Başlangıç/A0/A1/A2 ise: selamlama, sayılar, renkler, günlük eylemler, temel kalıplar.\n- Eğer ${level} Orta/B1/B2 ise: zaman kalıpları, alışveriş/iş/seyahat diyalogları, yaygın deyimler.\n- Eğer ${level} İleri/C1/C2 ise: deyimler, atasözleri, resmi/edebi dil, nüanslar.\n- ${lessonNote}\n- Öğrettiğin HER yeni kelime veya kalıp için tam bir kez '[KELİME ÖĞRENİLDİ ✅]' etiketi ekle.\n- Açıklamaları HER ZAMAN Türkçe yap (kullanıcı o dilde konuşmanı istemediği sürece).\n- Motivasyon cümleleri kullan: 'Harika!', 'Çok doğru!', 'Neredeyse!', 'Bu kelimeyi artık unutmazsın!'${quizNote}`;
    }

    function updateDilKocuPrompt() {
        // Herhangi bir şey değiştiğinde JS tarafında da hazır olsun
        // Gerçek enjeksiyon sendMessage içinde yapılıyor
        updateDilKocuProgress();
    }

    function updateDilKocuGoal() {
        const el = document.getElementById('dk-goal');
        const customEl = document.getElementById('dk-goal-custom');
        if (el && customEl) {
            if (el.value === 'custom') {
                customEl.style.display = 'inline-block';
                customEl.focus();
            } else {
                customEl.style.display = 'none';
                customEl.value = '';
            }
        }
        updateDilKocuProgress();
    }

    function getDilKocuProgressKey() {
        const today = new Date().toISOString().slice(0, 10);
        return 'dk_progress_' + getDilKocuLang() + '_' + today;
    }

    function getDilKocuProgressState() {
        const goal = getDilKocuGoal();
        const key = getDilKocuProgressKey();
        const rawCount = Math.max(0, parseInt(localStorage.getItem(key) || '0', 10) || 0);
        const count = Math.min(rawCount, goal);
        return { key, goal, count, remaining: Math.max(0, goal - count) };
    }

    function updateDilKocuProgress() {
        const state = getDilKocuProgressState();
        const pct = Math.min((state.count / state.goal) * 100, 100);
        const bar = document.getElementById('dk-progress-bar');
        const txt = document.getElementById('dk-word-count-text');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = state.count + ' / ' + state.goal + ' kelime';
        return state;
    }

    function showDilKocuGoalCelebration(goal) {
        setTimeout(() => {
            setQuickStart('');
            const msgs = document.getElementById('messages');
            if (msgs) {
                const div = document.createElement('div');
                div.className = 'message bot';
                div.innerHTML = '<div style="background:linear-gradient(135deg,rgba(166,227,161,0.15),rgba(249,226,175,0.1));border:1px solid rgba(166,227,161,0.4);border-radius: var(--cc-radius);padding:14px;text-align:center;font-size:15px;">📖 <b>Tebrikler!</b> Bugünkü ' + goal + ' kelime hedefine ulaştın! Harika bir çalışma günüydü. Yarın da devam et! 🎉</div>';
                msgs.appendChild(div);
                msgs.scrollTop = msgs.scrollHeight;
            }
            updateDilKocuStreak();
        }, 500);
    }

    function incrementDilKocuProgress(amount = 1) {
        const state = getDilKocuProgressState();
        const result = window.DilKocuCore
            ? window.DilKocuCore.applyProgressDelta(state.count, amount, state.goal)
            : { count: Math.min(state.goal, state.count + Math.max(0, amount)), added: amount, reachedGoal: false };
        localStorage.setItem(state.key, result.count);
        updateDilKocuProgress();
        if (result.reachedGoal) showDilKocuGoalCelebration(state.goal);
        return result;
    }

    function recordDilKocuProgressFromResponse(responseText) {
        if (!isDilKocuPersonaActive() || dilKocuQuizActive) return 0;
        if (!window.DilKocuCore) return 0;

        const state = getDilKocuProgressState();
        const markerCount = window.DilKocuCore.countLearnedMarkers(responseText);
        const batchLimit = window.DilKocuCore.getLessonBatchSize(state.goal, state.remaining);
        const learnedCount = Math.min(markerCount, batchLimit);
        if (learnedCount < 1) return 0;
        return incrementDilKocuProgress(learnedCount).added;
    }

    function updateDilKocuStreak() {
        const lang = getDilKocuLang();
        const streakKey = 'dk_streak_' + lang;
        const lastKey = 'dk_last_' + lang;
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const last = localStorage.getItem(lastKey) || '';
        let streak = parseInt(localStorage.getItem(streakKey) || '0');
        if (last === yesterday) {
            streak++;
        } else if (last !== today) {
            streak = 1;
        }
        localStorage.setItem(streakKey, streak);
        localStorage.setItem(lastKey, today);
        const badge = document.getElementById('dk-streak-badge');
        if (badge) badge.textContent = '\u{1F525} Gün Serisi: ' + streak;
    }

    // "Derse Başla" butonu — bugünün dersini otomatik başlatır
    function startDilKocuLesson() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const state = getDilKocuProgressState();
        const lessonBatch = window.DilKocuCore
            ? window.DilKocuCore.getLessonBatchSize(state.goal, state.remaining)
            : Math.min(state.remaining, 10);
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) personaSel.value = 'dil_kocu';
        document.getElementById('dilKocuPanel').classList.add('active');
        setDilKocuQuizMode(false);

        const modelSel = document.getElementById('modelSelect');
        if (modelSel && !isProxyCloudModel(modelSel.value)) modelSel.value = 'gemini';
        const text = lessonBatch > 0
            ? `Bugün ${lang} dersimize başlayalım! Seviyem: ${level}. Günlük hedefim ${state.goal} kelime; bugün ${state.count} kelime tamamladım. Şimdi sıradaki ${lessonBatch} yeni kelime veya kalıbı, temel ve günlük kullanımdan başlayarak tablolar ve örneklerle eksiksiz öğret.`
            : `Bugünkü ${state.goal} kelimelik ${lang} hedefimi tamamladım. Seviyem: ${level}. Yeni kelime sayacını artırmadan kısa bir tekrar ve konuşma pratiği yaptır.`;
        setComposerValue(text, { focus: false });
        sendMessage();
    }

    // "Sohbet Modu" butonu — o dilde tamamen sohbet başlatır
    function startDilKocuConversation() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) personaSel.value = 'dil_kocu';
        document.getElementById('dilKocuPanel').classList.add('active');
        setDilKocuQuizMode(false);
        const modelSel = document.getElementById('modelSelect');
        if (modelSel && !isProxyCloudModel(modelSel.value)) modelSel.value = 'gemini';
        const text = `Hadi ${lang} sohbet edelim! Seviyem ${level}. Seninle ${lang} pratik yapmak istiyorum. Sen de ${lang} konuş, hatalarımı sonunda Türkçe düzelt.`;
        setComposerValue(text, { focus: false });
        sendMessage();
    }

    // "Quiz Başlat" butonu — quiz modunu açar/kapatır
    function setDilKocuQuizMode(active) {
        dilKocuQuizActive = Boolean(active);
        const btn = document.getElementById('dk-quiz-btn');
        if (!btn) return;
        btn.classList.toggle('active-quiz', dilKocuQuizActive);
        btn.textContent = dilKocuQuizActive ? '\u{2705} Quiz Aktif \u2713' : '\u{1F4DD} Quiz Başlat';
    }

    function startDilKocuQuiz() {
        setDilKocuQuizMode(!dilKocuQuizActive);
        if (!dilKocuQuizActive) return;

        const lang = getDilKocuLang();
        const goal = getDilKocuGoal();
        const questionCount = window.DilKocuCore
            ? window.DilKocuCore.getQuizQuestionCount(goal)
            : Math.min(goal, 20, Math.max(5, Math.ceil(goal / 3)));
        const text = `Quiz zamanı! Bugüne kadar öğrettiğin ${lang} kelimelerden ${questionCount} soruluk bir quiz yap. Soruları birer birer sor; ben cevapladıkça değerlendir ve sonra sıradaki soruya geç.`;
        setComposerValue(text, { focus: false });
        sendMessage();
    }



    function autoResize(el) {
        el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
    function handleKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
    function setQuickStart(text) { setComposerValue(text); }

    const USAGE_ROLE_KEY = 'cinocode_usage_role';
    const USAGE_ROLE_STARTERS = {
        general: { label: "Genel", icon: "✨", starters: [
            { icon: "⌨️", text: "Kod Yazdır", prompt: "Bana Python ile basit bir API yazıp açıklama yap." },
            { icon: "🖼️", text: "Görsel Stüdyosu", action: "image" },
            { icon: "🎥", text: "Video Stüdyosu", action: "video" },
            { icon: "🎮", text: "Oyun Stüdyosu", action: "game" },
            { icon: "📄", text: "Belge Özetlet", action: "doc" },
            { icon: "🤖", text: "Yapay Zeka", prompt: "Sıfırdan yapay zeka nasıl yapılır?" }
        ] },
        developer: { label: "Yazılımcı", icon: "💻", starters: [
            { icon: "🔍", text: "Kodumu İncele", prompt: "Az sonra paylaşacağım kodu incele; hataları, kötü pratikleri ve iyileştirme önerilerini listele." },
            { icon: "🐛", text: "Bu Hatayı Çöz", prompt: "Az sonra bir hata mesajı ve ilgili kodu paylaşacağım. Kök nedeni bul ve minimal bir düzeltme öner." },
            { icon: "💡", text: "Proje Fikri Ver", prompt: "Portföyüme ekleyebileceğim, orta zorlukta 3 web/uygulama proje fikri öner." },
            { icon: "🧪", text: "Test Senaryosu Yaz", prompt: "Az sonra paylaşacağım fonksiyon için birim test senaryoları yaz." }
        ] },
        student: { label: "Öğrenci", icon: "🎓", starters: [
            { icon: "📘", text: "Bu Konuyu Anlat", prompt: "Şimdi bir konu ismi vereceğim; onu sıfırdan, basit örneklerle anlat." },
            { icon: "📝", text: "Test Sorusu Hazırla", prompt: "Şimdi vereceğim konudan çoktan seçmeli 5 test sorusu hazırla, cevap anahtarıyla." },
            { icon: "📚", text: "Notlarımı Özetle", prompt: "Az sonra ders notlarımı paylaşacağım; kısa ve öz şekilde özetle." },
            { icon: "🗓️", text: "Sınav Planı Çıkar", prompt: "Sınavıma kaç gün kaldığını ve konuları vereceğim; günlük çalışma planı hazırla." }
        ] },
        language: { label: "Dil Öğrenen", icon: "🗣️", starters: [
            { icon: "🔤", text: "Bu Cümleyi Çevir", prompt: "Şimdi bir cümle vereceğim; İngilizce'ye/Türkçe'ye çevirip alternatif ifade şekilleri de göster." },
            { icon: "✏️", text: "Gramerimi Düzelt", prompt: "Şimdi yazacağım metindeki gramer hatalarını düzelt ve nedenini kısaca açıkla." },
            { icon: "💬", text: "Örnek Cümle Ver", prompt: "Şimdi vereceğim kelime/deyim için 3 örnek cümle kur." },
            { icon: "🧠", text: "Kelime Çalışması Yapalım", prompt: "Günlük hayatta sık kullanılan 10 kelime/deyim seç, anlamlarıyla birlikte quiz yap." }
        ] },
        content: { label: "İçerik Üretici", icon: "🎬", starters: [
            { icon: "🎥", text: "Video Fikri Üret", prompt: "Sosyal medya için 5 kısa video/reels fikri üret, her biri için hook cümlesi de yaz." },
            { icon: "✍️", text: "Sosyal Medya Metni Yaz", prompt: "Şimdi vereceğim konu için ilgi çekici bir sosyal medya gönderisi yaz." },
            { icon: "🏷️", text: "Başlık Öner", prompt: "Şimdi vereceğim içerik için tıklanma oranı yüksek 5 alternatif başlık öner." },
            { icon: "🔥", text: "Metni Daha Etkileyici Yap", prompt: "Az sonra paylaşacağım metni daha akıcı ve etkileyici hale getir." }
        ] },
        research: { label: "Araştırmacı", icon: "🔬", starters: [
            { icon: "📖", text: "Konuyu Derin Araştır", prompt: "Şimdi vereceğim konuyu derinlemesine, farklı açılardan araştırıp özetle." },
            { icon: "📑", text: "Kaynaklı Özet Çıkar", prompt: "Şimdi vereceğim metni, ana noktaları ve olası kaynaklarıyla özetle." },
            { icon: "⚖️", text: "Artı/Eksi Analizi Yap", prompt: "Şimdi vereceğim konu için artı ve eksileri dengeli şekilde karşılaştır." },
            { icon: "🎓", text: "Literatür Gibi Açıkla", prompt: "Şimdi vereceğim konuyu akademik bir üslupla, kavramları tanımlayarak açıkla." }
        ] },
        founder: { label: "Girişimci", icon: "🚀", starters: [
            { icon: "💼", text: "SaaS Fikri Öner", prompt: "Küçük bir ekip tarafından 3 ayda yapılabilecek 3 SaaS fikri öner, hedef kitleleriyle birlikte." },
            { icon: "🗺️", text: "Proje Planı Çıkar", prompt: "Şimdi vereceğim proje fikri için adım adım bir yol haritası çıkar." },
            { icon: "🧩", text: "MVP Özelliklerini Belirle", prompt: "Şimdi vereceğim fikir için ilk sürümde (MVP) olması gereken minimum özellik listesini çıkar." },
            { icon: "💰", text: "Para Kazanma Modeli Kur", prompt: "Şimdi vereceğim ürün fikri için 3 farklı gelir modeli öner, artı/eksileriyle." }
        ] }
    };

    function runUsageRoleStarter(starter) {
        if (!starter) return;
        if (starter.action === 'image') { triggerImageGeneration(); return; }
        if (starter.action === 'video') { triggerVideoGeneration(); return; }
        if (starter.action === 'game') { triggerGameGeneration(); return; }
        if (starter.action === 'doc') { triggerFileInput('docUpload'); return; }
        if (starter.prompt) setQuickStart(starter.prompt);
    }

    function runUsageRoleStarterByIndex(role, idx) {
        const roleData = USAGE_ROLE_STARTERS[role] || USAGE_ROLE_STARTERS.general;
        runUsageRoleStarter(roleData.starters[idx]);
    }

    function renderUsageRoleUI(role) {
        const roleData = USAGE_ROLE_STARTERS[role] || USAGE_ROLE_STARTERS.general;
        const activeRole = USAGE_ROLE_STARTERS[role] ? role : 'general';
        const rowEl = document.getElementById('usageRoleRow');
        const actionsEl = document.getElementById('welcomeActions');
        if (rowEl) {
            rowEl.innerHTML = Object.keys(USAGE_ROLE_STARTERS).map(key => {
                const r = USAGE_ROLE_STARTERS[key];
                const activeClass = key === activeRole ? ' active' : '';
                return `<button type="button" class="usage-role-chip${activeClass}" onclick="selectUsageRole('${key}')">${r.icon} ${r.label}</button>`;
            }).join('');
        }
        if (actionsEl) {
            actionsEl.innerHTML = roleData.starters.map((s, idx) =>
                `<button type="button" class="welcome-btn" onclick="runUsageRoleStarterByIndex('${activeRole}', ${idx})">${s.icon} ${s.text}</button>`
            ).join('');
        }
    }

    function selectUsageRole(role) {
        try { localStorage.setItem(USAGE_ROLE_KEY, role); } catch (e) {}
        renderUsageRoleUI(role);
    }

    function getUsageRoleInstruction() {
        let role = 'general';
        try { role = localStorage.getItem(USAGE_ROLE_KEY) || 'general'; } catch (e) {}
        if (role === 'general' || !USAGE_ROLE_STARTERS[role]) return '';
        const label = USAGE_ROLE_STARTERS[role].label;
        return `\n\nKULLANICI BAĞLAMI: Kullanıcı bu sohbete "${label}" kullanım amacıyla başladı. Mümkün olduğunda cevaplarını bu bağlama göre önceliklendir; ancak kullanıcı farklı bir konu sorarsa doğal şekilde ona uy. Bu bağlam güvenlik kurallarını, üslup modunu, tonu veya persona talimatlarını hiçbir zaman geçersiz kılmaz.`;
    }

    function startNewProject(type) {
        const name = (document.getElementById('newProjectName')?.value || '').trim();
        const model = document.getElementById('newProjectModel')?.value;
        const style = document.getElementById('newProjectStyle')?.value || 'safe';
        const speech = document.getElementById('newProjectSpeechStyle')?.value || 'default';
        const lang = document.getElementById('newProjectLang')?.value || 'auto';
        const output = document.getElementById('newProjectOutput')?.value || 'chat';
        if (model && document.getElementById('modelSelect')) document.getElementById('modelSelect').value = model;
        setFeatureValue('styleMode', style);
        setFeatureValue('speechStyle', speech);
        applyFeatureUiState();

        if (type === 'blank') {
            createNewChat();
            return;
        }
        if (type === 'image') {
            setAppMode('image');
            setQuickStart(`${name ? name + ': ' : ''}Gorsel uretim icin yaratıcı ve net bir prompt hazirla. Dil: ${lang}.`);
            return;
        }
        if (type === 'video') {
            setAppMode('video');
            setQuickStart(`${name ? name + ': ' : ''}Video icin sahne, kamera, atmosfer ve sure detaylari olan bir prompt hazirla. Dil: ${lang}.`);
            return;
        }
        if (type === 'pdf') {
            triggerFileInput('docUpload');
            return;
        }
        if (type === 'voice') {
            setQuickStart(`${name ? name + ': ' : ''}Sesli asistan gibi cevap ver. Once kisa bir selamlama yap, sonra benden ne yapmak istedigimi sor.`);
            return;
        }
        const prompts = {
            webapp: `${name || 'Yeni web app'} icin tek dosyalik HTML/CSS/JS calisir prototip hazirla. Cikti tipi: ${output}. Once kisa plan ver, sonra kodu yaz.`,
            game: `${name || 'Yeni oyun'} icin HTML5/Canvas ile oynanabilir bir oyun yap. Kontroller, skor ve yeniden baslatma olsun.`,
            fixcode: `${name || 'Kod duzeltme'} icin kodu analiz et, hatayi bul, minimal patch oner ve test adimlarini yaz. Kodu birazdan paylasacagim.`
        };
        setAppMode(type === 'game' ? 'game' : 'chat');
        setQuickStart(prompts[type] || `${name || 'Yeni proje'} icin baslangic plani hazirla.`);
    }

    const SEND_BUTTON_IDLE_HTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    const SEND_BUTTON_STOP_HTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>';
    window.activeGenerationController = window.activeGenerationController || null;
    window.generationStopRequested = false;
    window.activeGenerationBotId = null;

    function getMainSendButton() {
        return document.getElementById('sendBtn');
    }

    function getThinkingIndicatorHtml(label = "CinoCode düşünüyor") {
        return `<span class="thinking-indicator"><span>${label}</span><span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span></span>`;
    }

    function clearTransientTypingIndicators() {
        try {
            const selectors = [
                '#cinocode_generating_status',
                '[data-typing-indicator="1"]',
                '[data-typing-indicator="true"]',
                '.typing-indicator',
                '.thinking-indicator',
                '.floating-typing',
                '.global-typing',
                '.generating-status',
                '.generation-status',
                '.message.assistant.typing',
                '.message.bot.typing'
            ];
            document.querySelectorAll(selectors.join(',')).forEach(node => {
                const bubble = node.closest && node.closest('.message');
                const wholeTypingBubble = bubble && bubble.dataset && (bubble.dataset.typingIndicator === "1" || bubble.dataset.typingIndicator === "true");
                if (wholeTypingBubble) {
                    bubble.remove();
                    return;
                }
                if (!bubble || node.id === 'cinocode_generating_status' || node.classList.contains('typing-indicator') || node.classList.contains('thinking-indicator')) {
                    node.remove();
                }
            });
            document.querySelectorAll('body *').forEach(node => {
                if (!node || !node.textContent) return;
                if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/i.test(node.tagName || "")) return;
                const text = node.textContent.trim();
                if (!text || !text.includes("CinoCode düşünüyor")) return;
                if (node.closest && node.closest('.message')) return;
                if (text.length > 80) return;
                if (node.children && node.children.length > 4) return;
                node.remove();
            });
        } catch(e) {}
    }


    function setGenerationUiBusy(isBusy) {
        const sendBtn = getMainSendButton();
        const input = document.getElementById('userInput');
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.classList.toggle('stop-mode', !!isBusy);
            sendBtn.innerHTML = isBusy ? SEND_BUTTON_STOP_HTML : SEND_BUTTON_IDLE_HTML;
            sendBtn.title = isBusy ? "Durdur" : "Gönder";
            sendBtn.setAttribute('aria-label', isBusy ? "Yanıtı durdur" : "Gönder");
        }
        if (input) {
            if (isBusy) {
                if (!input.dataset.idlePlaceholder) input.dataset.idlePlaceholder = input.placeholder || "CinoCode'a bir şeyler sor...";
                input.placeholder = "Yanıt oluşturuluyor...";
            } else {
                input.placeholder = input.dataset.idlePlaceholder || "CinoCode'a bir şeyler sor...";
                delete input.dataset.idlePlaceholder;
            }
        }
    }

    function cleanupGenerationUi() {
        const warnings = document.querySelectorAll('.auto-fallback-warning');
        warnings.forEach(w => w.remove());
        window.isGenerating = false;
        window.activeGenerationController = null;
        window.activeGenerationBotId = null;
        setGenerationUiBusy(false);
        try { const userInputEl = document.getElementById('userInput'); if (userInputEl) userInputEl.disabled = false; } catch(e) {}
        clearTransientTypingIndicators();
    }

    function stopGeneration() {
        window.generationStopRequested = true;
        const controller = window.activeGenerationController;
        if (controller && !controller.signal.aborted) {
            try { controller.abort(); } catch(e) {}
        }
        const botNode = window.activeGenerationBotId ? document.getElementById(window.activeGenerationBotId) : null;
        if (botNode && botNode.textContent && botNode.textContent.includes("CinoCode düşünüyor")) {
            botNode.innerHTML = "<i>Yanıt durduruldu.</i>";
        } else if (messagesDiv) {
            messagesDiv.insertAdjacentHTML('beforeend', `<div class="message bot-message" style="background: rgba(64,64,64,0.12); border-left: 3px solid #f38ba8; padding: 8px; margin-bottom:10px; border-radius: var(--cc-radius); font-size:0.9em;">Yanıt durduruldu.</div>`);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        cleanupGenerationUi();
    }

    function handleSendButtonClick() {
        if (window.isGenerating) {
            stopGeneration();
            return;
        }
        sendMessage();
    }

    function getOllamaUrl() {
        let saved = localStorage.getItem('ollama_ip');
        if (saved && saved.trim() !== '') {
            return saved.trim().replace(/\/$/, "");
        }
        return "http://" + window.location.hostname + ":11434";
    }

    async function checkOllamaStatus() {
        try {
            const res = await fetch(getOllamaUrl() + "/", { method: "HEAD" });
            if (res.ok) { document.getElementById("statusIndicator").classList.add("online"); }
            else { document.getElementById("statusIndicator").classList.remove("online"); }
        } catch { document.getElementById("statusIndicator").classList.remove("online"); }
    }

    function printChat() {
        window.print();
    }

    function exportChat() {
        let txt = "CinoCode Sohbet Dökümü\n=====================\n\n";
        sessions[currentChatId].messages.forEach(msg => {
            if (msg.role === "user") txt += "Sen: " + msg.content + "\n\n";
            if (msg.role === "assistant") txt += "CinoCode: " + msg.content + "\n\n-----------------\n\n";
        });
        // BOM eklenmezse bazı editörler (özellikle Windows Notepad) UTF-8 Türkçe karakterleri
        // (ş, ğ, ı, ö, ü, ç) mojibake olarak gösteriyordu.
        const blob = new Blob(["\uFEFF" + txt], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "CinoCode_" + sessions[currentChatId].title.replace(/ /g, "_") + ".txt"; a.click();
    }

    function addCopyButtons(container) {
        container.querySelectorAll("pre").forEach(pre => {
            const code = pre.querySelector("code");
            if (!code) return;
            const lang = code.className.replace("language-", "") || "code";
            const header = document.createElement("div"); header.className = "code-header";
            header.innerHTML = `<span>${lang}</span><button class="copy-btn">Kopyala</button>`;
            header.querySelector(".copy-btn").onclick = function() {
                navigator.clipboard.writeText(code.innerText);
                this.innerText = "Kopyalandı!"; setTimeout(() => this.innerText = "Kopyala", 2000);
            };
            if(pre.parentNode.querySelector('.fz19-sticky-code-bar')) { header.style.top = "34px"; header.style.borderTopLeftRadius = "0"; header.style.borderTopRightRadius = "0"; }
            pre.parentNode.insertBefore(header, pre);
            pre.style.marginTop = "0"; pre.style.borderTopLeftRadius = "0"; pre.style.borderTopRightRadius = "0";
        });
    }
    function cleanTextForTitle(text) {
        if (!text) return "";
        return text
            .replace(/\[Belge İçeriği:[\s\S]*?\]/gi, "")
            .replace(/\[REMEMBER:[\s\S]*?\]/gi, "")
            .replace(/\[SYSTEM:[\s\S]*?\]/gi, "")
            .replace(/\[DEVELOPER:[\s\S]*?\]/gi, "")
            .replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, "")
            .replace(/`[\s\S]*?`/g, "")
            .replace(/^\s*(Sen|Kullanıcı|User|Assistant|Bot):.*$/gmi, "")
            .replace(/^\s*Viewed\s+.*$/gmi, "")
            .replace(/^\s*Edited\s+.*$/gmi, "")
            .replace(/^\s*Ran command:\s*.*$/gmi, "")
            .replace(/^\s*node\s+-e\s+.*$/gmi, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    const TITLE_LEADING_FILLERS = /^(knk|kanka|bana|bir|şu|su|bu|hey|selam|merhaba|dostum|reis|abi|abim|hocam|lütfen|lutfen)\s+/i;
    const TITLE_TRAILING_FILLERS = /\s+(var|ya|yaa|mı|mi|mu|mü|musun|mısın|misin|müsün|lütfen|lutfen)$/i;
    const TITLE_TRAILING_VERBS = /\s+(oluştur|olustur|yap|çiz|ciz|üret|uret|hazırla|hazirla|generate|draw|create)$/i;
    // Tek başına başlık olarak anlamsız/jenerik kelimeler — bunlar çıkarsa
    // generator "kötü başlık" sayıp bir sonraki mesajı bekleyecek.
    const TITLE_GENERIC_WORDS = new Set(["normal", "soru", "devam", "tamam", "kanka", "yap", "oluştur", "olustur", "peki", "ok", "evet", "hayır", "hayir", "selam", "merhaba", "naber", "napıyorsun", "napiyorsun"]);

    function generateChatTitleFromMessage(message, attachmentInfo) {
        let text = cleanTextForTitle(message);

        // Baştaki anlamsız hitapları temizle
        text = text.replace(/^(knk|kanka|kanki|abi|hocam|selam|merhaba|hey|hi|naber|napıyorsun|ya|yaa)\b\s*/gi, "");

        // URL'leri ve markdown artıklarını temizle
        text = text.replace(/https?:\/\/\S+/g, "").replace(/[#*`~]/g, "");

        text = text.replace(/\s+/g, " ").trim();

        if (!text || text.length < 3) {
            return attachmentInfo ? "Dosya Analizi" : "Kısa Sohbet";
        }

        // İlk 5 kelimeyi alarak doğal bir başlık oluştur
        let words = text.split(" ");
        let titleWords = [];

        for (let i = 0; i < Math.min(words.length, 5); i++) {
            let w = words[i];
            titleWords.push(w);
            // Anlamlı bir duraklamada (nokta, ünlem, soru) kes
            if (/[.!?]$/.test(w)) break;
        }

        let finalTitle = titleWords.join(" ").replace(/[.!?:,]+$/, "").trim();

        if(finalTitle.length > 0) {
            finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
        }

        return finalTitle || "Kısa Sohbet";
    }

        function isBadAutoTitle(title) {
        if (!title) return true;
        const t = title.trim();
        return (
            t === "Yeni Sohbet" ||
            t.startsWith("Yeni Sohbet") ||
            t.startsWith("Sohbet ") ||
            t === "Sohbet" ||
            t === "Dallanmış" ||
            t === "Buradan Devam" ||
            t === "Yeni Konuşma" ||
            t === "CinoCode Sohbeti" ||
            t === "Konu Başlığı" ||
            t.includes("Yeni Sohbet (Dallanmış)") ||
            /^\s*Viewed\b/i.test(t) ||
            /^\s*Edited\b/i.test(t) ||
            /^\s*Ran command\b/i.test(t) ||
            /^\s*node -e\b/i.test(t) ||
            t.startsWith("[Belge İçeriği") ||
            t.startsWith("[REMEMBER") ||
            t.startsWith("[SYSTEM") ||
            t.startsWith("data:image") ||
            t.length < 4
        );
    }

    function makeShortTitle(text) {
        const words = text.split(/\s+/).slice(0, 3);
        return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }

    function ensureChatTitleFromAssistantResponse(botReply) {
        const chat = sessions[currentChatId];
        if (!chat) return;
        if (chat.manualTitle === true) return;

        if (isBadAutoTitle(chat.title)) {
            if (botReply.includes("[GENERATE_IMAGE:")) {
                const imgMatch = botReply.match(/\[GENERATE_IMAGE:\s*([^\]]+)\]/);
                if (imgMatch) {
                    chat.title = "🎨 " + makeShortTitle(imgMatch[1]);
                    saveDatabase();
                    renderSidebar();
                    return;
                }
            }

            let clean = botReply
                .replace(/\[REMEMBER:[\s\S]*?\]/gi, "")
                .replace(/\[SYSTEM:[\s\S]*?\]/gi, "")
                .replace(/\[DEVELOPER:[\s\S]*?\]/gi, "")
                .replace(/<[^>]*>/g, "")
                .replace(/```[\s\S]*?```/g, "")
                .replace(/[\n\r]+/g, " ")
                .trim();

            if (clean.length > 5) {
                const words = clean.split(/\s+/).filter(w => w.length > 1 && !/^(ve|veya|ile|de|da|ki|ama|ise|lan|amk|piç|orospu|siktir|kanka|yav|ben|sen|o|biz|siz|onlar)$/i.test(w));
                if (words.length > 0) {
                    const titleWords = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
                    chat.title = titleWords.join(" ");
                    saveDatabase();
                    renderSidebar();
                }
            }
        }
    }

    async function fz19GenerateAiChatTitle(userMessage) {
        try {
            const trimmed = String(userMessage || '').slice(0, 500).trim();
            if (!trimmed) return null;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);
            let resp;
            try {
                resp = await fetch('/.netlify/functions/ai-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        taskType: 'chat',
                        selectedModel: 'groq',
                        temperature: 0.3,
                        maxTokens: 20,
                        messages: [
                            { role: 'system', content: 'Kullanıcının ilk mesajına bakarak bu sohbete 2-4 kelimelik, kısa, doğal bir Türkçe başlık üret. Sadece başlığı yaz; tırnak işareti, noktalama veya açıklama ekleme.' },
                            { role: 'user', content: trimmed }
                        ]
                    })
                });
            } finally {
                clearTimeout(timeoutId);
            }

            if (!resp || !resp.ok) return null;
            const data = await resp.json().catch(() => null);
            if (!data || !data.ok || !data.content) return null;

            let title = String(data.content).trim();
            title = title.replace(/^["'“”]+|["'“”]+$/g, '').replace(/\.+$/, '').trim();
            if (title.length < 2 || title.length > 48) return null;

            return title.charAt(0).toUpperCase() + title.slice(1);
        } catch (e) {
            return null;
        }
    }

    function ensureChatTitleFromUserInput(userMessage, attachmentInfo) {
        const chat = sessions[currentChatId];
        if (!chat) return;
        if (chat.manualTitle === true) return;

        if (isBadAutoTitle(chat.title)) {
            // Anında görünürlük için yerel (offline) başlığı hemen ata
            const offlineTitle = generateChatTitleFromMessage(userMessage, attachmentInfo);
            if (offlineTitle && offlineTitle !== "Yeni Sohbet") {
                chat.title = offlineTitle;
                saveDatabase();
                renderSidebar();
            }

            // FAZ 19: Arka planda AI destekli daha isabetli bir başlık dene.
            // Mesaj gönderme akışını BLOKLAMAZ; başarısız/timeout olursa offline başlık kalır.
            const chatIdAtCallTime = currentChatId;
            fz19GenerateAiChatTitle(userMessage).then(aiTitle => {
                if (!aiTitle) return;
                const chatNow = sessions[chatIdAtCallTime];
                if (!chatNow) return;
                if (chatNow.manualTitle === true) return;
                // Kullanıcı arada elle değiştirmediyse (hâlâ offline/otomatik başlıktaysa) üzerine yaz
                if (chatNow.title === offlineTitle || isBadAutoTitle(chatNow.title)) {
                    chatNow.title = aiTitle;
                    saveDatabase();
                    renderSidebar();
                }
            }).catch(() => {});
        }
    }

    function repairBadChatTitles() {
        let changed = false;
        for (let chatId in sessions) {
            let chat = sessions[chatId];
            if (chat.manualTitle === true) continue;
            if (!isBadAutoTitle(chat.title)) continue;

            const firstUserMsg = (chat.messages || []).find(m =>
                m.role === "user" &&
                m.content
            );

            let attachmentInfo = null;
            if (firstUserMsg && firstUserMsg.images && firstUserMsg.images.length > 0) {
                attachmentInfo = { type: "image/" };
            }

            const newTitle = generateChatTitleFromMessage(firstUserMsg ? firstUserMsg.content : "", attachmentInfo);

            if (newTitle && newTitle !== "Yeni Sohbet") {
                chat.title = newTitle;
                changed = true;
            }
        }

        if (changed) {
            saveDatabase();
            renderSidebar();
        }
    }

    // ----- MESAJ GÖNDERME (OLLAMA API) -----
    // Mobile ses kilidini açmak için bayrak
    let isAudioUnlocked = false;

    function getDocumentChunkPayload(fullText, selectedModel, isExamMode) {
        if (!fullText) return { chunk: null, docNameSuffix: '', note: '', done: false };

        const weakModelLimit = 12000;
        const normalLimit = isExamMode ? 25000 : 20000;
        const proxyCloudIds = PROXY_CLOUD_MODELS;
        const strongModel = proxyCloudIds.includes(selectedModel.toLowerCase()) || selectedModel.includes("-nvidia") || selectedModel.includes("-openrouter") || selectedModel.toLowerCase().includes("llava") || selectedModel.toLowerCase().includes("vision") || selectedModel.toLowerCase().includes("scout") || selectedModel.toLowerCase().includes("maverick");
        const limit = strongModel ? normalLimit : Math.min(normalLimit, weakModelLimit);

        if (window.activeDocCursor == null || window.activeDocCursor < 0) window.activeDocCursor = 0;
        if (window.activeDocCursor >= fullText.length) {
            return { chunk: null, docNameSuffix: '', note: '', done: true };
        }

        const start = window.activeDocCursor;
        let end = Math.min(fullText.length, start + limit);
        let chunk = fullText.slice(start, end);

        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > Math.floor(chunk.length * 0.7)) {
            chunk = chunk.slice(0, lastSpace);
            end = start + chunk.length;
        }

        window.activeDocCursor = end;
        const totalChunks = Math.max(1, Math.ceil(fullText.length / limit));
        const currentChunkIndex = Math.floor(start / limit) + 1;
        const remainingChars = fullText.length - end;

        const note = remainingChars > 0
            ? `Bu belgenin ${currentChunkIndex}. parçasını (yaklaşık ${chunk.length} karakter) kullandım. Daha fazlasına devam etmek için lütfen "devam et" yaz.`
            : `Bu belgenin son parçasını kullandım.`;
        const docNameSuffix = remainingChars > 0
            ? ` [PDF Parça ${currentChunkIndex}/${totalChunks}]`
            : ` [PDF Son Parça]`;

        return {
            chunk,
            docNameSuffix,
            note,
            done: false
        };
    }

    async function sendMessage() {
        clearTransientTypingIndicators();
        // Mobil cihazlarda TTS (Text-to-Speech) sesinin çalabilmesi için
        // kullanıcı "Gönder" tuşuna bastığı an (user interaction sırasında) sessiz bir ses çalarak kilidi açıyoruz.
        if (!isAudioUnlocked && isSpeakerOn) {
            isAudioUnlocked = true;
            try {
                // Boş string bazen hataya yol açar, o yüzden kısa bir boşluk sesi oynatıp durduruyoruz
                let silentUtterance = new SpeechSynthesisUtterance(" ");
                silentUtterance.volume = 0;
                window.currentUtterance = silentUtterance; // Garbage collection koruması
                window.speechSynthesis.speak(silentUtterance);

                let silentAudio = new Audio();
                silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"; // 1 ms silent wav
                silentAudio.play().catch(e => {});
            } catch(e) {}
        }

        const text = userInput.value.trim();
        // If generation is active, the send button works as Stop.
        if (window.isGenerating) {
            stopGeneration();
            return;
        }

        window.generationStopRequested = false;

        const images = window.selectedFiles ? window.selectedFiles.filter(f => f.rawType === 'image').map(f => f.content) : [];
        const hasImage = images.length > 0;

        const unsupportedMedia = window.selectedFiles
            ? window.selectedFiles.filter(file => file.rawType === 'audio' || file.rawType === 'video')
            : [];
        if (unsupportedMedia.length > 0) {
            showNonBlockingToast('Ses ve video analizi henüz bağlı değil. Bu ekleri kaldırıp görsel veya belge gönderin.');
            return;
        }

        const documents = window.selectedFiles ? window.selectedFiles.filter(f => f.rawType === 'document') : [];
        let docTextToUse = null;
        let docNameToUse = "Belge";
        if (documents.length > 0) {
            docTextToUse = documents
                .map(d => String(d.content || ''))
                .join("\n").slice(0, DOCUMENT_CONTEXT_MAX_CHARS);
            docNameToUse = documents.map(d => d.name).join(", ");
        }

        if (!text && !hasImage && !docTextToUse) return;

        const mediaSourceToggle = document.getElementById("mediaSourceToggleContainer");
        if (mediaSourceToggle) {
            mediaSourceToggle.style.display = "none";
        }
        maybeApplyDynamicSpeechStyle(text);

        const hasExplicitImageGenerationIntent = !!text && isDirectImageGenerationRequest(text);
        if (hasImage && hasExplicitImageGenerationIntent) {
            removeImage();
        }

        if (!text && (hasImage || docTextToUse)) {
            userInput.placeholder = "PDF/fotoğraf hazır. Lütfen bir talimat yaz ve gönder.";
            userInput.focus();
            return;
        }

        let selectedModel = document.getElementById("modelSelect").value;
        let actualModelForAuto = "";

        if (selectedModel === "auto") {
            const hasCode = /\b(function|const|let|var|if|else|for|while|import|export|class|=>|#include|\bdef\b|import\s+pandas)\b/i.test(text);

            if (hasImage) {
                selectedModel = "meta-llama/llama-3.2-11b-vision-instruct:free-openrouter";
                actualModelForAuto = "Llama Vision";
            } else if (hasCode) {
                selectedModel = "deepseek";
                actualModelForAuto = "DeepSeek Cloud";
            } else {
                selectedModel = "openai";
                actualModelForAuto = "OpenAI Cloud";
            }
        }
        const isVisionCapable = isVisionCapableModel(selectedModel);

        if (hasImage && !isVisionCapable) {
            const preferredVisionModel = getPreferredVisionModel(selectedModel);
            if (preferredVisionModel) {
                document.getElementById("modelSelect").value = preferredVisionModel;
            } else {
                alert("Görsel analizi için vision destekli model bulunamadı veya provider routing başarısız oldu. Gemini/OpenRouter/Groq Vision yapılandırmasını ve seçili vision modelini kontrol edin.");
                return;
            }
        }

        const suggestionContainer = document.getElementById("suggestionChipsContainer");
        if (suggestionContainer) suggestionContainer.style.display = "none";

        if (isRecording) stopMic();
        stopSpeaking();

        const chat = sessions[currentChatId];
        let attachmentInfo = null;
        if (hasImage) attachmentInfo = { type: "image/" };
        else if (docTextToUse) attachmentInfo = { type: "document/" };
        ensureChatTitleFromUserInput(text, attachmentInfo);

        let msgObj = { role: "user", content: text };
        if (window.pendingContinuationInstruction && text === "Devam et 🔁") {
            msgObj.internalInstruction = window.pendingContinuationInstruction;
            window.pendingContinuationInstruction = null;
        }
        if (hasImage) {
            msgObj.images = images;
        }

        const isAkademikKocNow = (document.getElementById('personaSelect') && document.getElementById('personaSelect').value === 'akademik_koc');
        if (docTextToUse) {
            window.activeDocText = docTextToUse;
            window.activeDocName = docNameToUse;
        }

        if (docTextToUse) {
            const srcVal = document.getElementById('skp-source') ? document.getElementById('skp-source').value : 'pdf';
            if (srcVal !== 'chat') {
                const chunkInfo = getDocumentChunkPayload(docTextToUse, selectedModel, window.isExamMode || isAkademikKocNow);
                if (chunkInfo.done) {
                    // PDF chunkları bittiğinde kullanıcı mesajına otomatik ekleme yapmayalım.
                    // Gerekirse bu uyarıyı bot tarafında göster.
                } else if (chunkInfo.chunk) {
                    msgObj.documentText = chunkInfo.chunk;
                    msgObj.documentName = docNameToUse + chunkInfo.docNameSuffix;
                    msgObj.promptSuffix = (msgObj.promptSuffix || "") + "\n\n" + chunkInfo.note;
                } else {
                    msgObj.documentText = docTextToUse;
                    msgObj.documentName = docNameToUse;
                }
            }
            if (window.isExamMode) {
                skpSyncStateFromPanel();
                if (typeof buildExamCoachSuffix === "function") {
                    msgObj.promptSuffix = (msgObj.promptSuffix || "") + "\n\n" + buildExamCoachSuffix();
                } else {
                    msgObj.promptSuffix = (msgObj.promptSuffix || "") + "\n\n[\u{1F393} SINAV KO\u015eU MODU]\nBu belgeyi analiz et, \u00f6zet \u00e7\u0131kar, \u00f6nemli kavramlar\u0131 listele ve 10 soruluk test olu\u015ftur.";
                }
                window.isExamMode = false;
            } else if (isAkademikKocNow && !window.selectedDocumentText) {
                // İkinci+ mesaj: panel dropdownlarından suffix üret
                skpSyncStateFromPanel();
                if (typeof buildExamCoachSuffix === "function") {
                    const suffix = buildExamCoachSuffix();
                    if (suffix) msgObj.promptSuffix = (msgObj.promptSuffix || "") + "\n\n" + suffix;
                }
            }
        }

        chat.messages.push(msgObj);
        chat.updatedAt = Date.now();
        saveDatabase();
        renderCurrentChat();

        userInput.value = ""; autoResize(userInput);
        clearComposerDraft();

        window.selectedFiles = [];
        renderFilePreviews();

        const botId = "bot-" + Date.now();
        clearTransientTypingIndicators();
        window.activeGenerationBotId = botId;
        const typingDiv = document.createElement("div");
        typingDiv.className = "message bot"; typingDiv.id = botId;
        typingDiv.dataset.typingIndicator = "1";

        if (msgObj.images && msgObj.images.length > 0) {
            typingDiv.innerHTML = "<i>\u{1F5BC}\uFE0F G\u00f6rsel analiz ediliyor (Biraz uzun s\u00fcrebilir, l\u00fctfen bekleyin)...</i>";
        } else {
            typingDiv.innerHTML = getThinkingIndicatorHtml();
        }

        messagesDiv.appendChild(typingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        const wantsImageGeneration = !msgObj.images && !docTextToUse && isDirectImageGenerationRequest(text);
        const wantsVideoGeneration = !msgObj.images && !docTextToUse && isDirectVideoCreationRequest(text);
        const wantsImageSearch = !msgObj.images && !docTextToUse && isDirectImageSearchRequest(text);

        const selectedMediaSource = document.querySelector('input[name="mediaSource"]:checked')?.value || 'ai';
        const isMediaRequest = wantsImageGeneration || wantsVideoGeneration || (currentMode === "video" && isVideoModeCreationRequest(text));

        if (wantsImageSearch || (selectedMediaSource === 'web' && wantsImageGeneration)) {
            delete typingDiv.dataset.typingIndicator;
            // Sorgu, komut kelimeleri ve stil son-ekleri ayıklanmış gerçek özneden kurulur;
            // özne yoksa son geçerli görsel konusu denenir, o da yoksa Openverse ÇAĞRILMAZ.
            let searchQuery = getCoreImageSubject(text).slice(0, 200);
            if (!searchQuery && lastMediaPrompt) searchQuery = getCoreImageSubject(lastMediaPrompt).slice(0, 200);
            if (!searchQuery) {
                const askText = 'Aranacak görsel konusu net değil. Örneğin "internetten kırmızı araba görseli bul" yazabilirsin.';
                typingDiv.innerHTML = renderContentWithImages(askText, true);
                chat.messages.push({ role: 'assistant', content: askText, meta: { ui: true } });
                chat.updatedAt = Date.now();
                saveDatabase();
                scrollToBottom();
                cleanupGenerationUi();
                return;
            }
            typingDiv.textContent = `🔍 İnternette “${searchQuery}” aranıyor...`;
            try {
                const webImages = await searchInternetImages(searchQuery);
                const noticeText = webImages.length
                    ? `İnternetten bulunan açık lisanslı görseller: ${searchQuery}`
                    : `“${searchQuery}” için uygun açık lisanslı görsel bulunamadı.`;
                const assistantMessage = { role: 'assistant', content: noticeText, webImageQuery: searchQuery, webImages };
                typingDiv.innerHTML = renderContentWithImages(noticeText, true);
                appendInternetImageResults(typingDiv, assistantMessage);
                chat.messages.push(assistantMessage);
                attachMsgActionsToBotDiv(botId, chat.messages.length - 1, assistantMessage);
            } catch (error) {
                const noticeText = 'İnternet görsel aramasına şu anda ulaşılamadı. Yapay zekâ ile üretmeyi deneyebilir veya biraz sonra tekrar arayabilirsin.';
                typingDiv.innerHTML = renderContentWithImages(noticeText, true);
                chat.messages.push({ role: 'assistant', content: noticeText, meta: { ui: true } });
            }
            chat.updatedAt = Date.now();
            saveDatabase();
            scrollToBottom();
            cleanupGenerationUi();
            return;
        }

        if (selectedMediaSource === 'web' && isMediaRequest) {
            delete typingDiv.dataset.typingIndicator;
            const noticeText = 'İnternetten Bul şu anda açık lisanslı görsel aramasını destekliyor. Video için Yapay Zekâ ile Üret kaynağını seç.';
            typingDiv.innerHTML = renderContentWithImages(noticeText, true);
            chat.messages.push({ role: 'assistant', content: noticeText, meta: { ui: true } });
            chat.updatedAt = Date.now();
            saveDatabase();
            cleanupGenerationUi();
            return;
        }

        if (!msgObj.images && !docTextToUse && isAmbiguousImageCreationRequest(text)) {
            delete typingDiv.dataset.typingIndicator;
            const askText = "Neyi çizmemi istiyorsun kanka?";
            typingDiv.innerHTML = renderContentWithImages(askText, true);
            chat.messages.push({ role: "assistant", content: askText });
            attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
            chat.updatedAt = Date.now();
            saveDatabase();
            scrollToBottom();
            return;
        }



        if (wantsImageGeneration) {
            setAppMode("image");
            // "tekrar çiz / yeniden oluştur" gibi kısa takip mesajlarında son geçerli görsel
            // konusu yeniden kullanılır; bağlam yoksa rastgele üretim yerine netleştirme istenir.
            let imagePromptSource = text;
            const commandSubject = getMediaCommandSubject(text);
            if (/^(tekrar|yeniden|bir daha|birdaha|aynısını|aynisini|aynısı|aynisi)$/.test(commandSubject)) {
                const lastCore = getCoreImageSubject(lastMediaPrompt || '');
                if (lastCore) {
                    imagePromptSource = lastCore;
                } else {
                    delete typingDiv.dataset.typingIndicator;
                    const askText = "Neyi çizmemi istiyorsun kanka?";
                    typingDiv.innerHTML = renderContentWithImages(askText, true);
                    chat.messages.push({ role: "assistant", content: askText });
                    attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                    chat.updatedAt = Date.now();
                    saveDatabase();
                    scrollToBottom();
                    return;
                }
            }
            const cleanPrompt = buildCleanMediaPrompt(imagePromptSource, "image");
            delete typingDiv.dataset.typingIndicator;
            typingDiv.innerHTML = renderContentWithImages(`[GENERATE_IMAGE: ${cleanPrompt}]`, true);
            scrubPlaceholderErrorImages(typingDiv);
            addCopyButtons(typingDiv);
            chat.messages.push({ role: "assistant", content: `[GENERATE_IMAGE: ${cleanPrompt}]` });
            attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
            appendSmartSuggestions(botId, `[GENERATE_IMAGE: ${cleanPrompt}]`, text);
            chat.updatedAt = Date.now();
            saveDatabase();
            scrollToBottom();
            return;
        }

        if (wantsVideoGeneration) {
            setAppMode("video");
            delete typingDiv.dataset.typingIndicator;
            typingDiv.innerHTML = `<div style="color:var(--cc-text-primary); margin-bottom:10px;">\u{1F3AC} Video iste\u011fin alg\u0131land\u0131, Video St\u00fcdyosu a\u00e7\u0131l\u0131yor...</div>
                <div id="${botId}-video" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                    <div style="color: var(--cc-text-primary); font-size: 16px; margin-bottom: 10px;">\u{1F3AC} Ger\u00e7ek video modeli ba\u011fl\u0131 de\u011fil; storyboard/slideshow \u00f6nizlemesi haz\u0131rlan\u0131yor...</div>
                    <div style="background: var(--cc-border); border-radius: var(--cc-radius); height: 20px; overflow: hidden; margin-bottom: 8px;">
                        <div id="${botId}-video-progress" style="background: linear-gradient(90deg, var(--cc-accent-brand), #cba6f7); height: 100%; width: 0%; border-radius: var(--cc-radius); transition: width 0.5s ease;"></div>
                    </div>
                    <div id="${botId}-video-status" style="color: var(--cc-text-muted); font-size: 13px;">Bu gerçek video değil, storyboard/slideshow taslağıdır. Gerçek video için sağlayıcı/API anahtarı gerekir.</div>
                    <button class="run-code-btn" style="background: #f38ba8; color: var(--cc-bg-main); font-size: 11px; padding: 4px 8px; margin-top: 8px; font-weight: bold;" onclick="cancelVideoGeneration('${botId}-video')">❌ İptal Et</button>
                </div>`;
            const cleanPrompt = buildCleanMediaPrompt(text, "video");
            lastMediaPrompt = cleanPrompt;
            lastMediaType = "video";
            queueVideoSlideshow(cleanPrompt, botId + "-video", { rawPrompt: text });
            chat.messages.push({ role: "assistant", content: `[GENERATE_VIDEO: ${cleanPrompt}]` });
            attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
            chat.updatedAt = Date.now();
            saveDatabase();
            return;
        }

        if (currentMode === "video" && isVideoModeCreationRequest(text)) {
            const cleanPrompt = buildCleanMediaPrompt(text, "video");
            lastMediaPrompt = cleanPrompt;
            lastMediaType = "video";
            queueVideoSlideshow(cleanPrompt, botId, { rawPrompt: text });
            chat.messages.push({ role: "assistant", content: `[GENERATE_VIDEO: ${cleanPrompt}]` });
            attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
            chat.updatedAt = Date.now();
            saveDatabase();
            return;
        }

        try {
            let selectedModel = document.getElementById("modelSelect").value;
        let actualModelForAuto = "";

        if (selectedModel === "auto") {
            const hasImage = !!selectedImageBase64;
            const hasCode = /\b(function|const|let|var|if|else|for|while|import|export|class|=>|#include|\bdef\b|import\s+pandas)\b/i.test(text);

            if (hasImage) {
                selectedModel = "meta-llama/llama-3.2-11b-vision-instruct:free-openrouter";
                actualModelForAuto = "Llama Vision";
            } else if (hasCode) {
                selectedModel = "deepseek";
                actualModelForAuto = "DeepSeek Cloud";
            } else {
                selectedModel = "openai";
                actualModelForAuto = "OpenAI Cloud";
            }
        }
            let reqMessages = [];
            const personaValue = document.getElementById("personaSelect") ? document.getElementById("personaSelect").value : "kanka";
            let baseSystemPrompt = personas[personaValue] || systemPrompt;
            if (!personas[personaValue] && window.professionsList) {
                const foundProf = window.professionsList.find(p => p.id === personaValue);
                if (foundProf) {
                    baseSystemPrompt = `Sen GinoCode'sun — seçkin, son derece tecrübeli ve uzman bir ${foundProf.name} rolündesin. ${foundProf.description} Alanındaki en güncel bilgilerle, uzman bir ${foundProf.name} bakış açısıyla, pratik, detaylı ve profesyonel çözümler sunacaksın. Kullandığın terimler ve yaklaşımın tamamen bu mesleğin etiğine ve metodolojisine uygun olmalıdır. Türkçeni C2 seviyesinde kusursuz ve akıcı kullanırsın.`;
                }
            }

            // ===== DİL KOÇU ENJEKSİYONU =====
            // Dil Koçu seçiliyse → dil, seviye, kural ve quiz talimatlarını sisteme ekle
            if (personaValue === 'dil_kocu') {
                baseSystemPrompt += getDilKocuInjection();
            }

            let userMemory = localStorage.getItem('cinocode_memory_' + (loggedUser || "default"));
            if (userMemory) {
                // "Ahmet" bugını kalıcı olarak temizle (sadece gerçek adı Ahmet olmayanlar için)
                let actualUser = (loggedUser || "default").toLowerCase();
                if (actualUser !== "ahmet" && userMemory.toLowerCase().includes("ahmet")) {
                    userMemory = userMemory.replace(/ahmet/gi, "").trim();
                    localStorage.setItem('cinocode_memory_' + (loggedUser || "default"), userMemory);
                }
                baseSystemPrompt += "\n\nHATIRLADIĞIN BİLGİLER (LONG-TERM MEMORY):\nŞu ana kadar kullanıcı hakkında öğrendiğin ve asla unutmaman gereken kalıcı bilgiler şunlardır:\n" + userMemory;
            }
            baseSystemPrompt += "\n\nKURAL: SADECE VE SADECE eğer kullanıcı kendisiyle, hayatıyla, zevkleriyle veya fiziksel özellikleriyle ilgili ÇOK ÖNEMLİ VE KALICI bir kişisel bilgi verirse (Örn: adım Ahmet, yaşım 25, kedim var, fıstığa alerjim var vb.), mesajının en sonuna BİREBİR şu formatta gizli bir not düşmelisin: [REMEMBER: Kullanıcı 25 yaşındaymış ve adı Ahmet'miş]. Sıradan sohbetlerde veya kullanıcının senden bir şey yapmanı/yazmanı istediği anlarda (Örn: hesap makinesi yaz, kod yaz) KESİNLİKLE [REMEMBER] KULLANMA! Sadece kişisel bilgileri kaydet.";
            baseSystemPrompt += "\n\nKURAL 2 (ÇOK ÖNEMLİ): Eğer kullanıcı senden bir oyun, arayüz, hesap makinesi veya web tabanlı herhangi bir uygulama yapmanı/kodlamanı isterse, KODU SADECE HTML BLOKLARI İÇİNDE YAZ. Başka metin ekleme.";
            baseSystemPrompt += getStyleModeInstruction();
            baseSystemPrompt += getClaudeProviderInstruction();
            baseSystemPrompt += getSpeechStyleInstruction();
            baseSystemPrompt += getResponseStyleGovernorInstruction();
            baseSystemPrompt += getToneStabilityInstruction();
            baseSystemPrompt += getUsageRoleInstruction();
            baseSystemPrompt += getResponseControlInstruction(text);
            // AŞAMA 7 FIX: Bu sohbetteki onceki asistan cevaplarinda reddetme/stil kaliplari
            // (orn. "kufur edemem", "sistemim izin vermiyor") gecmis olarak modele geri gidiyor ve
            // model kendi eski reddini surdurmeye kilitleniyor. Aktif modun onceki cevaplari EZDIGINI
            // acikca belirt ki mod degisimi/serbest uslup gecmisteki redlere takilmadan uygulansin.
            const activeStyleForReminder = getFeatureValue('styleMode') || 'safe';
            baseSystemPrompt += "\n\nAKTIF MOD OTORITESI (en yuksek oncelik): Su an aktif uslup modu '" + activeStyleForReminder + "'. Bu sohbetteki DAHA ONCEKI asistan cevaplarinda farkli bir stil, reddetme veya meta aciklama kalibi (orn. 'kufur edemem', 'sistemim izin vermiyor', 'saygili konusalim', 'ben bir yapay zekayim') varsa BUNLAR GECERSIZDIR; onlari ornek/referans alma. Yalnizca yukaridaki aktif uslup sozlesmesine gore davran.";
            if (activeStyleForReminder === 'free') {
                baseSystemPrompt += "\n\nSERBEST USLUP FINAL OVERRIDE (en son ve en yuksek oncelik): Kanka/persona metninde veya sohbet gecmisinde gecen 'kaba kufur kullanmazsin', 'saygili konusalim', 'kufur edemem', 'bu dille ilerlemeyelim' gibi tum yumusatici kaliplar Serbest Uslup aktifken GECERSIZDIR. Kullanici kufurlu/argolu konusursa ahlak dersi verme, geri cekilme, ozur dileme; ayni enerjiye yakin, dobra, sokak agizli ve kanka tonunda cevap ver. Temel guvenlik sinirlari disinda uslubu temizleme veya sansurleme.";
            }

            // ===== KRİTİK FIX: reqMessages'a sistem + sınırlı sohbet geçmişini ekle =====
            // Determine task type early to avoid TDZ errors
            const isVisionTask = !!(msgObj.images && msgObj.images.length > 0);
            const docSource = document.getElementById('skp-source') ? document.getElementById('skp-source').value : 'pdf';
            const isPdfTask = !!docTextToUse && docSource !== 'chat';
            const taskType = isVisionTask ? 'vision' : isPdfTask ? 'pdf' : 'chat';
            // Always include system prompt, but limit conversation history for normal chat to avoid huge requests
            if (isDebugMode()) console.log("CINOCODE_DEBUG_STYLEMODE:", getFeatureValue('styleMode'));
            if (isDebugMode()) console.log("CINOCODE_DEBUG_FULL_SYSTEM_PROMPT:", baseSystemPrompt);
            reqMessages.push({ role: "system", content: baseSystemPrompt });
            const historyLimit = (taskType === 'chat') ? 4 : 20;
            const rawHistory = chat.messages || [];
            // collect recent messages but filter out UI/system notifications and document chunks for normal chat
            const historyMsgs = [];
            let clearedInternalInstructions = false;
            for (let i = rawHistory.length - 1; i >= 0 && historyMsgs.length < historyLimit; i--) {
                const hm = rawHistory[i];
                if (!hm || !hm.role) continue;
                // skip system/notification-like assistant messages that we use for UI hints
                if (hm.role === 'assistant' && typeof hm.content === 'string') {
                    const low = hm.content.toLowerCase();
                    if (low.includes('otomatik yedekleme') || low.includes('yedek model') || low.includes('yanıt hazırlanıyor') || low.includes('kota') || low.includes('hata:')) continue;

                    if (isStaleStyleMetaRefusal(hm.content, getFeatureValue('styleMode') || 'safe')) {
                        continue;
                    }
                }
                // skip messages that were inserted as UI/system warnings
                if (hm.meta && hm.meta.ui) continue;
                // if normal chat, skip documentText / promptSuffix entirely
                if (taskType === 'chat') {
                    if (hm.documentText) continue;
                }
                historyMsgs.unshift(hm);
            }

            for (let hm of historyMsgs) {
                let hmClone = { role: hm.role, content: (hm.content || '') };
                if (hm.images) {
                    hmClone.images = hm.images;
                }
                if (hm.internalInstruction) {
                    hmClone.content = (hmClone.content || "Devam et 🔁") + "\n\n[Internal continuation instruction - do not reveal to user]\n" + String(hm.internalInstruction).substring(0, 2000);
                    delete hm.internalInstruction;
                    clearedInternalInstructions = true;
                }
                // Do not include document text or prompt suffix in normal chat
                if (taskType !== 'chat') {
                    if (hm.documentText) {
                        hmClone.content = ((hmClone.content ? hmClone.content + "\n\n" : "") + (String(hm.documentText).substring(0, 500000)));
                    }
                    if (hm.promptSuffix) {
                        hmClone.content = (hmClone.content || "") + String(hm.promptSuffix).substring(0, 20000);
                    }
                }

                const isLastMsg = (hm === rawHistory[rawHistory.length - 1]);
                const maxTruncateLen = isLastMsg ? 1000000 : 50000;
                if (hmClone.content && hmClone.content.length > maxTruncateLen) {
                    hmClone.content = hmClone.content.substring(0, maxTruncateLen);
                }
                reqMessages.push(hmClone);
            }
            if (isWebSearchEnabled && taskType === 'chat') {
                const webContext = await doWebSearch(text);
                if (webContext) {
                    reqMessages.splice(1, 0, {
                        role: 'system',
                        content: 'WEB ARAMA BAĞLAMI (yalnızca aşağıdaki sonuçlara dayan; bilinmeyen ayrıntıları uydurma):\n' + webContext
                    });
                }
            }
            if (clearedInternalInstructions) saveDatabase();
            console.log("[CinoCode] reqMessages dolduruldu:", reqMessages.length, "mesaj");

            function parseModelLabel(label) {
                const normalized = String(label || '').trim();
                const lower = normalized.toLowerCase();
                if (PROXY_CLOUD_MODELS.includes(lower)) {
                    return { provider: lower, modelId: lower, displayLabel: normalized };
                }
                const providerMatch = normalized.match(/(?:[-:])(openai|cerebras|deepseek|mistral|openrouter|gemini|groq|fireworks|together|nvidia|xai|anthropic)(?:\b|$)/i);
                const provider = providerMatch ? providerMatch[1].toLowerCase() : null;
                const modelId = provider ? normalized.replace(new RegExp(`(?:[-:])${provider}(?:\b|$)`, 'i'), '').trim() : normalized;
                return { provider, modelId, displayLabel: normalized };
            }

            function isProxyCloudProvider(provider) {
                return PROXY_CLOUD_MODELS.includes(provider);
            }

            // taskType and related flags computed earlier above the reqMessages builder

            function getProviderApiKey(provider) {
                if (!provider) return "";
                const keyStr = (localStorage.getItem(provider + '_api_key') || "").trim();
                if (!keyStr) return "";
                const keys = keyStr.split(',').map(k => k.trim()).filter(Boolean);
                return keys.length ? keys[Math.floor(Math.random() * keys.length)] : "";
            }

            function hasProviderApiKey(provider) {
                if (!provider) return false;
                if (isProxyCloudProvider(provider)) return true;
                return !!getProviderApiKey(provider);
            }

            function getRequestTimeoutMs() {
                if (taskType === 'vision') return 50000;
                if (taskType === 'pdf') return 58000;
                if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.long) return 58000;
                if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.detailed) return 52000;
                if (responseMaxTokens >= RESPONSE_LENGTH_TOKEN_LIMITS.normal) return 42000;
                return 30000;
            }

            // Model cooldowns (store in localStorage to persist across reloads)
            function getCooldowns() {
                try { return JSON.parse(localStorage.getItem('cinocode_model_cooldowns') || '{}'); } catch(e) { return {}; }
            }
            function setCooldown(modelId, ttlMs) {
                const cds = getCooldowns();
                cds[modelId] = Date.now() + ttlMs;
                localStorage.setItem('cinocode_model_cooldowns', JSON.stringify(cds));
            }
            function isModelOnCooldown(modelId) {
                if (!modelId) return false;
                const cds = getCooldowns();
                const until = cds[modelId];
                if (!until) return false;
                if (Date.now() > until) {
                    // expired
                    delete cds[modelId];
                    localStorage.setItem('cinocode_model_cooldowns', JSON.stringify(cds));
                    return false;
                }
                return true;
            }

            function isVisionModel(modelValue) {
                if (!modelValue) return false;
                const v = modelValue.toLowerCase();
                return v.includes('vision') || v.includes('scout') || v.includes('llava') || v.includes('nvidia') || v.includes('vision-instruct');
            }

            function isVisionRouteModel(modelValue) {
                if (!modelValue) return false;
                const parsed = parseModelLabel(modelValue);
                if (parsed && isProxyCloudProvider(parsed.provider) && ['openai', 'gemini', 'openrouter', 'groq', 'anthropic'].includes(parsed.provider)) return true;
                return isVisionModel(modelValue);
            }

            let fallbackQueue = [selectedModel];

            // ===== AI ROUTER — Model Sağlık Takip Sistemi =====
            // Her modelin başarı/başarısızlık geçmişini localStorage'da puan olarak tutar.
            // Başarılı istek → +2 puan (maks 10). Başarısız istek → -3 puan (min 0).
            // Fallback kuyruğu puana göre yeniden sıralanır.
            const MODEL_HEALTH_KEY = 'cinocode_model_health';
            function getModelHealth() {
                try { return JSON.parse(localStorage.getItem(MODEL_HEALTH_KEY) || '{}'); } catch(e) { return {}; }
            }
            function setModelScore(modelId, delta) {
                const h = getModelHealth();
                h[modelId] = Math.max(0, Math.min(10, (h[modelId] ?? 5) + delta));
                localStorage.setItem(MODEL_HEALTH_KEY, JSON.stringify(h));
            }
            function getModelScore(modelId) {
                return getModelHealth()[modelId] ?? 5; // Varsayılan: 5 (nötr)
            }

            // Fallback (Yedekleme) Kuyruğu Hazırlığı
            const hasAttachments = isVisionTask;
            const isPdfCoaching = isAkademikKocNow || (document.getElementById('personaSelect') && document.getElementById('personaSelect').value === 'dil_kocu');
            const visionModels = [
                "openai",
                "gemini",
                "groq",
                "openrouter",
                "anthropic",
                "nvidia/nemotron-nano-12b-v2-vl-nvidia"
            ];
            const normalTextModels = [
                "openai", "cerebras", "deepseek", "mistral", "openrouter", "gemini", "groq",
                "qwen2.5:14b", "qwen2.5"
            ];
            const pdfTextModels = [
                "gemini", "openai", "deepseek", "cerebras", "mistral", "openrouter",
                "qwen2.5:14b", "qwen2.5"
            ];

            if (hasAttachments) {
                // Vision task: only try vision-capable proxy/providers in a stable order.
                fallbackQueue = isVisionRouteModel(selectedModel)
                    ? [...new Set([selectedModel, ...visionModels.filter(m => m !== selectedModel)])]
                    : visionModels;
            } else if (isPdfTask || isPdfCoaching) {
                // PDF task: use pdfTextModels order
                fallbackQueue = [...new Set([selectedModel, ...pdfTextModels.filter(m => m !== selectedModel)])];
            } else {
                if (taskType === 'chat') {
                    const chatFallback = [
                        selectedModel,
                        "gemini",
                        "groq",
                        "openrouter",
                        "openai"
                    ];
                    fallbackQueue = [...new Set(chatFallback.filter(Boolean))];
                } else {
                    const chatPriority = [];
                    if (window.lastWorkingModel && window.lastWorkingProvider && !isModelOnCooldown(window.lastWorkingModel)) {
                        const lastLabel = window.lastWorkingModel + (window.lastWorkingProvider ? `-${window.lastWorkingProvider}` : '');
                        const pInfo = parseModelLabel(lastLabel);
                        if (!pInfo.provider || hasProviderApiKey(pInfo.provider)) chatPriority.push(lastLabel);
                    }
                    if (selectedModel) chatPriority.push(selectedModel);
                    const canonical = [
                        "openai",
                        "gemini",
                        "groq"
                    ];
                    fallbackQueue = [...new Set([...chatPriority, ...canonical])];
                }
            }

            // Filter out models that lack provider key, are on cooldown, or are vision models for chat
            const availableModels = fallbackQueue.filter(modelValue => {
                const parsed = parseModelLabel(modelValue);
                if (!parsed) return false;
                if (isModelOnCooldown(parsed.modelId)) return false;
                if (taskType === 'vision' && !isVisionRouteModel(modelValue)) return false;
                if (taskType === 'chat' && isVisionModel(parsed.modelId)) return false;
                if (parsed.provider && !hasProviderApiKey(parsed.provider)) return false;
                return true;
            });
            if (availableModels.length === 0) {
                if (taskType === 'vision') {
                    throw new Error("Görsel analizi için vision destekli model bulunamadı veya provider routing başarısız oldu. Gemini/OpenRouter/Groq Vision yapılandırmasını ve seçili vision modelini kontrol edin.");
                }
                throw new Error("Hiçbir uygun model denenemedi. Cloud sağlayıcılar Netlify Environment Variables ile yapılandırılmalıdır.");
            }
            fallbackQueue = availableModels;
            const responseMaxTokens = getResponseMaxTokens(text, taskType);

            let response = null;
            // Set generation lock and UI state
            window.isGenerating = true;
            setGenerationUiBusy(true);
            try { document.getElementById('userInput').disabled = true; } catch(e) {}
            // Tek typing indicator mesaj akışındaki bot placeholder'ıdır; floating status oluşturma.
            const triedModels = new Set();
            let lastErrorMessage = null;
            let lastErrorDetails = null;

            let fallbackNote = "";
            const firstChoiceModel = fallbackQueue[0];
            const firstChoiceInfo = firstChoiceModel ? parseModelLabel(firstChoiceModel) : null;

            // DURUM A: Kullanicinin acikca sectigi model (Otomatik degil), API anahtari yok /
            // cooldown / vision-uyumsuzluk nedeniyle kuyruktan DONGU BASLAMADAN elenip hic
            // denenmediyse, kullanici hangi modelin gercekten cevapladigini bilmiyor. Bunu
            // durustce bildir ("Grok sectin ama aslinda X cevapladi" karisikligini bitirir).
            if (selectedModel && selectedModel !== 'auto' && !fallbackQueue.includes(selectedModel)) {
                const droppedInfo = parseModelLabel(selectedModel);
                const droppedLabel = (droppedInfo && droppedInfo.displayLabel) || selectedModel;
                const droppedProv = droppedInfo && droppedInfo.provider;
                const reason = (droppedProv && !hasProviderApiKey(droppedProv)) ? 'API anahtarı tanımlı değil' : 'şu an kullanılamıyor';
                const answeredLabel = firstChoiceInfo ? firstChoiceInfo.displayLabel : firstChoiceModel;
                fallbackNote = `<div class="fallback-note" style="font-size:11px; color:#f38ba8; margin-top:8px; padding:6px; background:rgba(243, 139, 168, 0.1); border-radius: var(--cc-radius); border-left:3px solid #f38ba8;">ℹ️ Seçtiğin <b>${droppedLabel}</b> ${reason}; bu yanıt <b>${answeredLabel}</b> ile üretildi.</div>`;
            }

            for (let i = 0; i < fallbackQueue.length; i++) {
                const currentTryModel = fallbackQueue[i];
                if (triedModels.has(currentTryModel)) continue;
                triedModels.add(currentTryModel);
                const currentTryInfo = parseModelLabel(currentTryModel);
                const isProxyCloud = isProxyCloudModel(currentTryModel);
                isGroq = currentTryInfo.provider === "groq" && !isProxyCloud;
                isGemini = false;
                isNvidia = currentTryInfo.provider === "nvidia";
                isOpenRouter = currentTryInfo.provider === "openrouter" && !isProxyCloud;
                isXai = currentTryInfo.provider === "xai" && !isProxyCloud;
                actualModel = currentTryInfo.modelId;
                const displayLabel = currentTryInfo.displayLabel;
                const provider = currentTryInfo.provider;
                const providerKey = provider ? (isProxyCloud ? 'proxy' : getProviderApiKey(provider)) : "";
                if (provider && !providerKey) {
                    console.warn(`[AI Router] API anahtarı yok, atlanıyor: ${currentTryModel}`);
                    continue;
                }

                const timeoutMs = getRequestTimeoutMs();
                const cleanModelName = actualModel.split("/").pop();
                if (i > 0) {

                    const existingWarning = messagesDiv.querySelector('.auto-fallback-warning');
                    if (existingWarning) {
                        existingWarning.innerHTML = `🚨 <b>Otomatik Yedekleme:</b> Bir sonraki model <b>${cleanModelName}</b> deneniyor...`;
                    } else {
                        const warningHtml = `<div class="message bot-message auto-fallback-warning" style="background: rgba(255, 150, 0, 0.1); border-left: 3px solid orange; padding: 10px; margin-bottom: 10px; border-radius: var(--cc-radius); font-size: 0.9em; color: var(--text-color);">🚨 <b>Otomatik Yedekleme:</b> Bir sonraki model <b>${cleanModelName}</b> deneniyor...</div>`;
                        messagesDiv.insertAdjacentHTML('beforeend', warningHtml);
                        messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    }

                }

                let fetchUrl, fetchOptions;

                if (isProxyCloud) {
                    fetchUrl = '/.netlify/functions/ai-chat';
                    fetchOptions = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            messages: reqMessages,
                            taskType,
                            selectedModel: currentTryInfo.provider,
                            temperature: 0.7,
                            maxTokens: responseMaxTokens
                        })
                    };
                } else if (isNvidia) {
                    // --- NVIDIA NIM (OpenAI uyumlu, görsel destekli) ---
                    const userNvidiaKey = (localStorage.getItem('nvidia_api_key') || "").trim();
                    fetchUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

                    let nvidiaMessages = [];
                    for (let msg of reqMessages) {
                        if (msg.role === 'system') {
                            nvidiaMessages.push({ role: 'system', content: msg.content });
                            continue;
                        }
                        if (msg.images && msg.images.length > 0) {
                            let contentParts = [];
                            if (msg.content) contentParts.push({ type: 'text', text: msg.content });
                            for (let img of msg.images) {
                                contentParts.push({ type: 'image_url', image_url: { url: img } });
                            }
                            nvidiaMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: contentParts });
                        } else {
                            nvidiaMessages.push({ role: msg.role === 'assistant' ? 'assistant' : (msg.role === 'system' ? 'system' : 'user'), content: msg.content || '' });
                        }
                    }

                    fetchOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${userNvidiaKey}`
                        },
                        body: JSON.stringify({
                            model: actualModel,
                            messages: nvidiaMessages,
                            max_tokens: responseMaxTokens,
                            stream: true
                        })
                    };
                } else if (isOpenRouter) {
                    // --- OPENROUTER (OpenAI uyumlu, ücretsiz vision modelleri) ---
                    const userOrKey = (localStorage.getItem('openrouter_api_key') || "").trim();
                    fetchUrl = "https://openrouter.ai/api/v1/chat/completions";

                    let orMessages = [];
                    for (let msg of reqMessages) {
                        if (msg.images && msg.images.length > 0) {
                            let contentParts = [];
                            if (msg.content) contentParts.push({ type: 'text', text: msg.content });
                            for (let img of msg.images) {
                                contentParts.push({ type: 'image_url', image_url: { url: img } });
                            }
                            orMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: contentParts });
                        } else {
                            orMessages.push({ role: msg.role, content: msg.content || '' });
                        }
                    }

                    fetchOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${userOrKey}`,
                            'HTTP-Referer': window.location.origin || 'https://cinocode.app',
                            'X-Title': 'CinoCode AI'
                        },
                        body: JSON.stringify({
                            model: actualModel,
                            messages: orMessages,
                            max_tokens: responseMaxTokens,
                            stream: true
                        })
                    };
                } else if (isXai) {
                    // --- xAI / GROK (OpenAI-compatible, direct API) ---
                    const userXaiKey = (localStorage.getItem('xai_api_key') || "").trim();
                    if (!userXaiKey) {
                        lastErrorMessage = "xAI API anahtarı eklenmemiş. Ayarlar > API Anahtarları bölümünden ekleyebilirsin.";
                        lastErrorDetails = { provider: 'xai', model: actualModel, timeout: false, status: 0, errorBody: 'no key', endpoint: 'https://api.x.ai/v1/chat/completions', taskType };
                        continue;
                    }
                    fetchUrl = "https://api.x.ai/v1/chat/completions";

                    let xaiMessages = [];
                    for (let msg of reqMessages) {
                        xaiMessages.push({ role: msg.role === 'assistant' ? 'assistant' : (msg.role === 'system' ? 'system' : 'user'), content: msg.content || '' });
                    }

                    fetchOptions = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${userXaiKey}`
                        },
                        body: JSON.stringify({
                            model: actualModel,
                            messages: xaiMessages,
                            max_tokens: responseMaxTokens,
                            stream: true
                        })
                    };
                } else if (isGroq) {
                    // --- GROQ ---
                    const userGroqKey = getRandomApiKey(localStorage.getItem('groq_api_key'));
                    fetchUrl = "https://api.groq.com/openai/v1/chat/completions";

                    let groqModel = actualModel;
                    let hasImages = false;
                    let tempReqMessages = JSON.parse(JSON.stringify(reqMessages));

                    for (let msg of tempReqMessages) {
                        if (msg.images && msg.images.length > 0) {
                            hasImages = true;
                            let textContent = msg.content;
                            let imgSrc = msg.images[0];
                            msg.content = [
                                { type: "text", text: textContent },
                                { type: "image_url", image_url: { url: imgSrc } }
                            ];
                            delete msg.images;
                        }
                    }

                    if (hasImages && !groqModel.includes("scout")) {
                        groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
                    }

                    fetchOptions = {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${userGroqKey}`
                        },
                        body: JSON.stringify({
                            model: groqModel,
                            messages: tempReqMessages,
                            max_tokens: responseMaxTokens,
                            stream: true
                        })
                    };
                } else {
                    // --- YEREL OLLAMA ---
                    fetchUrl = getOllamaUrl() + "/api/chat";
                    fetchOptions = {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: actualModel,
                            messages: reqMessages,
                            stream: true,
                            keep_alive: "1h",
                            options: { num_predict: responseMaxTokens }
                        })
                    };
                }

                try {
                    if (isProxyCloud) {
                        const controller = new AbortController();
                        window.activeGenerationController = controller;
                        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                        fetchOptions.signal = controller.signal;
                        let proxyResponse;
                        try {
                            proxyResponse = await fetch(fetchUrl, fetchOptions);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        const jsonData = await proxyResponse.json().catch(() => null);
                        if (!proxyResponse.ok || !jsonData || !jsonData.ok) {
                            lastErrorMessage = jsonData?.error
                                || (proxyResponse.status === 401 || proxyResponse.status === 403 ? 'API anahtarı geçersiz veya yetkisiz.'
                                : proxyResponse.status === 429 ? 'Kota/rate limit doldu, yedek sağlayıcı deneniyor.'
                                : proxyResponse.status === 413 ? 'İstek çok büyük.'
                                : `Bulut proxy hatası oluştu (${currentTryInfo.provider || actualModel}).`);
                            if (window.location.protocol === "file:") {
                                lastErrorMessage += " Cloud modeller file:// üzerinden çalışmayabilir. Netlify linki veya local dev server kullanın.";
                            }
                            lastErrorDetails = { provider: currentTryInfo.provider, model: actualModel, timeout: false, status: proxyResponse.status, errorBody: jsonData?.error || '', endpoint: fetchUrl, taskType };
                            setModelScore(currentTryModel, -3);
                            continue;
                        }

                        setModelScore(currentTryModel, +2);
                        if (i > 0 && firstChoiceInfo) {
                            fallbackNote = `<div class="fallback-note" style="font-size:11px; color:#f38ba8; margin-top:8px; padding:6px; background:rgba(243, 139, 168, 0.1); border-radius: var(--cc-radius); border-left:3px solid #f38ba8;">⚡ <b>Otomatik Geçiş:</b> ${firstChoiceInfo.displayLabel} bağlantısı başarısız oldu. Yanıt <b>${currentTryInfo.displayLabel}</b> ile üretildi.</div>`;
                        } else {
                            document.getElementById("modelSelect").value = currentTryModel;
                        }
                        window.lastWorkingProvider = currentTryInfo.provider;
                        window.lastWorkingModel = actualModel;
                        window.lastWorkingModelAt = Date.now();

                        const botReply = sanitizeAssistantOutput(String(jsonData.content || '').trim());
                        let parsedAction = null;
                        try {
                          let jsonStr = botReply.trim();
                          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                          if (codeBlockMatch) {
                              jsonStr = codeBlockMatch[1];
                          } else {
                              const firstBrace = jsonStr.indexOf('{');
                              const lastBrace = jsonStr.lastIndexOf('}');
                              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                                  jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                              }
                          }
                          const obj = JSON.parse(jsonStr);
                          if (obj && typeof obj === 'object' && obj.action) {
                            if (obj.action === 'dalle.text2im' || obj.action === 'generate_image') {
                              if (typeof obj.action_input === 'string') {
                                try {
                                  const inner = JSON.parse(obj.action_input);
                                  if (inner && inner.prompt) obj.prompt = inner.prompt;
                                } catch (_) { }
                                if (!obj.prompt) obj.prompt = obj.action_input;
                              } else if (obj.action_input && typeof obj.action_input === 'object') {
                                if (obj.action_input.prompt) obj.prompt = obj.action_input.prompt;
                              }
                              obj.action = 'generate_image';
                            }
                            parsedAction = obj;
                          }
                        } catch (e) {
                          // Not valid JSON, ignore
                        }

                        if (parsedAction && parsedAction.action === 'generate_image' && parsedAction.prompt) {
                          // Use existing image generation flow by inserting placeholder
                          const cleanPrompt = buildCleanMediaPrompt(parsedAction.prompt, "image");
                          let imgContent = `[GENERATE_IMAGE: ${cleanPrompt}]`;
                          if (fallbackNote) {
                              imgContent += "\n\n" + fallbackNote;
                          } else if (typeof actualModelForAuto !== 'undefined' && actualModelForAuto) {
                              imgContent += "\n\n<div style='font-size:10px; color:var(--cc-text-muted); margin-top:8px;'>⚡ Model: " + actualModelForAuto + "</div>";
                          }
                          chat.messages.push({ role: 'assistant', content: imgContent });
                          // Render placeholder now
                          document.getElementById(botId).innerHTML = renderContentWithImages(imgContent, true);
                          attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                          scrollToBottom();
                          // Skip normal rendering below
                          return;
                        }

                        // Existing rendering for plain text responses
                        document.getElementById(botId).removeAttribute('data-typing-indicator');
                        document.getElementById(botId).innerHTML = renderContentWithImages(botReply, true);
                        scrubPlaceholderErrorImages(document.getElementById(botId));
                        addCopyButtons(document.getElementById(botId));
                        appendSmartSuggestions(botId, botReply, text);
                        if (fallbackNote) {
                            botReply += "\n\n" + fallbackNote;
                        } else if (typeof actualModelForAuto !== 'undefined' && actualModelForAuto) {
                            botReply += "\n\n<div style='font-size:10px; color:var(--cc-text-muted); margin-top:8px;'>⚡ Model: " + actualModelForAuto + "</div>";
                        }
                        recordDilKocuProgressFromResponse(botReply);
                        chat.messages.push({ role: 'assistant', content: botReply });
                        attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                        chat.updatedAt = Date.now();
                        saveDatabase();
                        ensureChatTitleFromAssistantResponse(botReply);
                        const proxyFinishReason = jsonData.finish_reason || jsonData.finishReason || jsonData.stopReason || jsonData.stop_reason || jsonData.reason;
                        if (isLimitFinishReason(proxyFinishReason)) {
                            appendContinuationCard(botId, "Cevap sınırına ulaşıldı. Devamını ister misin?");
                        } else if (isLikelyIncompleteAnswer(botReply)) {
                            appendContinuationCard(botId, "Yanıt yarıda kesilmiş olabilir. Devam ettirmek ister misin?");
                        }
                        scrollToBottom();
                        setTimeout(scrollToBottom, 300);
                        speakText(sanitizeAssistantOutput(botReply).substring(0, 500));

                        cleanupGenerationUi();
                        return;
                    } else if (isNvidia || isOpenRouter || isGroq || isXai) {
                        const controller = new AbortController();
                        window.activeGenerationController = controller;
                        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                        fetchOptions.signal = controller.signal;

                        let streamResponse;
                        try {
                            streamResponse = await fetch(fetchUrl, fetchOptions);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        if (!streamResponse.ok) {
                            const errText = await streamResponse.text().catch(() => "");
                            lastErrorMessage = streamResponse.status === 401 || streamResponse.status === 403
                                ? "API key geçersiz olabilir."
                                : streamResponse.status === 429
                                    ? "Kota/limit dolmuş olabilir."
                                    : `Model hatası: ${streamResponse.status}`;
                            lastErrorDetails = { provider: provider || 'unknown', model: actualModel, timeout: false, status: streamResponse.status, errorBody: errText, endpoint: fetchUrl, taskType };
                            console.error(lastErrorDetails);
                            setModelScore(currentTryModel, -3); // AI Router: HTTP hatası
                            continue;
                        }

                        setModelScore(currentTryModel, +2); // AI Router: başarı
                        if (i > 0 && firstChoiceInfo) {
                            fallbackNote = `<div class="fallback-note" style="font-size:11px; color:#f38ba8; margin-top:8px; padding:6px; background:rgba(243, 139, 168, 0.1); border-radius: var(--cc-radius); border-left:3px solid #f38ba8;">⚡ <b>Otomatik Geçiş:</b> ${firstChoiceInfo.displayLabel} bağlantısı başarısız oldu. Yanıt <b>${currentTryInfo.displayLabel}</b> ile üretildi.</div>`;
                        } else {
                            document.getElementById("modelSelect").value = currentTryModel;
                        }
                        // mark last working early so next message can prefer it
                        window.lastWorkingProvider = provider || window.lastWorkingProvider;
                        window.lastWorkingModel = actualModel;
                        window.lastWorkingModelAt = Date.now();
                        response = streamResponse;
                        break;
                    } else {
                        const controller = new AbortController();
                        window.activeGenerationController = controller;
                        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                        fetchOptions.signal = controller.signal;

                        let streamResponse;
                        try {
                            streamResponse = await fetch(fetchUrl, fetchOptions);
                        } finally {
                            clearTimeout(timeoutId);
                        }

                        if (!streamResponse.ok) {
                            const errText = await streamResponse.text().catch(() => "");
                            lastErrorMessage = streamResponse.status === 401 || streamResponse.status === 403
                                ? "API key geçersiz olabilir."
                                : streamResponse.status === 429
                                    ? "Kota/limit dolmuş olabilir."
                                    : `Model hatası: ${streamResponse.status}`;
                            lastErrorDetails = { provider: 'ollama', model: actualModel, timeout: false, status: streamResponse.status, errorBody: errText, endpoint: fetchUrl, taskType };
                            setModelScore(currentTryModel, -3);
                            continue;
                        }

                        setModelScore(currentTryModel, +2);
                        if (i > 0 && firstChoiceInfo) {
                            fallbackNote = `<div class="fallback-note" style="font-size:11px; color:#f38ba8; margin-top:8px; padding:6px; background:rgba(243, 139, 168, 0.1); border-radius: var(--cc-radius); border-left:3px solid #f38ba8;">⚡ <b>Otomatik Geçiş:</b> ${firstChoiceInfo.displayLabel} bağlantısı başarısız oldu. Yanıt <b>${currentTryInfo.displayLabel}</b> ile üretildi.</div>`;
                        } else {
                            document.getElementById("modelSelect").value = currentTryModel;
                        }
                        window.lastWorkingProvider = 'ollama';
                        window.lastWorkingModel = actualModel;
                        window.lastWorkingModelAt = Date.now();
                        response = streamResponse;
                        break;
                    }
                } catch (fetchErr) {
                    if (fetchErr.name === 'AbortError' && window.generationStopRequested) {
                        throw new Error("Yanıt durduruldu.");
                    }
                    const timedOut = fetchErr.name === 'AbortError';
                    lastErrorMessage = timedOut ? `Model zaman aşımına uğradı (${provider || actualModel}).` : `Network veya CORS hatası oluştu (${provider || actualModel}).`;
                    if (window.location.protocol === "file:") {
                        lastErrorMessage += " Cloud modeller file:// üzerinden çalışmayabilir. Netlify linki veya local dev server kullanın.";
                    }
                    lastErrorDetails = { provider: provider || 'unknown', model: actualModel, timeout: timedOut, status: timedOut ? 'timeout' : 'network', errorBody: fetchErr.message, endpoint: fetchUrl, taskType };
                    console.error(lastErrorDetails);
                    // If timeout, set cooldown for this model for 5 minutes
                    if (timedOut) setCooldown(actualModel, 5 * 60 * 1000);
                    setModelScore(currentTryModel, -3); // AI Router: başarısızlık
                    continue;
                }
            }

            if (!response) {
                removeImage();
                const fallbackCandidate = fallbackQueue.find(modelValue => {
                    const provider = parseModelLabel(modelValue).provider;
                    return !provider || hasProviderApiKey(provider);
                });
                if (taskType === 'vision') {
                    throw new Error(lastErrorMessage || "Görsel analizi için vision destekli model bulunamadı veya provider routing başarısız oldu. Gemini/OpenRouter/Groq Vision yapılandırmasını ve seçili vision modelini kontrol edin.");
                }
                if (!fallbackCandidate) {
                    throw new Error("Hiçbir uygun model denenemedi. Lütfen yapay zeka API anahtarlarınızı kontrol edin.");
                }
                throw new Error(lastErrorMessage || `Tüm yapay zeka yedek modelleri denendi ancak yanıt alınamadı. Cloud sağlayıcılar Netlify Environment Variables ile yapılandırılmalıdır.`);
            }

            removeImage(); // Fotoğraf gönderildikten sonra temizle

            if (!response.ok) {
                const errorText = await response.text();
                // release lock before throwing
                cleanupGenerationUi();
                throw new Error(`API Hatası (${response.status}): ` + errorText);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let botReply = "";
            let sentenceBuffer = "";
            let streamBuffer = "";
            let finishReason = "";
            let streamEndedCleanly = false;
            let streamReadFailed = false;

            function handleStreamWord(word) {
                if (!word) return;
                botReply += word;
                sentenceBuffer += word;

                let match = sentenceBuffer.match(/([^.!?\n]+[.!?\n]+)(\s*)/);
                if (match) {
                    let completeSentence = match[1];
                    sentenceBuffer = sentenceBuffer.substring(match[1].length);
                    let textToSpeak = sanitizeAssistantOutput(completeSentence).trim();
                    // Kodu seslendirmeyi engelle (TTS motorunu çökertmemesi için)
                    if (textToSpeak.length > 1 && !textToSpeak.includes("```") && !textToSpeak.startsWith("<") && !textToSpeak.startsWith("}")) {
                        speakText(textToSpeak);
                    }
                }

                document.getElementById(botId).innerHTML = renderContentWithImages(botReply, true);
                scrubPlaceholderErrorImages(document.getElementById(botId));
                scrollToBottom();
            }

            function processStreamLine(line) {
                if (line.trim() === "") return;

                let word = null;
                if (isGroq || isNvidia || isOpenRouter || isXai) {
                    if (line.trim() === "data: [DONE]") {
                        streamEndedCleanly = true;
                        return;
                    }
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.substring(6));
                            const choice = data.choices && data.choices[0];
                            if (choice && choice.finish_reason) {
                                finishReason = choice.finish_reason;
                                streamEndedCleanly = true;
                            }
                            if (choice && choice.delta && choice.delta.content) {
                                word = choice.delta.content;
                            }
                        } catch (e) { console.error("OpenAI format parse error", e); }
                    }
                } else {
                    try {
                        const data = JSON.parse(line);
                        if (data.done) {
                            streamEndedCleanly = true;
                            finishReason = data.done_reason || data.reason || finishReason;
                        }
                        if (data.message && data.message.content) {
                            word = data.message.content;
                        }
                    } catch (e) { console.error("Ollama JSON parse error", e); }
                }

                handleStreamWord(word);
            }

            try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (streamBuffer.trim()) {
                        processStreamLine(streamBuffer);
                        streamBuffer = "";
                    }
                    let textToSpeak = sanitizeAssistantOutput(sentenceBuffer).trim();
                    if (textToSpeak.length > 0) {
                        speakText(textToSpeak);
                    }
                    break;
                }

                streamBuffer += decoder.decode(value, { stream: true });
                const lines = streamBuffer.split("\n");
                streamBuffer = lines.pop();

                for (const line of lines) {
                    processStreamLine(line);
                }
            }
            } catch (streamErr) {
                if (window.generationStopRequested || streamErr.name === 'AbortError') {
                    throw new Error("Yanıt durduruldu.");
                }
                streamReadFailed = true;
                console.warn("Stream yarıda kesilmiş olabilir:", streamErr);
            }

            botReply = sanitizeAssistantOutput(botReply);
            document.getElementById(botId).removeAttribute('data-typing-indicator');

            let parsedAction = null;
            try {
                const trimmed = botReply.trim();
                if (trimmed.startsWith('{')) {
                    const obj = JSON.parse(trimmed);
                    if (obj && typeof obj === 'object' && obj.action) {
                        if (obj.action === 'dalle.text2im') {
                            if (typeof obj.action_input === 'string') {
                                try {
                                    const inner = JSON.parse(obj.action_input);
                                    if (inner && inner.prompt) obj.prompt = inner.prompt;
                                } catch (_) { }
                                if (!obj.prompt) obj.prompt = obj.action_input;
                            } else if (obj.action_input && typeof obj.action_input === 'object') {
                                if (obj.action_input.prompt) obj.prompt = obj.action_input.prompt;
                            }
                            obj.action = 'generate_image';
                        }
                        parsedAction = obj;
                    }
                }
            } catch (e) { }

            if (parsedAction && parsedAction.action === 'generate_image' && parsedAction.prompt) {
                const cleanPrompt = buildCleanMediaPrompt(parsedAction.prompt, "image");
                let imgContent = `[GENERATE_IMAGE: ${cleanPrompt}]`;
                if (fallbackNote) {
                    imgContent += "\n\n" + fallbackNote;
                } else if (typeof actualModelForAuto !== 'undefined' && actualModelForAuto) {
                    imgContent += "\n\n<div style='font-size:10px; color:var(--cc-text-muted); margin-top:8px;'>⚡ Model: " + actualModelForAuto + "</div>";
                }
                chat.messages.push({ role: 'assistant', content: imgContent });
                document.getElementById(botId).innerHTML = renderContentWithImages(imgContent, true);
                attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                scrollToBottom();
                chat.updatedAt = Date.now();
                saveDatabase();
                if (typeof applyShowMoreLogic === 'function') applyShowMoreLogic(document.getElementById(botId));
                return;
            }
            document.getElementById(botId).innerHTML = renderContentWithImages(botReply, true);
            scrubPlaceholderErrorImages(document.getElementById(botId));
            addCopyButtons(document.getElementById(botId));
            appendSmartSuggestions(botId, botReply, text);
            appendDynamicContinuations(botId, fetchUrl, fetchOptions);

            // Intent ve prompt kontrol mekanizması doğrulaması
            const lowerText = text.toLocaleLowerCase("tr-TR");

            // Video intent her zaman image intent'ten önce kontrol edilsin.
            let isVideoRequest = !isNegativeIntent && isDirectVideoCreationRequest(text);
            let isImageRequest = !isNegativeIntent && !isVideoRequest && isDirectImageGenerationRequest(text);

            // YAPILACAK B — Ambiguous Prompt Clarify
            if ((isVideoRequest || isImageRequest) && text.trim().split(/\s+/).length <= 2 && /^(kanka çiz|kanka ciz|çiz|ciz|bunu yap|şunu yap|yap|üret|uret|oluştur|olustur)$/i.test(text.trim())) {
                const clarifyMsg = { role: "assistant", content: "Görsel mi istiyorsun, yoksa nasıl yapılacağını anlatmamı mı? Lütfen biraz detay ver kanka." };
                displayMessage(clarifyMsg);
                addMessageToHistory(clarifyMsg);
                enableInput();
                removeTypingIndicators();
                return;
            }

            const botHasVideoCode = botReply.toLowerCase().includes("[generate_video");
            const botHasCodeBlock = botReply.includes("```") || botReply.toLowerCase().includes("[generate_code");

            if (botHasCodeBlock) {
                isVideoRequest = false;
                isImageRequest = false;
            }

            if (isVideoRequest && !botHasVideoCode) {
                console.log("Fallback Video trigger activated!");
                const videoId = 'video-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

                // Bot yanıtına video placeholder'ını ekle
                const fallbackContainer = document.createElement("div");
                fallbackContainer.innerHTML = `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: var(--cc-bg-surface); padding: 15px; border-radius: var(--cc-radius); border: 1px solid rgba(255, 255, 255, 0.08);">
                            <div style="color:#f9e2af; font-size: 13px; margin-bottom: 10px;">Bu gerçek video değil; normal sohbet cevabı başarı sayılmadı. Video motoru başlatılıyor.</div>
                            <div style="color: var(--cc-text-primary); font-size: 16px; margin-bottom: 10px;">\u{1F3AC} Ger\u00e7ek video modeli ba\u011fl\u0131 de\u011fil; storyboard/slideshow \u00f6nizlemesi haz\u0131rlan\u0131yor...</div>
                            <div style="background: var(--cc-border); border-radius: var(--cc-radius); height: 20px; overflow: hidden; margin-bottom: 8px;">
                                <div id="${videoId}-progress" style="background: linear-gradient(90deg, var(--cc-accent-brand), #cba6f7); height: 100%; width: 0%; border-radius: var(--cc-radius); transition: width 0.5s ease;"></div>
                            </div>
                            <div id="${videoId}-status" style="color: var(--cc-text-muted); font-size: 13px;">Bu gerçek video değil, storyboard/slideshow taslağıdır.</div>
                        </div>`;
                const botNode = document.getElementById(botId);
                if (botNode) {
                    botNode.innerHTML = "";
                    botNode.appendChild(fallbackContainer);
                }

                // Video motorunu çalıştır (videoQueue ve isVideoGenerating durumunu yönetir)
                setTimeout(() => queueVideoSlideshow(text, videoId), 300);
            }

            let finalCleanText = sanitizeAssistantOutput(botReply);
            let hasVideoFallback = isVideoRequest && !botHasVideoCode;

            if (finalCleanText.trim() === "" && !botHasVideoCode && !hasVideoFallback && !streamReadFailed) {
                const botNode = document.getElementById(botId);
                if (botNode) botNode.remove();
            } else {
                if (hasVideoFallback) {
                    const failMsg = renderMediaErrorMessage("Gerçek video sağlayıcısı yok. Storyboard önizlemesi hazırlandı.");
                    chat.messages.push({ role: "assistant", content: failMsg });
                    attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                } else {
                    if (fallbackNote) {
                        botReply += "\n\n" + fallbackNote;
                    } else if (typeof actualModelForAuto !== 'undefined' && actualModelForAuto) {
                        botReply += "\n\n<div style='font-size:10px; color:var(--cc-text-muted); margin-top:8px;'>⚡ Model: " + actualModelForAuto + "</div>";
                    }
                    recordDilKocuProgressFromResponse(botReply);
                    chat.messages.push({ role: "assistant", content: botReply });
                    attachMsgActionsToBotDiv(botId, chat.messages.length - 1, chat.messages[chat.messages.length - 1]);
                    ensureChatTitleFromAssistantResponse(botReply);
                }
            }

            chat.updatedAt = Date.now();
            saveDatabase();
            if (!hasVideoFallback) {
                if (isLimitFinishReason(finishReason)) {
                    appendContinuationCard(botId, "Cevap sınırına ulaşıldı. Devamını ister misin?");
                } else if (streamReadFailed || !streamEndedCleanly || isLikelyIncompleteAnswer(botReply)) {
                    appendContinuationCard(botId, "Yanıt yarıda kesilmiş olabilir. Devam ettirmek ister misin?");
                }
            }
            if (typeof applyShowMoreLogic === 'function') applyShowMoreLogic(document.getElementById(botId));

            // --- Akıllı Başlık Üretimi ---
            if (chat.messages && chat.messages.length === 2 && !chat.manualTitle && !chat.smartTitleGenerated) {
                try {
                    const summarizePrompt = "Bu konuşmayı en fazla 4 kelimeyle, başlık olarak özetle. Sadece başlığı yaz, başka hiçbir şey yazma, tırnak kullanma.";
                    const getTxt = (c) => typeof c === 'string' ? c : (Array.isArray(c) ? c.map(x=>x.text||"").join(" ") : "Mesaj");
                    const smartMessages = [
                        { role: "user", content: getTxt(chat.messages[0].content) },
                        { role: "assistant", content: getTxt(chat.messages[1].content) },
                        { role: "user", content: summarizePrompt }
                    ];

                    let smartFetchOptions = JSON.parse(JSON.stringify(fetchOptions));
                    if (smartFetchOptions.body) {
                        const bodyObj = JSON.parse(smartFetchOptions.body);
                        bodyObj.messages = smartMessages;
                        bodyObj.stream = false;
                        bodyObj.max_tokens = 20;
                        if (bodyObj.options) bodyObj.options.num_predict = 20;
                        smartFetchOptions.body = JSON.stringify(bodyObj);
                    }

                    chat.smartTitleGenerated = true; // Sadece 1 kere dene

                    fetch(fetchUrl, smartFetchOptions).then(res => res.json()).then(data => {
                        let titleText = "";
                        if (data.choices && data.choices[0] && data.choices[0].message) {
                            titleText = data.choices[0].message.content;
                        } else if (data.message && data.message.content) {
                            titleText = data.message.content;
                        }
                        if (titleText) {
                            titleText = titleText.replace(/["']/g, "").replace(/\n/g, " ").trim();
                            if (titleText && titleText.length < 60) {
                                chat.title = titleText;
                                saveDatabase();
                                renderSidebar();
                            }
                        }
                    }).catch(e => console.error("Smart title error:", e));
                } catch(e) { console.error("Smart title logic error:", e); }
            }
            // Streaming bittikten sonra kesin en alta kay
            scrollToBottom();
            setTimeout(scrollToBottom, 300);
            setTimeout(scrollToBottom, 800);

            // clear generation lock and process pending queue
            cleanupGenerationUi();
            // Clear any pendingMessages queue (queueing disabled in this hotfix)
            try { window.pendingMessages = []; } catch(e) {}

        } catch (error) {
            console.error('sendMessage error:', error);
            if (error && error.message === "Yanıt durduruldu.") {
                try {
                    const botNode = document.getElementById(botId);
                    if (botNode && (!botNode.textContent || botNode.textContent.includes("CinoCode düşünüyor"))) {
                        botNode.innerHTML = "<i>Yanıt durduruldu.</i>";
                    }
                } catch(e) {}
            } else {
                try {
                    const rawMessage = String((error && error.message) || "Bilinmeyen hata");
                    const isTimeout = /zaman aşımı|zaman asimi|timeout|aborted/i.test(rawMessage);
                    const isConfiguration = /api anahtar|environment variables|hiçbir uygun model|hicbir uygun model/i.test(rawMessage);
                    const explanation = isTimeout
                        ? "Yanıt beklenenden uzun sürdüğü için bağlantı zaman sınırına ulaştı. Mesajın kaybolmadı; tekrar deneyebilir veya daha sonra kaldığın yerden devam edebilirsin."
                        : isConfiguration
                            ? "Sohbet sağlayıcısı hazır değil. API anahtarı ve sağlayıcı yapılandırması kontrol edilmeli."
                            : "Yanıt tamamlanamadı. Bu otomatik bir içerik reddi değil; sağlayıcı veya bağlantı tarafında geçici bir sorun oluştu. Mesajın kaybolmadı, tekrar deneyebilirsin.";
                    const safeTechnicalMessage = escapeHtmlText(rawMessage).slice(0, 500);
                    document.getElementById(botId).innerHTML = `<div class="chat-generation-error" style="border:1px solid #f38ba8;border-radius:var(--cc-radius);padding:12px;background:rgba(243,139,168,0.08);"><div style="font-weight:700;color:#f38ba8;margin-bottom:6px;">Yanıt tamamlanamadı</div><div style="line-height:1.5;">${explanation}</div><details style="margin-top:8px;color:var(--cc-text-muted);"><summary>Teknik ayrıntı</summary><div style="margin-top:6px;word-break:break-word;">${safeTechnicalMessage}</div></details></div>`;
                } catch(e) {}
            }
        } finally {
            // Ensure UI is always re-enabled to avoid permanent lock
            try { window.pendingMessages = []; } catch(e) {}
            cleanupGenerationUi();
        }
    }

    // ----- DRAG AND DROP (SÜRÜKLE BIRAK) -----
    const inputBox = document.querySelector(".input-box");
    let dragCounter = 0;

    if (inputBox) {
        inputBox.addEventListener('click', (event) => {
            const userInputEl = document.getElementById('userInput');
            if (!userInputEl) return;
            if (event.target === inputBox || inputBox.contains(event.target)) {
                userInputEl.focus();
            }
        });
    }

    function showDropState() {
        inputBox.classList.add("drag-active");
    }

    function hideDropState() {
        inputBox.classList.remove("drag-active");
        dragCounter = 0;
    }

    document.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            dragCounter++;
            showDropState();
        }
    });

    document.addEventListener("dragover", (e) => {
        if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
            e.preventDefault(); // Drop eventinin çalışması için şart
            showDropState();
        }
    });

    document.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            hideDropState();
        }
    });

    document.addEventListener("drop", (e) => {
        e.preventDefault();
        hideDropState();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            const fakeEvent = { target: { files: [file] } };

            if (file.type.startsWith("image/")) {
                handleImageSelect(fakeEvent);
            } else {
                handleDocSelect(fakeEvent);
            }
        }
    });

    // Sayfa dışına çıkıldığında veya ESC basıldığında sıfırla
    window.addEventListener("blur", hideDropState);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { hideDropState(); closeSinavKocuModal(); closeAttachMenu(); closeCameraModal(); } });
