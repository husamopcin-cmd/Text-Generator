// CinoCode TTS / Voice Core - extracted from main.js
// Classic script (no bundler/module system): shares the top-level let/const/function
// scope with main.js exactly like auth-core.js does, so every name declared below is
// callable as a bare global from main.js and from inline HTML onclick/onchange handlers.
// IMPORTANT: <script src="assets/js/tts-core.js"> must be included AFTER main.js in
// cinocode_chat.html - populateVoices() below runs immediately (top-level) and depends
// on escapeSidebarHtml() and the voiceSelect element reference, both defined in main.js.

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
                    <button type="button" onclick="previewVoice('${voiceId}')" title="Sesi önizle" style="background:transparent; border:none; color:#89b4fa; cursor:pointer; font-size:14px; padding:2px 6px;">🔊</button>
                    <button type="button" onclick="promptRenameVoice('${voiceId}')" title="İsmi değiştir" style="background:transparent; border:none; color:var(--cc-accent-brand); cursor:pointer; font-size:14px; padding:2px 6px;">✏️</button>
                    ${isCustom ? `<button type="button" onclick="resetVoiceName('${voiceId}')" title="Varsayılana dön" style="background:transparent; border:none; color:#f38ba8; cursor:pointer; font-size:14px; padding:2px 6px;">↺</button>` : ''}
                </span>
            </div>`;
        });
        container.innerHTML = html;
    }

    // Sesi önizle: normal sohbet-okuma kuyruğuna (speechRunId/isPlayingTTS) hiç dokunmadan,
    // kendi bağımsız Audio öğesiyle kısa bir örnek cümle çalar. Böylece kullanıcı bir karakteri
    // dinlerken devam eden bir bot cevabının sesi kesilmez/bozulmaz.
    function previewVoice(voiceId) {
        const displayName = getVoiceDisplayName(voiceId);
        const sampleText = "Merhaba, ben " + displayName.replace(/\s*\(.*?\)\s*/g, "").trim() + ". Böyle konuşuyorum.";

        if (voiceId === "male_local" || voiceId.startsWith("native_")) {
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(sampleText);
                utterance.lang = "tr-TR";
                const voices = synth.getVoices();
                let matchedVoice = null;
                if (voiceId.startsWith("native_uri_")) {
                    const targetUri = decodeURIComponent(voiceId.replace("native_uri_", ""));
                    matchedVoice = voices.find(v => v.voiceURI === targetUri) || null;
                } else if (voiceId === "male_local") {
                    matchedVoice = voices.find(v => (v.lang || "").toLowerCase().includes("tr")) || null;
                }
                if (matchedVoice) utterance.voice = matchedVoice;
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                showNonBlockingToast("Cihaz sesi önizlemesi başarısız oldu.", "error");
            }
            return;
        }

        const ttsUrl = getTtsUrl();
        if (!ttsUrl) {
            showNonBlockingToast("Önizleme için Ayarlar > Bulut Ses Sunucusu URL'si yapılandırılmalı.", "warning");
            return;
        }
        const vName = getServerTtsVoiceId(voiceId);

        if (!window.previewAudio) window.previewAudio = new Audio();
        const previewAudio = window.previewAudio;
        try { previewAudio.pause(); previewAudio.currentTime = 0; } catch (e) {}
        if (window.previewObjectUrl) {
            try { URL.revokeObjectURL(window.previewObjectUrl); } catch (e) {}
            window.previewObjectUrl = null;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        fetch(ttsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sampleText, voice: vName, lang: 'tr-TR' }),
            signal: controller.signal
        }).then(async response => {
            if (!response.ok) throw new Error(`Önizleme sunucusu ${response.status} döndürdü.`);
            const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (contentType !== 'audio/mpeg') throw new Error('Beklenmeyen önizleme MIME türü: ' + (contentType || 'boş'));
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            if (bytes.byteLength < 256) throw new Error('Önizleme ses yanıtı beklenenden küçük veya kesilmiş.');
            if (!isValidMp3Header(bytes)) throw new Error('Önizleme yanıtı geçerli bir MP3 başlığı taşımıyor.');
            const fallbackVoice = response.headers.get('X-Cino-TTS-Fallback');
            return { blob: new Blob([buffer], { type: 'audio/mpeg' }), fallbackVoice };
        }).then(result => {
            window.previewObjectUrl = URL.createObjectURL(result.blob);
            previewAudio.src = window.previewObjectUrl;
            if (result.fallbackVoice) {
                showNonBlockingToast(`${displayName} şu anda geçici olarak kullanılamıyor; farklı bir sesle önizleniyor.`, "warning");
            }
            return previewAudio.play();
        }).catch(error => {
            console.warn('Ses önizleme başarısız:', error);
            showNonBlockingToast(`${displayName} önizlenemedi. Sunucuya ulaşılamadı veya ses üretilemedi.`, "error");
        }).finally(() => clearTimeout(timeoutId));
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

    const DEFAULT_TTS_URL = "https://cinocode-tts-server.onrender.com/api/tts";

    function normalizeTtsUrl(value) {
        const rawUrl = String(value || "").trim();
        if (!rawUrl) return "";
        try {
            const parsedUrl = new URL(rawUrl);
            const isSecure = parsedUrl.protocol === "https:";
            const isLocalHttp = parsedUrl.protocol === "http:" && window.location.protocol !== "https:";
            if (!isSecure && !isLocalHttp) return "";
            const cleanPath = parsedUrl.pathname.replace(/\/+$/, "");
            if (!cleanPath.endsWith("/api/tts")) {
                parsedUrl.pathname = `${cleanPath}/api/tts`;
            }
            return parsedUrl.toString();
        } catch (error) {
            return "";
        }
    }

    function getTtsUrl() {
        const savedTtsUrl = normalizeTtsUrl(localStorage.getItem("tts_url"));
        if (savedTtsUrl) return savedTtsUrl;
        const ollamaIpStr = localStorage.getItem("ollama_ip");
        if (window.location.protocol !== "https:" && ollamaIpStr && ollamaIpStr.startsWith("http")) {
            try {
                const urlObj = new URL(ollamaIpStr);
                return `http://${urlObj.hostname}:8001/api/tts`;
            } catch(e) {}
        }
        // Canlı HTTPS'te yeni kullanıcılar public Render TTS servisini otomatik kullanır.
        // TTS kimlik bilgileri yalnızca Render ortamında kalır; bu public endpoint secret değildir.
        if (window.location.protocol === "https:") return DEFAULT_TTS_URL;
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
        cleanText = cleanText.replace(/\[GENERATED_IMAGE:.*?\]/g, " Görsel hazır. ");
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
            if(isNaN(speed) || speed < 0.5 || speed > 3.5) speed = 1.0;
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

    function isValidMp3Header(bytes) {
        if (!bytes || bytes.length < 3) return false;
        // ID3 tag veya MPEG audio frame sync.
        return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
               (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0);
    }

    function speakWithServer(cleanText, expectedRunId, expectedVoiceId, langCode = "tr-TR", onDone = null) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) {
            isPlayingTTS = false;
            return;
        }

        const ttsUrl = getTtsUrl();
        if (!ttsUrl) {
            setTtsRouteMeta("server_character_voice_unavailable", expectedVoiceId, null, "Bulut TTS URL'si yapılandırılmamış.");
            showNonBlockingToast("Bu karakter sesi için Ayarlar > Bulut Ses Sunucusu URL'si alanına geçerli bir HTTPS adresi girilmeli.", "warning");
            isPlayingTTS = false;
            if (onDone) onDone();
            return;
        }

        const vName = getServerTtsVoiceId(expectedVoiceId);

        if (!window.sharedAudio) window.sharedAudio = new Audio();
        const audio = window.sharedAudio;
        window.currentAudio = audio;

        // Önceki istek/oynatma kesin olarak sonlandırılır; iki ses üst üste binmez.
        if (window.currentTtsAbortController) {
            try { window.currentTtsAbortController.abort(); } catch(e) {}
        }
        const abortController = new AbortController();
        window.currentTtsAbortController = abortController;
        try {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute('src');
            audio.load();
        } catch(e) {}
        if (window.currentTtsObjectUrl) {
            try { URL.revokeObjectURL(window.currentTtsObjectUrl); } catch(e) {}
            window.currentTtsObjectUrl = null;
        }

        // Karakter pitch/rate ayarı yalnız sunucuda uygulanır. İstemci sadece kullanıcı hızını uygular.
        audio.fz19BaseRate = 1.0;
        let finalRate = window.fz19GetTtsSpeed();
        finalRate = Math.min(3.5, Math.max(0.5, finalRate));
        audio.defaultPlaybackRate = finalRate;
        audio.playbackRate = finalRate;

        let finished = false;
        const finishOnce = () => {
            if (finished) return;
            finished = true;
            if (window.currentTtsAbortController === abortController) window.currentTtsAbortController = null;
            if (onDone) onDone();
            else if (isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS();
            else isPlayingTTS = false;
        };

        const failServerVoice = (reason, error) => {
            if (finished || abortController.signal.aborted) return;
            finished = true;
            console.warn(`TTS sunucu sesi durduruldu: ${reason}`, error || "");
            setTtsRouteMeta("server_character_voice_failed", expectedVoiceId, { name: vName, lang: langCode }, reason);
            showNonBlockingToast("Seçilen sunucu sesi şu anda kullanılamıyor. Başka cinsiyette veya cihaz sesine otomatik geçiş yapılmadı.", "error");
            try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch(e) {}
            if (window.currentTtsObjectUrl) {
                try { URL.revokeObjectURL(window.currentTtsObjectUrl); } catch(e) {}
                window.currentTtsObjectUrl = null;
            }
            if (window.currentTtsAbortController === abortController) window.currentTtsAbortController = null;
            isPlayingTTS = false;
            if (onDone) onDone();
        };

        audio.onplay = () => {
            audio.playbackRate = Math.min(3.5, Math.max(0.5, window.fz19GetTtsSpeed()));
            setTtsRouteMeta("server_character_voice", expectedVoiceId, { name: vName, lang: langCode }, "");
        };
        audio.onended = finishOnce;
        audio.onerror = (err) => failServerVoice("Ses oynatılamadı.", err);

        let fallbackVoiceUsed = null;
        const timeoutId = setTimeout(() => abortController.abort(), 20000);
        fetch(ttsUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText, voice: vName, lang: langCode }),
            signal: abortController.signal
        }).then(async response => {
            if (!response.ok) throw new Error(`TTS sunucusu ${response.status} döndürdü.`);
            const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (contentType !== 'audio/mpeg') throw new Error(`Beklenmeyen TTS MIME türü: ${contentType || 'boş'}`);
            // Sunucu Edge TTS başarısız olup Google'a sessizce geçtiğinde bunu header ile bildirir;
            // kullanıcıya "farklı ses kullanılıyor" diye şeffaf bir uyarı gösterebiliyoruz.
            fallbackVoiceUsed = response.headers.get('X-Cino-TTS-Fallback') || null;
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            if (bytes.byteLength < 256) throw new Error('TTS ses yanıtı beklenenden küçük veya kesilmiş.');
            if (!isValidMp3Header(bytes)) throw new Error('TTS yanıtı geçerli bir MP3 başlığı taşımıyor.');
            return new Blob([buffer], { type: 'audio/mpeg' });
        }).then(blob => {
            if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId || abortController.signal.aborted) return;
            window.currentTtsObjectUrl = URL.createObjectURL(blob);
            audio.src = window.currentTtsObjectUrl;
            if (fallbackVoiceUsed) {
                showNonBlockingToast(`${getVoiceDisplayName(expectedVoiceId)} şu anda geçici olarak kullanılamıyor; farklı bir sesle devam ediliyor.`, "warning");
            }
            return audio.play();
        }).catch(error => {
            if (abortController.signal.aborted) {
                failServerVoice("TTS isteği zaman aşımına uğradı veya iptal edildi.", error);
            } else {
                failServerVoice("Sunucu isteği ya da ses doğrulaması başarısız.", error);
            }
        }).finally(() => clearTimeout(timeoutId));
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
        if (window.currentTtsAbortController) {
            try { window.currentTtsAbortController.abort(); } catch(e) {}
            window.currentTtsAbortController = null;
        }
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

