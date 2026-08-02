// ----- SESLİ KONUzMA (TTS & STT) -----
    let isRecording = false;
    let isStarting = false;
    let recognition = null;

    let sttFinalBuffer = '';         // Biriken final metni
    let sttFlushTimer = null;         // Debounce timer
    const STT_FLUSH_DELAY = 400;      // ms — mobilde kısa cümle sonrası yazma gecikmesi
    const MIC_WARNING_DISMISSED_KEY = 'cinocode_mic_warning_dismissed';

    function dismissMicrophoneWarning() {
        document.getElementById('microphoneAccessWarning')?.remove();
        try { sessionStorage.setItem(MIC_WARNING_DISMISSED_KEY, '1'); } catch (_) {}
    }

    function showMicrophoneWarning(message) {
        try {
            if (sessionStorage.getItem(MIC_WARNING_DISMISSED_KEY) === '1') return;
        } catch (_) {}

        document.getElementById('microphoneAccessWarning')?.remove();
        const warning = document.createElement('div');
        warning.id = 'microphoneAccessWarning';
        warning.setAttribute('role', 'alert');
        warning.style.cssText = 'position:fixed; z-index:var(--z-tooltip); width:min(320px, calc(100vw - 24px)); padding:12px 38px 12px 14px; border:1px solid #f9e2af; border-radius:12px; background:var(--cc-bg-elevated); color:var(--cc-text-primary); box-shadow:0 12px 32px rgba(0,0,0,.38); font-size:12px; line-height:1.45;';

        const text = document.createElement('span');
        text.textContent = message;
        warning.appendChild(text);

        const close = document.createElement('button');
        close.type = 'button';
        close.setAttribute('aria-label', 'Mikrofon uyarısını kapat');
        close.textContent = '×';
        close.style.cssText = 'position:absolute; top:5px; right:8px; border:0; background:transparent; color:var(--cc-text-muted); font-size:22px; cursor:pointer; line-height:1;';
        close.addEventListener('click', dismissMicrophoneWarning);
        warning.appendChild(close);
        document.body.appendChild(warning);

        const micButton = document.getElementById('micBtn');
        const rect = micButton?.getBoundingClientRect();
        const left = rect ? Math.min(window.innerWidth - 332, Math.max(12, rect.left - 130)) : 12;
        warning.style.left = `${Math.max(12, left)}px`;
        warning.style.bottom = rect ? `${Math.max(72, window.innerHeight - rect.top + 10)}px` : '84px';
    }

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
            if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
                showMicrophoneWarning('Mikrofon erişimine izin verilmedi. Tarayıcının adres çubuğundaki mikrofon iznini açıp tekrar deneyin.');
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
        if (!recognition) {
            showMicrophoneWarning('Bu tarayıcı sesle yazmayı desteklemiyor. Güncel Chrome veya Edge ile tekrar deneyin.');
            return;
        }
        if (isRecording || isStarting) {
            stopMic();
        } else {
            // userInput.value = ""; // İPTAL! Artık eski yazdıklarını veya dosya eklerini silmeyecek!
            isStarting = true;
            
            // KULLANICI MIKROFONA BASTIĞINDA TTS'İ VE SES ÇALMAYI DURDUR! (Barge-in / Interrupt)
            if (typeof stopSpeaking === 'function') {
                stopSpeaking();
            } else if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }

            try {
                recognition.start();
            } catch(e) {
                isStarting = false;
                if (e.name === 'NotAllowedError') {
                    showMicrophoneWarning('Mikrofon erişimine izin verilmedi. Tarayıcının adres çubuğundaki mikrofon iznini açıp tekrar deneyin.');
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
