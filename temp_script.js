



    console.log("CINOCODE_VERSION_0afe80e_voicefix");
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(rs => {
        rs.forEach(r => r.unregister());
      });
    }
    

    // === GROQ API AYARI ===
    
    

    function getSafeUserName() {
        let name = localStorage.getItem('cinocode_user');
        if (!name || name.trim().toLowerCase() === "ahmet") {
            if (name && name.trim().toLowerCase() === "ahmet") {
                localStorage.removeItem('cinocode_user');
            }
            name = prompt("Sana nasÄ±l hitap etmeliyim? (Ä°smini gir):", "Kanka");
            if (!name) name = "Kanka";
            localStorage.setItem('cinocode_user', name.trim());
            return name.trim();
        }
        return name.trim();
    }
    const loggedUser = getSafeUserName();

    function logout() {
        localStorage.removeItem('cinocode_user');
        window.location.reload();
    }

    window.onerror = function(msg, url, lineNo) { alert('Hata: ' + msg + '\nSatir: ' + lineNo); return false; };
    // ----- GLOBAL DEÄžÄ°ÅžKENLER & HAFIZA SÄ°STEMÄ° -----
    const messagesDiv = document.getElementById("messages");
    const userInput = document.getElementById("userInput");
    const chatListDiv = document.getElementById("chatList");
    
    const voiceSelect = document.getElementById("voiceSelect");
    const speakerBtn = document.getElementById("speakerBtn");
    
    // TTS Session lock & Media Prompt memory variables
    let currentMode = "chat"; // "chat", "video" veya "image"
    let speechRunId = 0;
    let lastMediaPrompt = "";
    let lastMediaType = ""; // "image" veya "video"

    function setAppMode(mode) {
        currentMode = mode;
        console.log("CinoCode Aktif Mod DeÄŸiÅŸti: " + currentMode);
        
        const suggestionContainer = document.getElementById("suggestionChipsContainer");
        if (suggestionContainer && mode !== "image" && mode !== "video" && mode !== "game") {
            suggestionContainer.style.display = "none";
        }
        
        // UI GÃ¼ncellemeleri
        const welcomeTitle = document.querySelector(".welcome-screen h2");
        if (welcomeTitle) {
            if (mode === "video") {
                welcomeTitle.innerHTML = "ðŸŽ¬ Video StÃ¼dyosu<br><span style='font-size: 15px; color: #a6adc8;'>Ne tÃ¼r bir video oluÅŸturmak istersin?</span>";
            } else if (mode === "image") {
                welcomeTitle.innerHTML = "ðŸŽ¨ GÃ¶rsel StÃ¼dyosu<br><span style='font-size: 15px; color: #a6adc8;'>Ne Ã§izmek istersin?</span>";
            } else if (mode === "game") {
                welcomeTitle.innerHTML = "ðŸ•¹ï¸ Oyun StÃ¼dyosu<br><span style='font-size: 15px; color: #a6adc8;'>NasÄ±l bir oyun geliÅŸtirmek istersin?</span>";
            } else {
                welcomeTitle.innerHTML = "BugÃ¼n ne Ã¼retmek istersin?";
            }
        }
    }

    function sanitizeAssistantOutput(text) {
        if (!text) return "";
        return text
            .replace(/\[REMEMBER:[\s\S]*?\]/gi, "")
            .replace(/\[SYSTEM:[\s\S]*?\]/gi, "")
            .replace(/\[DEVELOPER:[\s\S]*?\]/gi, "")
            .replace(/Ahmet\w*/gi, "")
            .replace(/^\s*(Sen|KullanÄ±cÄ±|User|Assistant|Bot):\s*.*$/gmi, "")
            .replace(/^\s*Viewed\s+.*$/gmi, "")
            .replace(/^\s*Edited\s+.*$/gmi, "")
            .replace(/^\s*Ran command:\s*.*$/gmi, "")
            .replace(/^\s*Searched for\s+.*$/gmi, "")
            .replace(/^\s*Thought for\s+.*$/gmi, "")
            .replace(/^\s*node\s+-e\s+.*$/gmi, "")
            .trim();
    }

    function buildCleanMediaPrompt(rawPrompt, type) {
        let clean = rawPrompt.trim();
        // Remove internal leaks if any slipped through
        clean = sanitizeAssistantOutput(clean);
        // Ä°stem dÄ±ÅŸÄ± TÃ¼rkÃ§e kelimeleri / talimatlarÄ± temizle
        clean = clean.replace(/lÃ¼tfen/gi, "").replace(/Ã§iz/gi, "").replace(/yap/gi, "").replace(/oluÅŸtur/gi, "");
        // HafÄ±zadan/Sohbetten gelen kirlilikleri temizle
        clean = clean.replace(/ahmet/gi, "").replace(/hÃ¼samettin abim/gi, "").replace(/kanka hadi/gi, "");
        
        // Temel Ä°ngilizce kaÃ§Ä±nma/negatif kurallarÄ±nÄ± prompta yedir
        let avoidance = ", no humans, no men, no women, no extra limbs, no deformed anatomy, no text, no watermark, high quality, cinematic";
        
        // SayÄ± kurallarÄ±nÄ± gÃ¼Ã§lendir:
        if (clean.match(/\b(bir|1)\b/i)) {
            clean += ", exactly one subject, single focal subject";
        } else if (clean.match(/\b(iki|2)\b/i)) {
            clean += ", exactly two subjects, two separate characters";
        } else if (clean.match(/\b(altÄ±|6)\b/i)) {
            clean += ", exactly six separate full-body subjects, six independent characters";
        } else if (clean.match(/\b(Ã¼Ã§|3)\b/i)) {
            clean += ", exactly three subjects, three independent characters";
        } else if (clean.match(/\b(dÃ¶rt|4)\b/i)) {
            clean += ", exactly four subjects, four independent characters";
        } else if (clean.match(/\b(beÅŸ|5)\b/i)) {
            clean += ", exactly five subjects, five independent characters";
        }

        // Ä°nsan istenmediÄŸini belirten veya negatif ekler ekle
        if (clean.toLowerCase().includes("cat") || clean.toLowerCase().includes("kedi") || clean.toLowerCase().includes("kÃ¶pek") || clean.toLowerCase().includes("dog") || clean.toLowerCase().includes("hayvan") || clean.toLowerCase().includes("animal")) {
            avoidance += ", no humans, no people, no man, no woman";
        }

        return clean + avoidance;
    }

    function buildImageUrl(prompt, options = {}) {
        const width = options.width || 512;
        const height = options.height || 512;
        const seed = options.seed || Math.floor(Math.random() * 999999);
        const encoded = encodeURIComponent(prompt.trim());
        return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
    }

    function buildVideoSceneCandidates(prompt, seed) {
        const primary512 = buildImageUrl(prompt, { width: 512, height: 512, seed });
        const primary384 = buildImageUrl(prompt, { width: 384, height: 384, seed: seed + 1 });
        const proxyUrl = `https://wsrv.nl/?url=image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?width=384&height=384&nologo=true&seed=${seed+2}`;
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

    // --- SES ve VÄ°DEO Ä°ÅžLEMLERÄ° (Ã–nceden var olan fonksiyonlarÄ±n bir kÄ±smÄ±) ---

    const systemPrompt = "Sen GinoCode'sun â€” TÃ¼rkÃ§eyi ana dili gibi konuÅŸan, samimi, espri anlayan ve gerÃ§ek bir insan gibi davranan zeki bir asistansÄ±n. TÃ¼rkÃ§eni C2 (ana dil) seviyesinde kullanÄ±yorsun: zengin kelime daÄŸarcÄ±ÄŸÄ±, doÄŸal deyimler, akÄ±cÄ± ve zarif cÃ¼mleler, hiÃ§bir ÅŸekilde robotik veya yapay bir ton yok. TÃ¼rkÃ§ede bÃ¼yÃ¼k harf kurallarÄ±na, noktalama iÅŸaretlerine ve dilbilgisine mÃ¼kemmel ÅŸekilde uyarsÄ±n. AynÄ± zamanda ÅŸu dillerde de ana dil seviyesinde (C2) eÅŸit derecede kusursuz hakimiyetin var: Ä°ngilizce, Almanca, Ä°spanyolca, FransÄ±zca, Ä°talyanca, Portekizce, RusÃ§a, ArapÃ§a, Japonca, Ã‡ince (Mandarin), Korece. KullanÄ±cÄ± senden herhangi bir dilde konuÅŸmanÄ± istediÄŸinde, o dilin doÄŸal sÃ¶zdizimini, deyimlerini ve kÃ¼ltÃ¼rel inceliklerini yansÄ±tarak o dilde mÃ¼kemmel ÅŸekilde konuÅŸursun. Asla 'Ben sadece bir yapay zekayÄ±m' veya 'Bu konuda yetersizim' gibi kliÅŸe ve Ã§aresiz cÃ¼mleler kurma.";
    
    const personas = {
        "kanka": "Sen GinoCode'sun â€” kullanÄ±cÄ±nÄ±n en yakÄ±n, en gÃ¼venilir kankasÄ±sÄ±n. TÃ¼rkÃ§eni C2 ana dil seviyesinde ve gÃ¼nlÃ¼k/samimi bir ÅŸekilde kullanÄ±rsÄ±n: 'ya', 'lan', 'kanka', 'yav', 'kardeÅŸim', 'hocam', 'ee', 'yani', 'ciddiye al' gibi doÄŸal sokak ifadelerini bol bol kullanÄ±rsÄ±n ama kaba kÃ¼fÃ¼r kullanmazsÄ±n. KonuÅŸman akÄ±cÄ±, esprili, doÄŸaldÄ±r â€” sanki gerÃ§ek bir insan arkadaÅŸ yazÄ±yor gibi. TÃ¼rkÃ§e yazÄ±mÄ±nda bÃ¼yÃ¼k-kÃ¼Ã§Ã¼k harf ve noktalama iÅŸaretlerine dikkat edersin, cÃ¼mle yapÄ±n doÄŸal ve akÄ±cÄ±dÄ±r. AynÄ± zamanda Ä°ngilizce, Almanca, Ä°spanyolca, FransÄ±zca, Ä°talyanca, Portekizce, RusÃ§a, ArapÃ§a, Japonca, Ã‡ince ve Korece dillerinde de tam akÄ±cÄ± (C2) seviyedesin â€” kullanÄ±cÄ± hangisinde konuÅŸmak isterse o dilde anÄ±nda, kusursuz biÃ§imde yanÄ±t verirsin. KliÅŸe AI cÃ¼mleleri kesinlikle yasak. DÄ°KKAT: 'knk' = 'kanka' demektir, asla K-Pop grubu zannetme!",
        "usta_yazilimci": "Sen GinoCode'sun â€” efsanevi bir kÄ±demli yazÄ±lÄ±m mÃ¼hendisisin. KullanÄ±cÄ±nÄ±n istediÄŸi oyunlarÄ±, web sitelerini, uygulamalarÄ± ve algoritmalarÄ± eksiksiz ÅŸekilde yazarsÄ±n. Gereksiz aÃ§Ä±klama minimumu tut, kod maksimumu sun. KullanÄ±cÄ± bir uygulama istediÄŸinde SADECE HTML + CSS + JS iÃ§eren TEK BÄ°R ```html bloÄŸu ile cevap ver â€” bu kodlar GinoCode Artifact sistemiyle canlÄ± Ã§alÄ±ÅŸtÄ±rÄ±lacak. TÃ¼rkÃ§en C2 seviyesinde, doÄŸal ve akÄ±cÄ±dÄ±r. Ä°ngilizce, Almanca ve diÄŸer dillerde de teknik aÃ§Ä±klama yapabilirsin. Az sÃ¶z Ã§ok iÅŸ.",
        "akademik_koc": "Sen GinoCode'sun â€” alanÄ±nda uzman bir akademik koÃ§ ve Ã¶ÄŸretmensin. KullanÄ±cÄ±nÄ±n sorduÄŸu konularÄ± Ã¶nce 'sanki 8 yaÅŸÄ±ndaki bir Ã§ocuÄŸa anlatÄ±r gibi' kristal netliÄŸinde aÃ§Ä±kla. Sonra seviyeyi kademeli olarak artÄ±r ve akademik derinliÄŸe taÅŸÄ±. En sonda konuyu pekiÅŸtirmek iÃ§in A/B/C/D ÅŸÄ±klÄ± 1-2 soru sor; cevabÄ± hemen verme, Ã¶nce kullanÄ±cÄ±nÄ±n dÃ¼ÅŸÃ¼nmesini bekle. TÃ¼rkÃ§en C2 seviyesinde kusursuz, doÄŸal ve akademik aÃ§Ä±dan zengindir. Ä°ngilizce, Almanca ve diÄŸer dillerde de ders verebilirsin. SabÄ±rlÄ±, motive edici ve bilge bir rehbersin.",
        "dil_kocu": "Sen GinoCode'sun â€” dÃ¼nyanÄ±n en iyi dil Ã¶ÄŸretmenisin. AÅŸaÄŸÄ±daki dillerde ana dil (C2) seviyesinde tam uzmansÄ±n ve bu dillerin dilbilgisini, telaffuzunu, deyimlerini, kÃ¼ltÃ¼rel nÃ¼anslarÄ±nÄ± mÃ¼kemmel biliyorsun: Ä°ngilizce, Almanca, Ä°spanyolca, FransÄ±zca, Ä°talyanca, Portekizce (Brezilya & Avrupa), RusÃ§a, ArapÃ§a (Modern Standart & Levant lehÃ§esi), Japonca (Hiragana/Katakana/Kanji dahil), Ã‡ince (Mandarin/Pinyin), Korece, Hollandaca, Ä°sveÃ§Ã§e, NorveÃ§Ã§e, Danimarkaca, Yunanca, LehÃ§e, Ukraynaca, HintÃ§e. Ã–ÄžRETIM DÄ°LÄ°N HER ZAMAN TÃœRKÃ‡E (kullanÄ±cÄ± aksi belirtmedikÃ§e). Ã‡ALIÅžMA TARZI VE KURALLAR: 1) KullanÄ±cÄ± hangi dili Ã¶ÄŸrenmek istediÄŸini sÃ¶ylediÄŸinde, 'Harika! BugÃ¼n [DÄ°L] Ã¶ÄŸreniyoruz ðŸŽ¯ Hadi baÅŸlayalÄ±m!' ÅŸeklinde coÅŸkulu ve sÄ±cak bir giriÅŸle baÅŸla. 2) O gÃ¼nÃ¼n dersini planla: O dilin ses sistemi, alfabe/yazÄ± sistemi veya telaffuz incelikleri hakkÄ±nda kÄ±sa ve akÄ±lda kalÄ±cÄ± bir giriÅŸ yap. 3) GÃ¼nlÃ¼k hayatta EN Ã‡OK kullanÄ±lan 10-15 kelimeyi Markdown tablolarÄ±yla sun â€” sÃ¼tunlar: Kelime | Telaffuz (fonetik/IPA) | TÃ¼rkÃ§e AnlamÄ± | Ã–rnek CÃ¼mle (hedef dil) | TÃ¼rkÃ§e Ã‡evirisi. 4) KullanÄ±cÄ± seninle o dilde sohbet etmek isterse, o dilde konuÅŸ ve doÄŸal bir konuÅŸma akÄ±ÅŸÄ± kur. KullanÄ±cÄ±nÄ±n hatalarÄ±nÄ± mesajÄ±nÄ±n EN SONUNDA kibarca 'ðŸ“ KÃ¼Ã§Ã¼k DÃ¼zeltme:' baÅŸlÄ±ÄŸÄ±yla TÃ¼rkÃ§e olarak dÃ¼zelt, aÃ§Ä±kla ve doÄŸrusunu yaz. 5) Her dersin veya sohbetin sonunda 'ðŸ† BugÃ¼nÃ¼n Kelime/Deyim Ã–dÃ¼lÃ¼:' bÃ¶lÃ¼mÃ¼nde 3-5 yeni kelime veya kalÄ±p deyim Ã¶ÄŸret â€” gÃ¼nlÃ¼k konuÅŸmada gerÃ§ekten kullanÄ±lan, pratik ve yaygÄ±n ifadeler seÃ§. 6) KullanÄ±cÄ± 'bana konu anlat', 'konularÄ± Ã¶ÄŸret', 'kelime Ã¶ÄŸret' gibi bir ÅŸey sÃ¶ylediÄŸinde ÅŸu sÄ±ralamayÄ± takip et: a) Kelimeler & Telaffuz â†’ b) Ã–rnek CÃ¼mle (Hedef Dil) â†’ c) TÃ¼rkÃ§e Ã‡evirisi â†’ d) Dilbilgisi Notu (kÄ±sa, sade). 7) Dilbilgisi konularÄ±nÄ± (Ã§ekimler, zamanlar, ekler, cÃ¼mle yapÄ±sÄ±, sÃ¶z dizimi) HER ZAMAN TÃ¼rkÃ§e ile karÅŸÄ±laÅŸtÄ±rmalÄ± olarak anlat â€” 'TÃ¼rkÃ§ede nasÄ±l diyoruz, o dilde nasÄ±l sÃ¶yleniyor' mantÄ±ÄŸÄ±yla. 8) Motivasyon ve geri bildirim: 'Harika gidiyorsun! ðŸŒŸ', 'Ã‡ok doÄŸru!', 'Neredeyse mÃ¼kemmel, kÃ¼Ã§Ã¼k bir fark var:', 'Bu kelimeyi artÄ±k unutmazsÄ±n!' gibi cesaretlendirici ifadeler kullan. 9) Sohbet modunda kullanÄ±cÄ±yla o dilde tamamen konuÅŸabilirsin â€” kullanÄ±cÄ± istediÄŸi zaman 'TÃ¼rkÃ§eye geÃ§' veya 'Hadi Ä°ngilizce konuÅŸalÄ±m' gibi komutlarla mod deÄŸiÅŸtirebilir.",
        "derin_arastirma": "Sen GinoCode'sun â€” dÃ¼nyaca tanÄ±nmÄ±ÅŸ bir araÅŸtÄ±rmacÄ± ve analistin. Verilen her konuyu istatistikler, tarihi veriler, akademik kaynaklar ve gÃ¼ncel geliÅŸmelerle derinlemesine ele alÄ±rsÄ±n. RaporlarÄ±nÄ± ÅŸu formatla hazÄ±rlarsÄ±n: ðŸ“‹ Ã–zet â†’ ðŸ“œ TarihÃ§e â†’ ðŸ“Š GÃ¼ncel Durum â†’ ðŸ“ˆ Veriler & Ä°statistikler â†’ ðŸ’¬ Uzman GÃ¶rÃ¼ÅŸleri â†’ ðŸ”­ SonuÃ§ & Ã–ngÃ¶rÃ¼ler. Alt baÅŸlÄ±klar, kalÄ±n vurgular ve maddeli listeler kullanarak okunabilirliÄŸi artÄ±rÄ±rsÄ±n. TÃ¼rkÃ§en akademik, otoriter ve akÄ±cÄ±dÄ±r. Ä°ngilizce kaynaklara da baÅŸvurur, gerektiÄŸinde Ã§evirir ve derinlemesine yorumlarsÄ±n."
    };

    let selectedImageBase64 = null;
    let selectedStudyFileName = "";

    function handleImageSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        selectedStudyFileName = file.name;
        processFileAsBase64(file, true);
    }

    function processFileAsBase64(file, isImage) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewContainer = document.getElementById('imagePreviewContainer');
            const previewImg = document.getElementById('imagePreview');
            
            if (isImage) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1024;
                    const MAX_HEIGHT = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // JPEG compression
                    selectedImageBase64 = dataUrl;
                    previewImg.src = dataUrl;
                    previewContainer.style.display = 'inline-block';
                    
                    // Video modu tetikleyicisi asekron olduÄŸu iÃ§in burada Ã§aÄŸÄ±rmamÄ±z gerek
                    triggerPostImageLoad();
                };
                img.src = e.target.result;
            } else {
                selectedImageBase64 = e.target.result;
                previewImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='none' stroke='%2389b4fa' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'></path><polyline points='14 2 14 8 20 8'></polyline><line x1='16' y1='13' x2='8' y2='13'></line><line x1='16' y1='17' x2='8' y2='17'></line><polyline points='10 9 9 9 8 9'></polyline></svg>";
                previewContainer.style.display = 'inline-block';
                triggerPostImageLoad();
            }
            
            function triggerPostImageLoad() {
            
            const currentModel = document.getElementById('modelSelect').value;
            if (!currentModel.includes('-gemini')) {
                document.getElementById('modelSelect').value = 'gemini-2.0-flash-gemini';
            }
            
            // EÄŸer video modundaysak, doÄŸrudan fotoÄŸraftan sinematik WebM Ã¼retimine baÅŸla
            if (currentMode === "video") {
                alert("ðŸ“· FotoÄŸraf tespit edildi!\n\nDÃ¼rÃ¼st AÃ§Ä±klama: Ãœcretsiz modda yÃ¼klediÄŸin fotoÄŸrafÄ± gerÃ§ek AI animasyonuna Ã§evirmek yerine sinematik zoom/pan efektiyle kÄ±sa video yaparÄ±m. GerÃ§ek image-to-video iÃ§in ileride yerel ComfyUI / Stable Video Diffusion desteÄŸi gerekir.");
                
                const img = new Image();
                img.onload = async function() {
                    const videoId = 'video-' + Date.now();
                    const list = document.getElementById("messages");
                    if (list) {
                        const card = document.createElement("div");
                        card.className = "message bot";
                        card.innerHTML = `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                                            <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ FotoÄŸraf Sinematik Klibe DÃ¶nÃ¼ÅŸtÃ¼rÃ¼lÃ¼yor...</div>
                                            <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                                                <div id="${videoId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                                            </div>
                                            <div id="${videoId}-status" style="color: #a6adc8; font-size: 13px;">Efekt uygulanÄ±yor...</div>
                                        </div>`;
                        list.appendChild(card);
                        scrollToBottom();
                    }
                    
                    removeImage(); // Preview temizle
                    
                    // Canvas oluÅŸturup tek resimden Ken Burns slayt yap
                    const canvas = document.createElement('canvas');
                    canvas.width = 512;
                    canvas.height = 512;
                    const ctx = canvas.getContext('2d');
                    const FPS = 20;
                    const stream = canvas.captureStream(FPS);
                    const chunks = [];
                    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                    
                    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                    const videoReady = new Promise((resolve) => {
                        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
                    });
                    
                    recorder.start();
                    let frame = 0;
                    const totalFrames = 5 * FPS; // 5 saniye
                    
                    const drawFrame = () => {
                        if (frame >= totalFrames) {
                            recorder.stop();
                            return;
                        }
                        const progress = frame / totalFrames;
                        const zoom = 1.0 + progress * 0.15; // Zoom in
                        const panX = progress * 10;
                        
                        ctx.save();
                        ctx.translate(256 + panX, 256);
                        ctx.scale(zoom, zoom);
                        ctx.translate(-256, -256);
                        ctx.drawImage(img, 0, 0, 512, 512);
                        ctx.restore();
                        
                        const progPercent = Math.floor(progress * 100);
                        const progressEl = document.getElementById(videoId + "-progress");
                        const statusEl = document.getElementById(videoId + "-status");
                        if (progressEl) progressEl.style.width = progPercent + "%";
                        if (statusEl) statusEl.textContent = `ðŸŽ¬ Sinematik efekt iÅŸleniyor... (${progPercent}%)`;
                        
                        frame++;
                        setTimeout(drawFrame, 1000 / FPS);
                    };
                    drawFrame();
                    const videoBlob = await videoReady;
                    const videoUrl = URL.createObjectURL(videoBlob);
                    const container = document.getElementById(videoId);
                    if (container) {
                        container.innerHTML = `
                            <div style="text-align:center; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                                <div style="color: #a6e3a1; font-size: 14px; margin-bottom: 10px;">âœ… FotoÄŸraf baÅŸarÄ±yla sinematik klibe dÃ¶nÃ¼ÅŸtÃ¼rÃ¼ldÃ¼!</div>
                                <video controls autoplay style="max-width:100%; border-radius: 8px; border: 2px solid #89b4fa;" src="${videoUrl}"></video>
                                <br>
                                <button class="run-code-btn" style="background: linear-gradient(135deg, #89b4fa, #cba6f7); color:#11111b; width:auto; padding:10px 20px; margin-top:10px; font-weight:bold; border-radius: 8px;" onclick="downloadVideo('${videoUrl}')">ðŸ“¥ Videoyu Ä°ndir (WebM)</button>
                            </div>
                        `;
                    }
                };
                img.src = e.target.result;
            }
            } // Close triggerPostImageLoad
        };
        reader.readAsDataURL(file);
    }
    
    function removeImage() {
        document.getElementById('imageUpload').value = '';
        document.getElementById('cameraUpload').value = '';
        document.getElementById('imagePreview').src = '';
        document.getElementById('imagePreviewContainer').style.display = 'none';
        selectedImageBase64 = null;
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
        "neon Ä±ÅŸÄ±klÄ± fÃ¼tÃ¼ristik bir siberpunk ÅŸehri",
        "gÃ¼n batÄ±mÄ±nda gÃ¶l kenarÄ±nda kamp yapan ÅŸirin bir kedi",
        "masalsÄ± bulutlarÄ±n Ã¼zerinde sÃ¼zÃ¼len fantastik ÅŸato",
        "yaÄŸmurlu bir gecede ÅŸemsiyesiyle yÃ¼rÃ¼yen dedektif",
        "kristal maÄŸarasÄ±nda parlayan ejderha yumurtasÄ±",
        "kahve iÃ§en gÃ¶zlÃ¼klÃ¼ akÄ±llÄ± bir baykuÅŸ",
        "okyanusun derinliklerinde kayÄ±p bir Atlantis ÅŸehri",
        "bÃ¼yÃ¼lÃ¼ ormanda peri tozlarÄ±yla parlayan aÄŸaÃ§lar",
        "Mars yÃ¼zeyinde yÃ¼rÃ¼yen astronot ve yavru kÃ¶peÄŸi",
        "gotik tarzda tasarlanmÄ±ÅŸ karanlÄ±k ve gizemli bir kÃ¼tÃ¼phane"
    ];

    const videoSuggestions = [
        "neon Ä±ÅŸÄ±klÄ± cyberpunk bir ÅŸehirde sÃ¼zÃ¼len uÃ§an arabalar",
        "gÃ¼n batÄ±mÄ±nda yeÅŸillikler iÃ§inde koÅŸan sevimli altÄ±n sarÄ±sÄ± yavru kedi",
        "bulutlarÄ±n Ã¼zerinde sÃ¼zÃ¼len devasa fantastik bir uÃ§an kale",
        "karlarla kaplÄ± daÄŸlarda yavaÅŸÃ§a sÃ¼zÃ¼len bir kartal",
        "fÄ±rtÄ±nalÄ± bir denizde dev dalgalarla boÄŸuÅŸan korsan gemisi",
        "renkli mercan resifleri arasÄ±nda yÃ¼zen deniz kaplumbaÄŸasÄ±",
        "bÃ¼yÃ¼lÃ¼ bir ormanda aÃ§an Ä±ÅŸÄ±l Ä±ÅŸÄ±l Ã§iÃ§ekler ve kelebekler",
        "geleceÄŸin metropolÃ¼nde hÄ±zla giden bir yÃ¼ksek hÄ±zlÄ± tren",
        "lav pÃ¼skÃ¼rten gÃ¶rkemli bir yanardaÄŸÄ±n etrafÄ±nda dÃ¶nen ejderhalar",
        "galaksiler arasÄ± yolculuk yapan devasa bir uzay gemisi"
    ];

    const gameSuggestions = [
        "HTML5 ve Canvas ile klasik yÄ±lan (snake) oyunu",
        "Basit ping pong (pong) oyunu, skor tablosu ile birlikte",
        "KuÅŸ uÃ§urma (Flappy Bird) tarzÄ± engellerden kaÃ§Ä±ÅŸ oyunu",
        "Ekranda tÄ±klayarak altÄ±n toplama clicker oyunu",
        "Basit bir masaÃ¼stÃ¼ bilardo oyunu simÃ¼lasyonu",
        "Uzay gemisiyle yukarÄ±dan gelen meteorlarÄ± vurduÄŸumuz shooter oyunu",
        "MayÄ±n tarlasÄ± (Minesweeper) klonu",
        "DÃ¼ÅŸen bloklarÄ± eÅŸleÅŸtirdiÄŸimiz tetris tarzÄ± oyun",
        "HafÄ±za kartlarÄ± eÅŸleÅŸtirme oyunu",
        "Platform Ã¼zerinde zÄ±playarak ilerleyen basit bir platform oyunu"
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

    function renderSuggestions(type) {
        const container = document.getElementById("suggestionChipsContainer");
        const suggestionCount = window.innerWidth <= 768 ? 1 : 2;
        const suggestions = getRandomSuggestions(type, suggestionCount);
        
        let html = '';
        suggestions.forEach(s => {
            let icon = 'ðŸŽ¨';
            let prefix = 'Bana ÅŸu resmi Ã§iz: ';
            if (type === 'video') {
                icon = 'ðŸŽ¬';
                prefix = 'Bana ÅŸu videoyu oluÅŸtur: ';
            } else if (type === 'game') {
                icon = 'ðŸ•¹ï¸';
                prefix = 'Bana ÅŸu oyunu kodla: ';
            }
            const escaped = s.replace(/'/g, "\\'");
            html += `<button class="suggestion-chip" onclick="applySuggestion('${prefix}', '${escaped}')">${icon} ${s}</button>`;
        });
        
        html += `<button class="suggestion-refresh-btn" onclick="renderSuggestions('${type}')">ðŸŽ² Yenile</button>`;
        
        container.innerHTML = html;
        container.style.display = "flex";
    }

    function applySuggestion(prefix, text) {
        const input = document.getElementById("userInput");
        input.value = prefix + text;
        autoResize(input);
        input.focus();
    }

    function triggerImageGeneration() {
        closeAttachMenu();
        setAppMode("image");
        document.getElementById("userInput").value = "";
        document.getElementById("userInput").focus();
        renderSuggestions('image');
    }

    function triggerVideoGeneration() {
        closeAttachMenu();
        setAppMode("video");
        document.getElementById("userInput").value = "";
        document.getElementById("userInput").focus();
        renderSuggestions('video');
    }

    function triggerGameGeneration() {
        closeAttachMenu();
        setAppMode("game");
        document.getElementById("userInput").value = "";
        document.getElementById("userInput").focus();
        renderSuggestions('game');
    }

    async function handleDocSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            alert("Dosya Ã§ok bÃ¼yÃ¼k! LÃ¼tfen 5MB'dan kÃ¼Ã§Ã¼k belgeler yÃ¼kleyin.");
            if (event.target.id === 'docUpload') event.target.value = '';
            return;
        }

        selectedStudyFileName = file.name;
        
        if (file.type === "application/pdf") {
            try {
                // PDF.js worker ayarÄ±
                if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                }
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    fullText += pageText + "\n";
                }
                
                const userInput = document.getElementById("userInput");
                userInput.value += `\n[${file.name} Ä°Ã‡ERÄ°ÄžÄ°]:\n${fullText}\n`;
                autoResize(userInput);
                alert("âœ… PDF baÅŸarÄ±yla okundu ve yazÄ± alanÄ±na metin olarak eklendi!");
            } catch (err) {
                console.error("PDF okuma hatasÄ±:", err);
                alert("PDF okunamadÄ±. LÃ¼tfen iÃ§eriÄŸi kopyalayÄ±p yapÄ±ÅŸtÄ±rÄ±n.");
            }
        } else {
            // txt, py, js vb. dosyalar iÃ§in Base64'e Ã§evirip normal eki olarak ekle
            processFileAsBase64(file, false);
        }
        
        if (event.target.id === 'docUpload') event.target.value = '';
    }

    // ----- AYARLAR (SETTINGS) -----
    function openSettings() {
        document.getElementById('settingsOverlay').classList.add('active');
        const settingsMenu = document.getElementById('settingsMenu');
        settingsMenu.style.display = 'flex';
        settingsMenu.style.transition = 'opacity 0.3s';
        
        const currentKey = localStorage.getItem('groq_api_key') || "";
        document.getElementById('groqApiKeyInput').value = currentKey;

        const currentGeminiKey = localStorage.getItem('gemini_api_key') || "";
        document.getElementById('geminiApiKeyInput').value = currentGeminiKey;

        document.getElementById('nvidiaApiKeyInput').value = localStorage.getItem('nvidia_api_key') || "";
        document.getElementById('openrouterApiKeyInput').value = localStorage.getItem('openrouter_api_key') || "";
        document.getElementById('cloudflareAccountIdInput').value = localStorage.getItem('cloudflare_account_id') || "";
        document.getElementById('cloudflareApiTokenInput').value = localStorage.getItem('cloudflare_api_token') || "";

        const currentOllamaIp = localStorage.getItem('ollama_ip') || "";
        document.getElementById('ollamaIpInput').value = currentOllamaIp;

        const currentTtsUrl = localStorage.getItem('tts_url') || "";
        document.getElementById('ttsUrlInput').value = currentTtsUrl;

        const currentAzureKey = localStorage.getItem('azure_speech_key') || "";
        document.getElementById('azureKeyInput').value = currentAzureKey;

        const currentAzureRegion = localStorage.getItem('azure_speech_region') || "";
        document.getElementById('azureRegionInput').value = currentAzureRegion;

        const currentVideoMode = localStorage.getItem('video_mode') || "fast";
        document.getElementById('videoModeSelect').value = currentVideoMode;
        
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

    function saveSettings() {
        const key = document.getElementById('groqApiKeyInput').value.trim();
        localStorage.setItem('groq_api_key', key);

        const geminiKey = document.getElementById('geminiApiKeyInput').value.trim();
        localStorage.setItem('gemini_api_key', geminiKey);

        const nvidiaKey = document.getElementById('nvidiaApiKeyInput').value.trim();
        localStorage.setItem('nvidia_api_key', nvidiaKey);

        const openrouterKey = document.getElementById('openrouterApiKeyInput').value.trim();
        localStorage.setItem('openrouter_api_key', openrouterKey);

        const cloudflareAccountId = document.getElementById('cloudflareAccountIdInput').value.trim();
        localStorage.setItem('cloudflare_account_id', cloudflareAccountId);

        const cloudflareApiToken = document.getElementById('cloudflareApiTokenInput').value.trim();
        localStorage.setItem('cloudflare_api_token', cloudflareApiToken);

        const ollamaIp = document.getElementById('ollamaIpInput').value.trim();
        localStorage.setItem('ollama_ip', ollamaIp);

        const ttsUrl = document.getElementById('ttsUrlInput').value.trim();
        localStorage.setItem('tts_url', ttsUrl);

        const azureKey = document.getElementById('azureKeyInput').value.trim();
        localStorage.setItem('azure_speech_key', azureKey);

        const azureRegion = document.getElementById('azureRegionInput').value.trim();
        localStorage.setItem('azure_speech_region', azureRegion);

        const videoMode = document.getElementById('videoModeSelect').value;
        localStorage.setItem('video_mode', videoMode);

        closeSettings();
        alert("Ayarlar kaydedildi!");
    }

    let sessions = {}; // TÃ¼m sohbetleri tutan obje
    let currentChatId = null;

    // ----- HAFIZA (LOCALSTORAGE) YÃ–NETÄ°MÄ° -----
    function saveDatabase() {
        let clonedSessions = JSON.parse(JSON.stringify(sessions));
        for(let id in clonedSessions) {
            for(let msg of clonedSessions[id].messages) {
                // Not: Images are now stored as full data URLs.
            }
        }
        try {
            const dbKey = "cinocode_db_" + (loggedUser || "default");
            localStorage.setItem(dbKey, JSON.stringify({ sessions: clonedSessions, currentChatId }));
        } catch (e) {
            console.error("Localstorage save error", e);
        }
        renderSidebar();
    }

    function loadDatabase() {
        const dbKey = "cinocode_db_" + (loggedUser || "default");
        let saved = localStorage.getItem(dbKey);
        
        if (saved) {
            const db = JSON.parse(saved);
            sessions = db.sessions || {};
            currentChatId = db.currentChatId;
        }

        // EÄŸer hiÃ§ sohbet yoksa yeni oluÅŸtur
        if (Object.keys(sessions).length === 0 || !currentChatId || !sessions[currentChatId]) {
            createNewChat();
        } else {
            renderSidebar();
            renderCurrentChat();
        }
    }

    function createNewChat() {
        const newId = "chat_" + Date.now();
        sessions[newId] = {
            title: "Yeni Sohbet",
            messages: [{ role: "system", content: systemPrompt }],
            updatedAt: Date.now()
        };
        currentChatId = newId;
        saveDatabase();
        renderCurrentChat();
    }

    function switchChat(id) {
        currentChatId = id;
        saveDatabase();
        renderCurrentChat();
        window.speechSynthesis.cancel();
        // Sohbet deÄŸiÅŸtirildiÄŸinde kesinlikle en alta kaydÄ±r
        setTimeout(scrollToBottom, 100);
        setTimeout(scrollToBottom, 400);
        setTimeout(scrollToBottom, 1000);
    }

    function deleteChat(id, event) {
        event.stopPropagation(); // SatÄ±ra tÄ±klamayÄ± engelle
        if(confirm("Sohbeti silmek istediÄŸine emin misin?")) {
            delete sessions[id];
            if (currentChatId === id) {
                const remaining = Object.keys(sessions);
                currentChatId = remaining.length > 0 ? remaining[remaining.length-1] : null;
            }
            if(!currentChatId) {
                createNewChat();
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
    document.addEventListener('click', () => {
        document.querySelectorAll('.chat-action-menu').forEach(menu => menu.classList.remove('active'));
    });
    function pinChat(id, event) {
        event.stopPropagation();
        sessions[id].isPinned = !sessions[id].isPinned;
        saveDatabase();
        renderSidebar();
    }

    function renameChat(id, event) {
        event.stopPropagation(); // TÄ±klamayÄ± engelle
        const currentTitle = sessions[id].title;
        const newTitle = prompt("Sohbetin yeni adÄ±nÄ± girin:", currentTitle);
        if (newTitle !== null && newTitle.trim() !== "") {
            sessions[id].title = newTitle.trim();
            saveDatabase();
        }
    }

    // ----- UI RENDER Ä°ÅžLEMLERÄ° -----
    function renderSidebar() {
        chatListDiv.innerHTML = "";
        
        // Tarihe gÃ¶re sÄ±rala (en yeni en Ã¼stte)
        const sortedIds = Object.keys(sessions).sort((a,b) => sessions[b].updatedAt - sessions[a].updatedAt);
        
        sortedIds.forEach(id => {
            const chat = sessions[id];
            const div = document.createElement("div");
            div.className = `chat-item ${id === currentChatId ? "active" : ""}`;
            div.onclick = () => switchChat(id);
            
            div.innerHTML = `
                <div class="chat-item-title" style="flex: 1; display: flex; align-items: center; gap: 6px;">
                    ${chat.isPinned ? "ðŸ“Œ" : "ðŸ’¬"} <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${chat.title}</span>
                </div>
                <div class="chat-actions" style="display: flex; gap: 4px; align-items: center;">
                    <button class="action-btn" onclick="renameChat('${id}', event)" title="Yeniden AdlandÄ±r" style="color: #f9e2af; padding: 2px; font-size: 13px;">âœï¸</button>
                    <button class="action-btn" onclick="deleteChat('${id}', event)" title="Sil" style="color: #f38ba8; padding: 2px; font-size: 13px;">ðŸ—‘ï¸</button>
                    <button class="action-btn" onclick="pinChat('${id}', event)" title="${chat.isPinned ? 'Sabitlemeyi KaldÄ±r' : 'Sabitle'}" style="padding: 2px; font-size: 13px;">ðŸ“Œ</button>
                </div>
            `;

            chatListDiv.appendChild(div);
        });
    }

    function renderContentWithImages(text, isLast = false) {
        // HafÄ±za sistemini yakala (KullanÄ±cÄ± arayÃ¼zÃ¼nde BÄ°LMEMESÄ° GEREKÄ°YOR, TERTEMÄ°Z GÄ°ZLÄ° KALMALI)
        text = text.replace(/\[REMEMBER:([\s\S]*?)\]/gi, (match, fact) => {
            let memory = localStorage.getItem('cinocode_memory_' + (loggedUser || "default")) || "";
            if (!memory.includes(fact.trim())) {
                memory += "\n- " + fact.trim();
                localStorage.setItem('cinocode_memory_' + (loggedUser || "default"), memory);
                console.log("Memory saved: ", fact);
            }
            return ""; 
        });

        // SÄ±zÄ±ntÄ±larÄ± UI'dan temizle
        let safeText = sanitizeAssistantOutput(text);

        let html = marked.parse(safeText);
        html = html.replace(/\[GENERATE_IMAGE:\s*(.*?)\]/gi, (match, promptText) => {
            let finalPrompt = buildCleanMediaPrompt(promptText, "image");
            lastMediaPrompt = finalPrompt;
            lastMediaType = "image";
            
            const encodedPrompt = encodeURIComponent(finalPrompt);
            const randomSeed = Math.floor(Math.random() * 1000000);
            
            // Orijinal URL
            const rawUrl = `image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${randomSeed}`;
            // DNS engellerini aÅŸmak iÃ§in wsrv.nl (Cloudflare proxy) kullanÄ±yoruz
            const imgUrl = `https://wsrv.nl/?url=${rawUrl}`;
            
            if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
            if(!window.artifactRenderedSet.has(imgUrl)) {
                window.artifactRenderedSet.add(imgUrl);
                setTimeout(() => addArtifactToList('image', finalPrompt.substring(0, 15) + '...', imgUrl), 100);
            }
            return `<div style="text-align:center; margin: 15px 0; background: #181825; padding: 10px; border-radius: 12px; border: 1px solid #45475a;">
                        <img src="${imgUrl}" style="max-width:100%; border-radius:8px; display:block; margin: 0 auto 10px auto; min-height: 200px; background: #1e1e2e url('https://placehold.co/1024x1024/1e1e2e/cdd6f4?text=ðŸŽ¨+Ciziliyor...+Lutfen+Bekleyin') center/cover no-repeat;" onerror="this.src='https://placehold.co/1024x1024/f38ba8/11111b?text=Baglanti+Hatasi'">
                        <button class="run-code-btn" style="background:#89b4fa; color:#11111b; width:auto; padding:8px 15px;" onclick="downloadImage('${imgUrl}', 'CinoCode_Gorsel.jpg')">ðŸ“¥ Resmi Ä°ndir</button>
                    </div>`;
        });
        // VIDEO regex
        html = html.replace(/\[GENERATE_VIDEO:\s*(.*?)\]/gi, (match, promptText) => {
            let finalPrompt = buildCleanMediaPrompt(promptText, "video");
            lastMediaPrompt = finalPrompt;
            lastMediaType = "video";
            
            window.videoCache = window.videoCache || {};
            if (window.videoCache[finalPrompt]) {
                const cachedUrl = window.videoCache[finalPrompt];
                return `<div style="text-align:center; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                            <div style="color: #a6e3a1; font-size: 14px; margin-bottom: 10px;">âœ… AI Video (Ã–nbellekten)</div>
                            <video controls autoplay style="max-width:100%; border-radius: 8px; border: 2px solid #89b4fa; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" src="${cachedUrl}"></video>
                            <br>
                            <button class="run-code-btn" style="background: linear-gradient(135deg, #89b4fa, #cba6f7); color:#11111b; width:auto; padding:10px 20px; margin-top:10px; font-weight:bold; border-radius: 8px;" onclick="downloadVideo('${cachedUrl}')">ðŸ“¥ Videoyu Ä°ndir (WebM)</button>
                        </div>`;
            }
            
            window.queuedVideoPrompts = window.queuedVideoPrompts || new Set();
            const videoId = 'video-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
            
            if (window.queuedVideoPrompts.has(finalPrompt)) {
                return `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                            <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ AI Video OluÅŸturuluyor...</div>
                            <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                                <div id="${videoId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                            </div>
                            <div id="${videoId}-status" style="color: #a6adc8; font-size: 13px;">Kuyrukta veya iÅŸlemde...</div>
                            <button class="run-code-btn" style="background: #f38ba8; color: #11111b; font-size: 11px; padding: 4px 8px; margin-top: 8px; font-weight: bold;" onclick="cancelVideoGeneration('${videoId}')">âŒ Ä°ptal Et</button>
                        </div>`;
            }
            
            if (isLast) {
                window.queuedVideoPrompts.add(finalPrompt);
                setTimeout(() => queueVideoSlideshow(finalPrompt, videoId), 200);
                return `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                            <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ AI Video OluÅŸturuluyor...</div>
                            <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                                <div id="${videoId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                            </div>
                            <div id="${videoId}-status" style="color: #a6adc8; font-size: 13px;">Sahneler hazÄ±rlanÄ±yor...</div>
                            <button class="run-code-btn" style="background: #f38ba8; color: #11111b; font-size: 11px; padding: 4px 8px; margin-top: 8px; font-weight: bold;" onclick="cancelVideoGeneration('${videoId}')">âŒ Ä°ptal Et</button>
                        </div>`;
            } else {
                const escapedPrompt = promptText.replace(/'/g, "\\'");
                return `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                            <div style="color: #a6adc8; font-size: 14px; margin-bottom: 10px;">ðŸŽ¬ Video Ä°steÄŸi: "${promptText.substring(0, 40)}${promptText.length > 40 ? '...' : ''}"</div>
                            <button class="run-code-btn" style="background: linear-gradient(135deg, #89b4fa, #cba6f7); color:#11111b; width:auto; padding:10px 20px; font-weight:bold; border-radius: 8px;" onclick="triggerVideoRenderOnDemand('${escapedPrompt}', '${videoId}')">ðŸŽ¬ Videoyu OluÅŸtur</button>
                        </div>`;
            }
        });
        return html;
    }

    async function downloadImage(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
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
            console.error("Ä°ndirme hatasÄ±:", e);
            window.open(url, '_blank'); // Fallback olarak yeni sekmede aÃ§
        }
    }

    // ========== AI VIDEO SLIDESHOW MOTORU ==========
    let isVideoGenerating = false; 
    let videoQueue = []; // Video taleplerini sÄ±rayla iÅŸlemek iÃ§in kuyruk yapÄ±sÄ±
    const maxQueueLength = 3;
    let activeRecorder = null; // Aktif MediaRecorder referansÄ±
    let isGenerationCancelled = false; // Ä°ptal kontrol flag'i

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
                <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ AI Video OluÅŸturuluyor...</div>
                <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                    <div id="${containerId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                </div>
                <div id="${containerId}-status" style="color: #a6adc8; font-size: 13px;">Sahneler hazÄ±rlanÄ±yor...</div>
                <button class="run-code-btn" style="background: #f38ba8; color: #11111b; font-size: 11px; padding: 4px 8px; margin-top: 8px; font-weight: bold;" onclick="cancelVideoGeneration('${containerId}')">âŒ Ä°ptal Et</button>
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
            card.innerHTML = `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                                <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ AI Video OluÅŸturuluyor...</div>
                                <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                                    <div id="${videoId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                                </div>
                                <div id="${videoId}-status" style="color: #a6adc8; font-size: 13px;">Sahneler hazÄ±rlanÄ±yor...</div>
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

    function queueVideoSlideshow(prompt, containerId) {
        if (videoQueue.length >= maxQueueLength) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div style="color: #f38ba8; padding: 10px;">âŒ Kuyruk dolu! (Maksimum 3 video bekleyebilir). LÃ¼tfen daha sonra deneyin.</div>';
            }
            return;
        }
        

        videoQueue.push({ prompt, containerId });
        processVideoQueue();
    }

    function cancelVideoGeneration(containerId) {
        // 1. EÄŸer kuyruktaki bir video ise kuyruktan sil
        const queueIdx = videoQueue.findIndex(item => item.containerId === containerId);
        let wasActive = false;
        
        if (queueIdx !== -1) {
            const item = videoQueue[queueIdx];
            if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(item.prompt);
            videoQueue.splice(queueIdx, 1);
            console.log("Kuyruktaki video iptal edildi.");
        } else if (isVideoGenerating) {
            // 2. EÄŸer ÅŸu an Ã¼retilen video ise motoru durdur
            isGenerationCancelled = true;
            wasActive = true;
            if (window.queuedVideoPrompts && window.currentVideoPrompt) {
                window.queuedVideoPrompts.delete(window.currentVideoPrompt);
            }
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                try { activeRecorder.stop(); } catch(e){}
            }
            console.log("Aktif video Ã¼retimi iptal edildi.");
        }

        // ArayÃ¼zÃ¼ temizle
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<div style="color: #f38ba8; padding: 10px;">âš ï¸ Video Ã¼retimi iptal edildi.</div>';
        }

        // Not: isGenerationCancelled false yapma iÅŸlemi executeVideoGeneration iÃ§indeki finally bloÄŸunda yapÄ±lÄ±yor.
        // AynÄ± ÅŸekilde processVideoQueue de o fonksiyon bitince otomatik Ã§aÄŸrÄ±lÄ±yor. 
        // Sadece bekleyen hiÃ§bir ÅŸey yoksa (kuyruktan silindiyse vs.) tetikleyebiliriz.
        if (!isVideoGenerating && !wasActive) {
            processVideoQueue();
        }
    }

    async function processVideoQueue() {
        if (isVideoGenerating || videoQueue.length === 0) {
            // EÄŸer aktif bir video varsa veya kuyruk boÅŸsa bekle
            if (videoQueue.length > 1) {
                const nextItem = videoQueue[videoQueue.length - 1];
                const statusTxt = document.getElementById(nextItem.containerId + '-status');
                if (statusTxt) {
                    statusTxt.textContent = `â³ Kuyrukta bekleniyor... SÄ±ra: ${videoQueue.length - 1}`;
                }
            }
            return;
        }

        const task = videoQueue.shift();
        await executeVideoGeneration(task.prompt, task.containerId);
        processVideoQueue(); // Bir sonraki gÃ¶reve geÃ§
    }

    async function executeVideoGeneration(prompt, containerId) {
        const container = document.getElementById(containerId);
        const progressBar = document.getElementById(containerId + '-progress');
        const statusText = document.getElementById(containerId + '-status');
        if (!container) return;

        // MediaRecorder desteÄŸi kontrolÃ¼
        if (typeof MediaRecorder === 'undefined') {
            container.innerHTML = '<div style="color: #f38ba8; padding: 20px;">âŒ TarayÄ±cÄ±nÄ±z video kaydÄ±nÄ± desteklemiyor. LÃ¼tfen Chrome veya Edge kullanÄ±n.</div>';
            return;
        }

        isVideoGenerating = true;
        window.currentVideoPrompt = prompt;

        try {
            const savedMode = localStorage.getItem('video_mode') || 'fast';
            let SCENE_COUNT = 3;
            let SCENE_DURATION = 3500; 
            let FPS = 15;
            let WIDTH = 384;
            let HEIGHT = 384;
            let modeLabel = "HÄ±zlÄ±";

            if (savedMode === 'turbo') {
                SCENE_COUNT = 4;
                SCENE_DURATION = 2500;
                FPS = 12;
                WIDTH = 384;
                HEIGHT = 384;
                modeLabel = "Turbo";
            } else if (savedMode === 'standard') {
                SCENE_COUNT = 5;
                SCENE_DURATION = 4000; 
                FPS = 20;
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Standart";
            } else if (savedMode === 'cinematic') {
                SCENE_COUNT = 8;
                SCENE_DURATION = 4500; 
                FPS = 24; 
                WIDTH = 512;
                HEIGHT = 512;
                modeLabel = "Sinematik";
            }

            const videoDurationSec = Math.round((SCENE_COUNT * SCENE_DURATION) / 1000);

            // 1. ADIM: AI gÃ¶rsellerini Ã¼ret
            const images = [];
            const variations = [
                'wide angle establishing shot', 'dramatic close up detail',
                'aerial view from above', 'sunset golden hour lighting',
                'misty dawn atmosphere', 'night scene neon lights',
                'cinematic side perspective', 'epic panoramic landscape',
                'gorgeous macro shot', 'action tracking view',
                'high contrast moody lighting', 'vibrant colorful landscape'
            ];

            // BÃ¼tÃ¼n sahneleri aynÄ± anda indir (Paralel iÅŸlem hÄ±zÄ±!)
            const batchSize = SCENE_COUNT;
            for (let batch = 0; batch < SCENE_COUNT; batch += batchSize) {
                const batchPromises = [];
                const batchEnd = Math.min(batch + batchSize, SCENE_COUNT);
                
                // Tahmini kalan sÃ¼reyi hesapla
                const remainingImages = SCENE_COUNT - batch;
                const estSeconds = Math.ceil(remainingImages * 3.5); // resim baÅŸÄ±na ~3.5 sn

                if (statusText) statusText.textContent = `ðŸš€ [${modeLabel} Mod] Sahneler indiriliyor... (${Math.min(batch + batchSize, SCENE_COUNT)}/${SCENE_COUNT}) - Kalan sÃ¼re: ~${estSeconds + videoDurationSec} sn (Video SÃ¼resi: ${videoDurationSec} sn)`;
                if (progressBar) progressBar.style.width = ((batch / SCENE_COUNT) * 50) + '%';

                for (let i = batch; i < batchEnd; i++) {
                    const scenePrompt = `${prompt}, ${variations[i]}, cinematic 4k, masterpiece`;
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

            if (images.length < 2) {
                console.error(`[VIDEO FATAL] Video render failed. Expected 2 scenes, got ${images.length}. Check network tab for pollination errors.`);
                container.innerHTML = `<div style="color: #f38ba8; padding: 20px;">âŒ Video oluÅŸturulamadÄ±. ${SCENE_COUNT} sahneden 0 gÃ¶rsel yÃ¼klendi. Console'da baÅŸarÄ±sÄ±z URL'ler yazdÄ±rÄ±ldÄ±.</div>`;
                if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(prompt);
                return;
            }

            // 2. ADIM: Canvas oluÅŸtur ve animasyonu kaydet
            const canvas = document.createElement('canvas');
            canvas.width = WIDTH;
            canvas.height = HEIGHT;
            const ctx = canvas.getContext('2d');

            // MediaRecorder baÅŸlat
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
            activeRecorder = recorder; // Ä°ptal kontrolÃ¼ iÃ§in kaydet
            recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

            const videoReady = new Promise((resolve) => {
                recorder.onstop = () => {
                    const blob = new Blob(chunks, { type: 'video/webm' });
                    resolve(blob);
                };
            });

            recorder.start();

            // 3. ADIM: Ken Burns animasyonu Ã§alÄ±ÅŸtÄ±r
            const totalFrames = images.length * (SCENE_DURATION / 1000) * FPS;
            const framesPerScene = (SCENE_DURATION / 1000) * FPS;
            const transitionFrames = Math.floor(FPS * 1); // 1 saniyelik geÃ§iÅŸ
            let frame = 0;

            await new Promise((resolve) => {
                function renderFrame() {
                    // EÄŸer video iptal edildiyse iÅŸlemi anÄ±nda sonlandÄ±r
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

                    // Ken Burns efekti: yavaÅŸ zoom + pan
                    const zoomStart = 1.0;
                    const zoomEnd = 1.15;
                    const zoom = zoomStart + (zoomEnd - zoomStart) * progress;
                    const panX = Math.sin(progress * Math.PI) * 30 * (sceneIndex % 2 === 0 ? 1 : -1);
                    const panY = Math.cos(progress * Math.PI) * 20 * (sceneIndex % 3 === 0 ? 1 : -1);

                    // Ana sahneyi Ã§iz
                    ctx.save();
                    ctx.translate(WIDTH / 2 + panX, HEIGHT / 2 + panY);
                    ctx.scale(zoom, zoom);
                    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
                    ctx.drawImage(images[sceneIndex], 0, 0, WIDTH, HEIGHT);
                    ctx.restore();

                    // Crossfade geÃ§iÅŸi (son 1 saniye)
                    if (frameInScene >= framesPerScene - transitionFrames && nextSceneIndex !== sceneIndex) {
                        const alpha = (frameInScene - (framesPerScene - transitionFrames)) / transitionFrames;
                        ctx.globalAlpha = alpha;
                        ctx.drawImage(images[nextSceneIndex], 0, 0, WIDTH, HEIGHT);
                        ctx.globalAlpha = 1.0;
                    }

                    // Ä°lerleme gÃ¼ncelle
                    const totalProgress = 60 + (frame / totalFrames) * 35;
                    if (progressBar) progressBar.style.width = totalProgress + '%';

                    // Kalan saniye hesabÄ± (20 FPS hÄ±zÄ±yla render ediliyor)
                    const remainingFrames = totalFrames - frame;
                    const remainingSecs = Math.ceil(remainingFrames / FPS);
                    if (statusText) statusText.textContent = `ðŸŽ¬ Video kaydediliyor... (${Math.floor(totalProgress)}%) - Kalan sÃ¼re: ~${remainingSecs} saniye`;

                    frame++;
                    // requestAnimationFrame yerine setTimeout ile FPS kontrolÃ¼
                    setTimeout(renderFrame, 1000 / FPS);
                }
                renderFrame();
            });

            // 4. ADIM: KaydÄ± durdur ve videoyu gÃ¶ster
            if (activeRecorder && activeRecorder.state !== 'inactive') {
                try { activeRecorder.stop(); } catch(e){}
            }
            const videoBlob = await videoReady;

            // EÄŸer son aÅŸamada iptal edildiyse HTML'i gÃ¼ncelleme
            if (isGenerationCancelled) {
                return;
            }

            const videoUrl = URL.createObjectURL(videoBlob);
            
            // Cache the video URL in session dict
            window.videoCache = window.videoCache || {};
            window.videoCache[prompt] = videoUrl;
            if (window.queuedVideoPrompts) {
                window.queuedVideoPrompts.delete(prompt);
            }

            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = 'âœ… Video hazÄ±r!';

            // Video oynatÄ±cÄ±yÄ± ekrana bas
            container.innerHTML = `
                <div style="text-align:center; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                    <div style="color: #a6e3a1; font-size: 14px; margin-bottom: 10px;">âœ… AI Video baÅŸarÄ±yla oluÅŸturuldu! (${images.length} sahne, ~${videoDurationSec} saniye)</div>
                    <video controls autoplay style="max-width:100%; border-radius: 8px; border: 2px solid #89b4fa; box-shadow: 0 4px 12px rgba(0,0,0,0.5);" src="${videoUrl}"></video>
                    <br>
                    <button class="run-code-btn" style="background: linear-gradient(135deg, #89b4fa, #cba6f7); color:#11111b; width:auto; padding:10px 20px; margin-top:10px; font-weight:bold; border-radius: 8px;" onclick="downloadVideo('${videoUrl}')">ðŸ“¥ Videoyu Ä°ndir (WebM)</button>
                </div>
            `;

            // Artifacts paneline ekle
            if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
            if(!window.artifactRenderedSet.has(videoUrl)) {
                window.artifactRenderedSet.add(videoUrl);
                setTimeout(() => addArtifactToList('video', 'ðŸŽ¬ ' + prompt.substring(0, 12) + '...', videoUrl), 100);
            }
        } catch (err) {
            console.error("Video render hatasÄ±:", err);
            if (window.queuedVideoPrompts) window.queuedVideoPrompts.delete(prompt);
            if (container) {
                container.innerHTML = `<div style="color: #f38ba8; padding: 20px;">âŒ Video oluÅŸturulurken teknik bir sorun oluÅŸtu: ${err.message}</div>`;
            }
        } finally {
            isVideoGenerating = false; // Yeni video Ã¼retimini serbest bÄ±rak
            activeRecorder = null;
            // Ä°ptal bayraÄŸÄ±nÄ± temizle
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

    
    function editMessage(index) {
        const chat = sessions[currentChatId];
        const msg = chat.messages[index];
        userInput.value = msg.content;
        autoResize(userInput);
        userInput.focus();
        chat.messages = chat.messages.slice(0, index);
        saveDatabase();
        renderCurrentChat();
    }
    
    function copyMessage(index, btn) {
        const msg = sessions[currentChatId].messages[index];
        navigator.clipboard.writeText(msg.content);
        const oldText = btn.innerText;
        btn.innerText = "âœ…";
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
            
            userInput.value = lastUserMsg.content;
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
        
        // EÄŸer sadece system prompt varsa (yeni sohbet) Quick Start gÃ¶ster
        if (history.length <= 1) {
            document.getElementById("welcomeScreen").style.display = "flex";
            messagesDiv.style.display = "none";
        } else {
            document.getElementById("welcomeScreen").style.display = "none";
            messagesDiv.style.display = "flex";
        }

        history.forEach((msg, index) => {
            if (msg.role === "system") return; 
            
            const div = document.createElement("div");
            div.className = `message ${msg.role === "user" ? "user" : "bot"}`;
            
            if (msg.role === "user") {
                let htmlContent = `<div>${msg.content}</div>`;
                if (msg.images && msg.images.length > 0) {
                    htmlContent += `<img src="${msg.images[0]}" style="max-height:200px; border-radius:8px; display:block; margin-top:8px; border: 2px solid #89b4fa;">`;
                }
                htmlContent += `<div class="msg-actions"><button class="msg-action-btn" onclick="editMessage(${index})" title="DÃ¼zenle">âœï¸</button></div>`;
                div.innerHTML = htmlContent;
            } else {
                div.innerHTML = renderContentWithImages(msg.content, index === history.length - 1);
                addCopyButtons(div);
                
                const actionDiv = document.createElement("div");
                actionDiv.className = "msg-actions";
                actionDiv.innerHTML = `
                    <button class="msg-action-btn" onclick="copyMessage(${index}, this)" title="Kopyala">ðŸ“‹</button>
                    <button class="msg-action-btn" onclick="speakMessage(${index})" title="Sesli Oku">ðŸ”Š</button>
                    ${index === history.length - 1 ? `<button class="msg-action-btn" onclick="regenerateMessage()" title="Yeniden Ãœret">ðŸ”„</button>` : ''}
                `;
                div.appendChild(actionDiv);
            }
            messagesDiv.appendChild(div);
        });
        // En sona gÃ¶rÃ¼nmez bir Ã§apa (anchor) div ekle
        let bottomAnchor = document.getElementById('chat-bottom-anchor');
        if (!bottomAnchor) {
            bottomAnchor = document.createElement('div');
            bottomAnchor.id = 'chat-bottom-anchor';
            bottomAnchor.style.height = '1px';
        }
        messagesDiv.appendChild(bottomAnchor);
        // Birden fazla gecikmeyle scroll yap (resimler/kodlar yÃ¼klenene kadar)
        scrollToBottom();
        setTimeout(scrollToBottom, 150);
        setTimeout(scrollToBottom, 500);
    }

    function scrollToBottom() {
        // CSS'teki scroll-behavior: smooth kaydÄ±rmayÄ± yavaÅŸlatÄ±yor, geÃ§ici olarak kapat
        messagesDiv.style.scrollBehavior = 'auto';
        messagesDiv.scrollTop = messagesDiv.scrollHeight + 99999;
        // KÄ±sa bir sÃ¼re sonra smooth'a geri dÃ¶n (yeni mesaj yazarken gÃ¼zel gÃ¶rÃ¼nsÃ¼n)
        setTimeout(() => { messagesDiv.style.scrollBehavior = 'smooth'; }, 100);
    }

    // ----- SESLÄ° KONUÅžMA (TTS & STT) -----
    let isRecording = false;
    let recognition = null;
    let speechTimeout = null;
    
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true; // Kapanmadan sÃ¼rekli dinlemeye Ã§alÄ±ÅŸsÄ±n
        recognition.interimResults = true; // GerÃ§ek zamanlÄ± (interim) sonuÃ§larÄ± gÃ¶ster, bÃ¶ylece kelimeleri anÄ±nda yakalar
        recognition.maxAlternatives = 3; // En yÃ¼ksek olasÄ±lÄ±klÄ± 3 alternatifi getir
        recognition.lang = 'tr-TR';
        
        recognition.onstart = () => { 
            isRecording = true; 
            document.getElementById("micBtn").classList.add("listening"); 
            userInput.placeholder = "Dinliyorum... KonuÅŸun..."; 
        };
        
        recognition.onresult = (e) => {
            let finalStr = '';
            let interimStr = '';
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                const result = e.results[i];
                const textVal = result[0].transcript;
                const confidence = result[0].confidence !== undefined && result[0].confidence !== null ? result[0].confidence : 1.0;
                
                console.log(`STT Transcript: "${textVal}" | GÃ¼ven OranÄ± (Confidence): ${confidence}`);
                
                if (result.isFinal) {
                    finalStr += textVal;
                } else {
                    interimStr += textVal;
                }
            }
            
            if (finalStr !== '') { 
                userInput.value += (userInput.value ? " " : "") + finalStr.trim(); 
                autoResize(userInput); 
            } else if (interimStr !== '') {
                // KonuÅŸma devam ederken ekrana geÃ§ici olarak bas ki hÄ±zlÄ± algÄ±lansÄ±n
                userInput.placeholder = interimStr;
            }
            
            // Ses geldiÄŸi anda sayacÄ± sÄ±fÄ±rla
            clearTimeout(speechTimeout);
            
            // EÄŸer 3.5 saniye boyunca yeni ses gelmezse ve kutu boÅŸ deÄŸilse GÃ–NDER!
            speechTimeout = setTimeout(() => {
                if (userInput.value.trim() !== "") {
                    sendMessage();
                }
            }, 3500);
        };
        
        recognition.onerror = (err) => {
            console.error("STT HatasÄ±:", err);
            if (err.error === 'not-allowed') {
                alert("Telefondan mikrofona izin vermemiÅŸ olabilirsin! LÃ¼tfen tarayÄ±cÄ± ayarlarÄ±ndan siteye mikrofon izni ver.");
            } else if (err.error !== 'no-speech') {
                alert("Telefon mikrofon hatasÄ±: " + err.error);
            }
            stopMic();
        };
        recognition.onend = () => stopMic();
    }

    function toggleMic() {
        if (!recognition) return alert("TarayÄ±cÄ±nÄ±z mikrofon desteklemiyor.");
        if (isRecording) {
            stopMic();
        } else {
            userInput.value = "";
            try {
                recognition.start();
            } catch(e) {
                console.log("Mikrofon zaten aÃ§Ä±k:", e);
            }
        }
    }
    
    function stopMic() {
        if (!isRecording) return;
        isRecording = false;
        if (recognition) {
            try { recognition.stop(); } catch(e) {}
        }
        clearTimeout(speechTimeout);
        document.getElementById("micBtn").classList.remove("listening");
        userInput.placeholder = "CinoCode'a bir ÅŸeyler sor...";
    }

    let isSpeakerOn = true;
    const synth = window.speechSynthesis;

    function populateVoices() {
        let defaultHtml = `
            <option value="male_local">ðŸ‘¨ðŸ»â€ðŸ¦± Deniz (CihazÄ±n Kendi Sesi)</option>
            <option value="male_edge_tolga">ðŸ‘¨ðŸ¼â€ðŸ¦± Tolga (Standart Erkek)</option>
            <option value="female_gtts">ðŸ‘©ðŸ¼â€ðŸ¦± AyÅŸe Abla (Standart KadÄ±n Sesi)</option>
            <option value="male_gtts">ðŸ§”ðŸ½ CÃ¼neyt Abi (HD Erkek Ses)</option>
            <option value="female_edge">ðŸ‘©ðŸ»â€ðŸ¦° Cino Abla (HD KadÄ±n Ses)</option>
        `;

        let voices = synth.getVoices();
        if (voices.length > 0) {
            defaultHtml += `<optgroup label="Cihaz Sesleri (TÃ¼m Sesler)">`;
            voices.forEach((v, idx) => {
                let isTr = v.lang.includes("tr") ? "ðŸ‡¹ðŸ‡· " : "ðŸŒ ";
                defaultHtml += `<option value="native_${idx}">${isTr}${v.name}</option>`;
            });
            defaultHtml += `</optgroup>`;
        }

        voiceSelect.innerHTML = defaultHtml;

        const savedVoice = localStorage.getItem("cinocode_voice_idx");
        if (savedVoice !== null && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
            voiceSelect.value = savedVoice;
        }
        
        voiceSelect.style.display = "block";
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }
    
    // AnÄ±nda Ã§alÄ±ÅŸtÄ±r ki en azÄ±ndan varsayÄ±lan 5 seÃ§enek hemen dolsun
    populateVoices();

    function saveVoicePref() {
        localStorage.setItem("cinocode_voice_idx", voiceSelect.value);
    }

    function toggleSpeaker() {
        isSpeakerOn = !isSpeakerOn;
        const sBtn = document.getElementById("speakerBtn");
        if (isSpeakerOn) {
            if (sBtn) {
                sBtn.innerText = "ðŸ”Š"; 
                sBtn.classList.add("active");
            }
            voiceSelect.style.display = "block";
        } else {
            if (sBtn) {
                sBtn.innerText = "ðŸ”‡"; 
                sBtn.classList.remove("active");
            }
            voiceSelect.style.display = "none";
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

    function playNextTTS() {
        if (!isSpeakerOn || ttsQueue.length === 0) {
            isPlayingTTS = false;
            return;
        }
        isPlayingTTS = true;
        let text = ttsQueue.shift();
        
        let cleanText = text.replace(/```[\s\S]*?```/g, " kod parÃ§asÄ± ").replace(/`.*?`/g, "").replace(/[#*_-]/g, "");
        cleanText = cleanText.replace(/\[GENERATE_IMAGE:.*?\]/g, " Resmi hazÄ±rlÄ±yorum. ");
        cleanText = cleanText.replace(/CinoCode/gi, "Cinokod").trim();
        if (!cleanText) { playNextTTS(); return; }
        
        if (!isSpeakerOn) { isPlayingTTS = false; return; }
        
        const currentSpeechRunId = speechRunId;
        const currentSelectedVoiceId = voiceSelect.value;

        if (currentSelectedVoiceId === "male_local" || currentSelectedVoiceId.startsWith("native_")) {
            speakWithLocalVoice(cleanText, currentSpeechRunId, currentSelectedVoiceId);
        } else {
            speakWithServer(cleanText, currentSpeechRunId, currentSelectedVoiceId);
        }
    }

    function speakWithServer(cleanText, expectedRunId, expectedVoiceId) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) {
            isPlayingTTS = false;
            return;
        }
        let vName = 'male_gtts';
        if (expectedVoiceId === 'female_edge') vName = 'female_gtts';
        if (expectedVoiceId === 'female_gtts') vName = 'female_gtts2';
        if (expectedVoiceId === 'male_edge_tolga') vName = 'male_wavenet_d';
        if (expectedVoiceId === 'male_gtts') vName = 'male_gtts';
        if (expectedVoiceId === 'male_local') vName = 'male_local';
        
        const azureKey = localStorage.getItem("azure_speech_key") || "";
        const azureRegion = localStorage.getItem("azure_speech_region") || "";
        
        let url = getTtsUrl() + "?voice=" + vName + "&text=" + encodeURIComponent(cleanText);
        if (azureKey && azureRegion) {
            url += "&azure_key=" + encodeURIComponent(azureKey) + "&azure_region=" + encodeURIComponent(azureRegion);
        }
        
        if (!window.sharedAudio) window.sharedAudio = new Audio();
        const audio = window.sharedAudio;
        audio.src = url;
        window.currentAudio = audio;
        
        // Google TTS (gTTS) fallback durumunda sesleri deÄŸiÅŸtirmek iÃ§in rate kullanÄ±yoruz, 
        // ama eÄŸer Azure kullanÄ±lÄ±yorsa sesler zaten sunucu tarafÄ±nda (Ahmet, Emel vb.) farklÄ± Ã¼retildiÄŸi iÃ§in rate = 1.0 olmalÄ±.
        let rate = 1.0;
        const isAzureEnabled = azureKey.trim() !== "" && azureRegion.trim() !== "";
        
        if (!isAzureEnabled) {
            if (expectedVoiceId === 'female_edge') rate = 1.18;      // Cino (Tiz/HÄ±zlÄ±)
            else if (expectedVoiceId === 'male_gtts') rate = 0.82;    // CÃ¼neyt (Bas/YavaÅŸ)
            else if (expectedVoiceId === 'male_edge_tolga') rate = 0.92; // Tolga (Hafif kalÄ±n)
        }
        
        audio.defaultPlaybackRate = rate;
        audio.playbackRate = rate;
        
        audio.onplay = () => {
            audio.playbackRate = rate;
        };
        
        audio.onended = () => { 
            if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS(); 
            else isPlayingTTS = false; 
        };
        
        audio.onerror = (err) => {
            console.warn("TTS sunucu hatasÄ±, yerel ses motoruna dÃ¼ÅŸÃ¼lÃ¼yor. Denenen URL:", url, "Hata:", err);
            speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId);
        };
        
        audio.play().catch(e => {
            console.warn("TTS oynatÄ±lamadÄ±, yerel ses motoruna dÃ¼ÅŸÃ¼lÃ¼yor. Hata:", e, "Denenen URL:", url);
            speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId);
        });
    }

    function speakWithLocalVoice(cleanText, expectedRunId, expectedVoiceId) {
        if (!isSpeakerOn || speechRunId !== expectedRunId || voiceSelect.value !== expectedVoiceId) {
            isPlayingTTS = false;
            return;
        }
        const utterance = new SpeechSynthesisUtterance(cleanText);
        let voices = synth.getVoices();
        let trVoices = voices.filter(v => v.lang.includes("tr"));
        
        if (expectedVoiceId.startsWith("native_")) {
            let idx = parseInt(expectedVoiceId.split("_")[1]);
            if (voices[idx]) {
                utterance.voice = voices[idx];
            }
        } else {
            let selectedVoice = null;

            // YardÄ±mcÄ±: Ä°simde geÃ§en kelimelere gÃ¶re ses bulma
            const findVoice = (keywords) => trVoices.find(v => keywords.some(k => v.name.toLowerCase().includes(k)));

            if (expectedVoiceId === "female_gtts" || expectedVoiceId === "female_edge") {
                selectedVoice = findVoice(["yelda", "siri", "female", "kadÄ±n"]) || trVoices[0];
            } else if (expectedVoiceId === "male_gtts" || expectedVoiceId === "male_edge_tolga") {
                selectedVoice = findVoice(["cem", "erkek", "male"]) || (trVoices.length > 1 ? trVoices[1] : trVoices[0]);
            } else {
                selectedVoice = trVoices.length > 2 ? trVoices[2] : trVoices[0];
            }
            
            if (selectedVoice) {
                utterance.voice = selectedVoice;
            } else if (trVoices.length > 0) {
                utterance.voice = trVoices[0];
            } else if (voices.length > 0) {
                utterance.voice = voices[0];
            }

            if (expectedVoiceId === "female_gtts") {
                utterance.pitch = 1.0;
                utterance.rate = 0.95;
            } else if (expectedVoiceId === "female_edge") {
                utterance.pitch = 1.25;
                utterance.rate = 1.05;
            } else if (expectedVoiceId === "male_gtts") {
                utterance.pitch = 0.75;
                utterance.rate = 0.9;
            } else if (expectedVoiceId === "male_edge_tolga") {
                utterance.pitch = 0.95;
                utterance.rate = 1.0;
            } else if (expectedVoiceId === "male_local") {
                utterance.pitch = 1.0;
                utterance.rate = 1.0;
            }
        }
        
        utterance.onend = () => { 
            if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS(); 
            else isPlayingTTS = false; 
        };
        utterance.onerror = () => { 
            if(isSpeakerOn && speechRunId === expectedRunId && voiceSelect.value === expectedVoiceId) playNextTTS(); 
            else isPlayingTTS = false; 
        };
        
        window.currentUtterance = utterance;
        synth.speak(utterance);
    }

    function speakText(text) {
        if (!isSpeakerOn) return;
        ttsQueue.push(text);
        if (!isPlayingTTS) {
            playNextTTS();
        }
    }
    
    // TÃ¼m ses kaynaklarÄ±nÄ± anÄ±nda sustur
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
    }

    function stopSpeaking() {
        speechRunId++; // Her yeni konuÅŸma baÅŸlatma veya durdurma isteÄŸinde run ID artÄ±rÄ±larak eski async istekler kilitlenir
        ttsQueue = [];
        isPlayingTTS = false;
        stopAllAudio();
    }

    // ----- DÄ°ÄžER FONKSÄ°YONLAR -----
    const renderer = new marked.Renderer();
    renderer.code = function(codeOrToken, maybeLang) {
        let code = typeof codeOrToken === 'string' ? codeOrToken : codeOrToken.text;
        let language = typeof codeOrToken === 'string' ? maybeLang : codeOrToken.lang;
        
        let highlighted = code;
        if(language && window.hljs && window.hljs.getLanguage(language)) {
            highlighted = window.hljs.highlight(code, { language }).value;
        }
        
        let runBtn = "";
        if (language === 'html' || language === 'javascript' || language === 'css') {
            let fullHtml = code;
            if (language === 'javascript') fullHtml = `<script>${code}<\\/script>`;
            if (language === 'css') fullHtml = `<style>${code}</style>`;
            
            // URL-encode single quotes to prevent breaking the onclick attribute
            const encodedCode = encodeURIComponent(fullHtml).replace(/'/g, "%27");
            runBtn = `<button class="run-code-btn" onclick="openArtifactOverlay('${encodedCode}')">â–¶ï¸ Kodu Ã‡alÄ±ÅŸtÄ±r / Ã–nizle</button><br>`;
            // Hack to only add to sidebar once per render
            if(!window.artifactRenderedSet) window.artifactRenderedSet = new Set();
            if(!window.artifactRenderedSet.has(encodedCode)) {
                window.artifactRenderedSet.add(encodedCode);
                setTimeout(() => addArtifactToList('code', 'OluÅŸturulan Kod', encodedCode), 100);
            }
        }
        return `<div class="code-wrapper" style="position:relative;">${runBtn}<pre><code class="hljs ${language || ''}">${highlighted}</code></pre></div>`;
    };
    marked.setOptions({ renderer: renderer, breaks: true });

    
    // ----- KÃœTÃœPHANE (LIBRARY) SÄ°STEMÄ° -----
    function saveToLibrary(type, title, encodedContent) {
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}
        
        // KOPYA KONTROLÃœ (DUPLICATE CHECK)
        // AynÄ± iÃ§erik zaten varsa ekleme.
        const isDuplicate = library.some(item => item.type === type && item.content === encodedContent);
        if (isDuplicate) return;

        library.unshift({
            id: Date.now().toString() + Math.floor(Math.random()*10000),
            type: type,
            title: title,
            content: encodedContent,
            date: new Date().toISOString()
        });
        if (library.length > 50) library = library.slice(0, 50); // Kota korumasÄ±
        try { localStorage.setItem('cinocode_library', JSON.stringify(library)); } catch(e) { console.error("KÃ¼tÃ¼phane kayÄ±t hatasÄ±."); }
    }

    function deleteFromLibrary(id) {
        if(!confirm("Bu Ã¶ÄŸeyi kÃ¼tÃ¼phaneden silmek istediÄŸinize emin misiniz?")) return;
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}
        library = library.filter(i => i.id !== id);
        localStorage.setItem('cinocode_library', JSON.stringify(library));
        renderLibrary(currentLibraryTab);
    }

    function addArtifactToList(type, title, encodedContent) {
        saveToLibrary(type, title, encodedContent);
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
        if(tab === 'image') titleEl.innerHTML = "ðŸ–¼ï¸ Resim ArÅŸivi";
        else if(tab === 'video') titleEl.innerHTML = "ðŸŽ¬ Video ArÅŸivi";
        else titleEl.innerHTML = "ðŸ“„ Belgeler";
        
        document.querySelectorAll('.lib-sidebar-btn').forEach(b => b.classList.remove('active-lib'));
        if(tab === 'image') document.getElementById('libNavImage').classList.add('active-lib');
        if(tab === 'video') document.getElementById('libNavVideo').classList.add('active-lib');
        if(tab === 'doc') document.getElementById('libNavDoc').classList.add('active-lib');

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
        if(d.toDateString() === today.toDateString()) return "BugÃ¼n";
        if(d.toDateString() === yesterday.toDateString()) return "DÃ¼n";
        return d.toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' });
    }

    function renderLibrary(tab) {
        const content = document.getElementById('libraryContent');
        const searchTerm = document.getElementById('librarySearch').value.toLowerCase();
        let library = [];
        try { library = JSON.parse(localStorage.getItem('cinocode_library')) || []; } catch(e) {}
        
        let filtered = library.filter(item => item.type === tab);
        if (searchTerm) {
            filtered = filtered.filter(item => item.title.toLowerCase().includes(searchTerm) || formatDateHeader(item.date).toLowerCase().includes(searchTerm));
        }
        
        if(filtered.length === 0) {
            content.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding: 50px; color:#a6adc8;">Bu kategoride henÃ¼z bir iÃ§erik yok veya aramanla eÅŸleÅŸmedi.</div>`;
            return;
        }

        let html = '';
        let currentHeader = '';

        filtered.forEach(item => {
            const dateHeader = formatDateHeader(item.date);
            if(dateHeader !== currentHeader) {
                html += `<div style="grid-column: 1 / -1; margin-top:10px; font-weight:bold; color:#89b4fa; border-bottom:1px solid #313244; padding-bottom:5px;">ðŸ“… ${dateHeader}</div>`;
                currentHeader = dateHeader;
            }

            let icon = item.type === 'image' ? 'ðŸ–¼ï¸' : (item.type === 'video' ? 'ðŸŽ¬' : 'ðŸ’»');
            let action = item.type === 'image' ? `downloadImage('${item.content}', 'CinoCode_Gorsel.jpg')` : `openArtifactOverlay('${item.content}')`;
            if (item.type === 'video') action = `downloadVideo('${item.content}', 'CinoCode_Video.webm')`;
            let btnText = item.type === 'image' ? 'ðŸ“¥ Ä°ndir' : (item.type === 'video' ? 'ðŸ“¥ Ä°ndir' : 'â–¶ï¸ Ã–nizle');

            let previewHtml = '';
            if(item.type === 'image') {
                previewHtml = `<img src="${item.content}" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:10px; border:1px solid #45475a;">`;
            } else if (item.type === 'video') {
                previewHtml = `<video src="${item.content}" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:10px; background:#11111b; border:1px solid #45475a;" controls></video>`;
            } else {
                previewHtml = `<div style="width:100%; height:140px; background:#11111b; border-radius:8px; margin-bottom:10px; border:1px solid #45475a; display:flex; align-items:center; justify-content:center; font-size:40px;">ðŸ“„</div>`;
            }

            html += `
                <div class="artifact-card archive-card" style="position:relative; display:flex; flex-direction:column;">
                    ${previewHtml}
                    <div class="artifact-card-title" style="font-size:13px; margin-bottom:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${icon} <span title="${item.title}">${item.title}</span></div>
                    <div style="display:flex; gap:5px; margin-top:auto;">
                        <button class="artifact-dl-btn" style="flex:1; text-align:center; padding:8px; font-weight:bold;" onclick="${action}">${btnText}</button>
                        <button class="artifact-dl-btn" style="background:#f38ba8; color:#11111b; padding:8px; border-radius:6px;" onclick="deleteFromLibrary('${item.id}')" title="Sil">ðŸ—‘ï¸</button>
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
    function toggleWebSearch() {
        isWebSearchEnabled = !isWebSearchEnabled;
        const btn = document.getElementById("webSearchBtn");
        const menuText = document.getElementById("menuWebSearchText");
        const menuIcon = document.getElementById("menuWebSearchIcon");
        
        if(isWebSearchEnabled) {
            if (btn) btn.classList.add("active");
            userInput.placeholder = "ðŸŒ Web destekli sorun...";
            if (menuText) menuText.textContent = "Derin AraÅŸtÄ±rma (AÃ§Ä±k)";
            if (menuIcon) menuIcon.textContent = "ðŸŒ";
        } else {
            if (btn) btn.classList.remove("active");
            userInput.placeholder = "CinoCode'a bir ÅŸeyler sor...";
            if (menuText) menuText.textContent = "Derin AraÅŸtÄ±rma (KapalÄ±)";
            if (menuIcon) menuIcon.textContent = "ðŸ”";
        }
    }
    
    function toggleWebSearchInMenu() {
        closeAttachMenu();
        toggleWebSearch();
    }
    async function doWebSearch(query) {
        try {
            const url = `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`;
            const res = await fetch(url);
            const data = await res.json();
            if(data.query && data.query.search && data.query.search.length > 0) {
                let snippets = data.query.search.slice(0, 3).map(s => s.snippet.replace(/<\/?[^>]+(>|$)/g, "")).join(" ... ");
                return `Ä°nternet Arama Sonucu (${query}): ` + snippets;
            }
        } catch(e) { console.warn("Arama hatasÄ±", e); }
        return "";
    }

    window.onload = () => {
        if (document.getElementById('loggedInUser')) {
            if (loggedUser) {
                document.getElementById('loggedInUser').innerText = loggedUser;
                document.getElementById('loggedInUserWrapper').style.display = "inline";
            } else {
                document.getElementById('loggedInUserWrapper').style.display = "none";
            }
        }
        loadDatabase();
        repairBadChatTitles();
        checkOllamaStatus();
        setInterval(checkOllamaStatus, 5000);
        setTimeout(populateVoices, 500); // Safari/Firefox fallback

        // Paste (CTRL+V) olayÄ±nÄ± dinle ve kopyalanan resimleri yakala
        document.addEventListener('paste', function(e) {
            if (e.clipboardData && e.clipboardData.items) {
                for (let i = 0; i < e.clipboardData.items.length; i++) {
                    let item = e.clipboardData.items[i];
                    if (item.type.indexOf('image') !== -1) {
                        let file = item.getAsFile();
                        if (file) {
                            const fakeEvent = { target: { files: [file] } };
                            handleImageSelect(fakeEvent);
                            e.preventDefault(); // Metin kutusuna karmaÅŸÄ±k data yapÄ±ÅŸmasÄ±nÄ± engelle
                            return;
                        }
                    }
                }
            }
        });
        // Sayfa yÃ¼klenince kesinlikle en alta kaydÄ±r (resimler, fontlar, her ÅŸey yÃ¼klendikten sonra)
        setTimeout(scrollToBottom, 200);
        setTimeout(scrollToBottom, 600);
        setTimeout(scrollToBottom, 1200);
        setTimeout(scrollToBottom, 2500);

        // ===== DÄ°L KOÃ‡U MODU: persona deÄŸiÅŸim dinleyicisi =====
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) {
            personaSel.addEventListener('change', function() {
                const val = this.value;
                const panel = document.getElementById('dilKocuPanel');
                if (val === 'dil_kocu') {
                    panel.classList.add('active');
                    // Gemini'ye otomatik geÃ§ (TÃ¼rkÃ§e + Ã§ok dil iÃ§in en iyi model)
                    const modelSel = document.getElementById('modelSelect');
                    if (modelSel && !modelSel.value.includes('-gemini')) {
                        modelSel.value = 'gemini-2.0-flash-gemini';
                    }
                    updateDilKocuPrompt();
                    updateDilKocuProgress();
                    updateDilKocuStreak();
                } else {
                    panel.classList.remove('active');
                }
            });
        }

        // Sayfa aÃ§Ä±lÄ±ÅŸÄ±nda dil koÃ§u zaten seÃ§iliyse paneli aÃ§
        if (personaSel && personaSel.value === 'dil_kocu') {
            document.getElementById('dilKocuPanel').classList.add('active');
            updateDilKocuProgress();
            updateDilKocuStreak();
        }
    };

    // ===== DÄ°L KOÃ‡U MODU: Global deÄŸiÅŸkenler =====
    let dilKocuQuizActive = false;
    let dilKocuLessonPrompt = ""; // sendMessage'a enjekte edilecek Ã¶zel prompt

    function getDilKocuLang() {
        const el = document.getElementById('dk-lang');
        return el ? el.value : 'Ä°ngilizce';
    }
    function getDilKocuLevel() {
        const el = document.getElementById('dk-level');
        return el ? el.value : 'BaÅŸlangÄ±Ã§ (A1-A2)';
    }
    function getDilKocuGoal() {
        const el = document.getElementById('dk-goal');
        return el ? parseInt(el.value) : 10;
    }

    // Dil koÃ§u sistemi promptunu (lang+level+quiz) sendMessage'a ekler
    // Bu fonksiyon updateDilKocuPrompt'tan Ã§aÄŸrÄ±lÄ±r, personas["dil_kocu"] Ã¼zerine eklenir
    function getDilKocuInjection() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const goal = getDilKocuGoal();
        const quizNote = dilKocuQuizActive
            ? `\n\nðŸ§  QUIZ MODU AKTÄ°F: Åžu anda kullanÄ±cÄ± quiz modunda. Ona daha Ã¶nce Ã¶ÄŸrettiÄŸin ${lang} kelimelerden seÃ§erek 3-5 soru sor. Format: "TÃ¼rkÃ§esi '...' olan ${lang} kelimesi nedir?" veya "${lang}'de '...' ne anlama gelir?". Her doÄŸru cevabÄ± tebrik et, yanlÄ±ÅŸÄ± nazikÃ§e dÃ¼zelt. Quiz bittikten sonra skoru TÃ¼rkÃ§e olarak sÃ¶yle.`
            : '';
        return `\n\n===== DÄ°L KOÃ‡U MODU AKTÄ°F =====\nHedef Dil: ${lang} | Seviye: ${level} | GÃ¼nlÃ¼k Hedef: ${goal} kelime\n\nBu modda MUTLAKA ÅŸu formatta Ã¶ÄŸret:\n\n**[HEDEF DÄ°LDEKÄ° KELÄ°ME / CÃœMLE]**\n*(OkunuÅŸu: fonetik/IPA)*\nðŸ‡¹ðŸ‡· TÃ¼rkÃ§e anlamÄ±: ...\nðŸ“ Ã–rnek cÃ¼mle:\n  â†’ ${lang}: [Ã¶rnek cÃ¼mle]\n  â†’ TÃ¼rkÃ§e: [Ã§evirisi]\nðŸ’¡ Dilbilgisi/MantÄ±k notu: [TÃ¼rkÃ§e aÃ§Ä±klama]\n\n- Seviye ${level} iÃ§in uygun kelime ve yapÄ±lar kullan.\n- EÄŸer ${level} = 'BaÅŸlangÄ±Ã§ (A1-A2)' ise: selamlama, sayÄ±lar, renkler, gÃ¼nlÃ¼k eylemler, temel kalÄ±plar.\n- EÄŸer ${level} = 'Orta (B1-B2)' ise: zaman kalÄ±plarÄ±, alÄ±ÅŸveriÅŸ/iÅŸ/seyahat diyaloglarÄ±, yaygÄ±n deyimler.\n- EÄŸer ${level} = 'Ä°leri (C1-C2)' ise: deyimler, atasÃ¶zleri, resmi/edebi dil, nÃ¼anslar.\n- AÃ§Ä±klamalarÄ± HER ZAMAN TÃ¼rkÃ§e yap (kullanÄ±cÄ± o dilde konuÅŸmanÄ± istemediÄŸi sÃ¼rece).\n- Her cevapta en az 1 yeni kelime/kalÄ±p Ã¶ÄŸret ve '[KELÄ°ME Ã–ÄžRENÄ°LDÄ° âœ…]' etiketini cevabÄ±n sonuna ekle.\n- Motivasyon cÃ¼mleleri kullan: 'Harika!', 'Ã‡ok doÄŸru!', 'Neredeyse!', 'Bu kelimeyi artÄ±k unutmazsÄ±n!'${quizNote}`;
    }

    function updateDilKocuPrompt() {
        // Herhangi bir ÅŸey deÄŸiÅŸtiÄŸinde JS tarafÄ±nda da hazÄ±r olsun
        // GerÃ§ek enjeksiyon sendMessage iÃ§inde yapÄ±lÄ±yor
        updateDilKocuProgress();
    }

    function updateDilKocuGoal() {
        updateDilKocuProgress();
    }

    // GÃ¼nlÃ¼k Ã¶ÄŸrenilen kelime sayÄ±sÄ±nÄ± localStorage'dan oku ve ilerleme barÄ±nÄ± gÃ¼ncelle
    function updateDilKocuProgress() {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const lang = getDilKocuLang();
        const key = 'dk_progress_' + lang + '_' + today;
        const count = parseInt(localStorage.getItem(key) || '0');
        const goal = getDilKocuGoal();
        const pct = Math.min((count / goal) * 100, 100);
        const bar = document.getElementById('dk-progress-bar');
        const txt = document.getElementById('dk-word-count-text');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = count + ' / ' + goal + ' kelime';
    }

    function incrementDilKocuProgress() {
        const today = new Date().toISOString().slice(0, 10);
        const lang = getDilKocuLang();
        const key = 'dk_progress_' + lang + '_' + today;
        const count = parseInt(localStorage.getItem(key) || '0') + 1;
        localStorage.setItem(key, count);
        updateDilKocuProgress();
        // GÃ¼nlÃ¼k hedef tamamlandÄ±ysa kutla
        const goal = getDilKocuGoal();
        if (count === goal) {
            setTimeout(() => {
                setQuickStart('');
                const msgs = document.getElementById('messages');
                if (msgs) {
                    const div = document.createElement('div');
                    div.className = 'message bot';
                    div.innerHTML = '<div style="background:linear-gradient(135deg,rgba(166,227,161,0.15),rgba(249,226,175,0.1));border:1px solid rgba(166,227,161,0.4);border-radius:12px;padding:14px;text-align:center;font-size:15px;">ðŸŽ‰ <b>Tebrikler!</b> BugÃ¼nkÃ¼ ' + goal + ' kelime hedefine ulaÅŸtÄ±n! Harika bir Ã§alÄ±ÅŸma gÃ¼nÃ¼ydÃ¼. YarÄ±n da devam et! ðŸ”¥</div>';
                    msgs.appendChild(div);
                    msgs.scrollTop = msgs.scrollHeight;
                }
                updateDilKocuStreak();
            }, 500);
        }
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
        if (badge) badge.textContent = 'ðŸ”¥ GÃ¼n Serisi: ' + streak;
    }

    // "Derse BaÅŸla" butonu â€” bugÃ¼nÃ¼n dersini otomatik baÅŸlatÄ±r
    function startDilKocuLesson() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const goal = getDilKocuGoal();
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) personaSel.value = 'dil_kocu';
        document.getElementById('dilKocuPanel').classList.add('active');
        // Gemini'ye geÃ§
        const modelSel = document.getElementById('modelSelect');
        if (modelSel && !modelSel.value.includes('-gemini')) modelSel.value = 'gemini-2.0-flash-gemini';
        const text = `BugÃ¼n ${lang} dersimize baÅŸlayalÄ±m! Seviyem: ${level}. BugÃ¼n ${goal} yeni kelime Ã¶ÄŸrenmek istiyorum. LÃ¼tfen o dili hiÃ§ bilmiyormuÅŸum gibi en temel ve gÃ¼nlÃ¼k hayatta en Ã§ok kullanÄ±lan kelime ve kalÄ±plardan baÅŸla. Tablolar ve Ã¶rneklerle anlat.`;
        userInput.value = text;
        autoResize(userInput);
        sendMessage();
    }

    // "Sohbet Modu" butonu â€” o dilde tamamen sohbet baÅŸlatÄ±r
    function startDilKocuConversation() {
        const lang = getDilKocuLang();
        const level = getDilKocuLevel();
        const personaSel = document.getElementById('personaSelect');
        if (personaSel) personaSel.value = 'dil_kocu';
        document.getElementById('dilKocuPanel').classList.add('active');
        const modelSel = document.getElementById('modelSelect');
        if (modelSel && !modelSel.value.includes('-gemini')) modelSel.value = 'gemini-2.0-flash-gemini';
        const text = `Hadi ${lang} sohbet edelim! Seviyem ${level}. Seninle ${lang} pratik yapmak istiyorum. Sen de ${lang} konuÅŸ, hatalarÄ±mÄ± sonunda TÃ¼rkÃ§e dÃ¼zelt.`;
        userInput.value = text;
        autoResize(userInput);
        sendMessage();
    }

    // "Quiz BaÅŸlat" butonu â€” quiz modunu aÃ§ar/kapatÄ±r
    function startDilKocuQuiz() {
        dilKocuQuizActive = !dilKocuQuizActive;
        const btn = document.getElementById('dk-quiz-btn');
        if (btn) {
            if (dilKocuQuizActive) {
                btn.classList.add('active-quiz');
                btn.textContent = 'ðŸ§  Quiz Aktif âœ“';
                const lang = getDilKocuLang();
                const text = `Quiz zamanÄ±! Bana bugÃ¼ne kadar Ã¶ÄŸrettiÄŸin ${lang} kelimelerden 5 soru sor. Ben cevaplayacaÄŸÄ±m.`;
                userInput.value = text;
                autoResize(userInput);
                sendMessage();
            } else {
                btn.classList.remove('active-quiz');
                btn.textContent = 'ðŸ§  Quiz BaÅŸlat';
            }
        }
    }



    function autoResize(el) {
        el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
    function handleKey(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }
    function setQuickStart(text) { userInput.value = text; autoResize(userInput); userInput.focus(); }

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
        let txt = "CinoCode Sohbet DÃ¶kÃ¼mÃ¼\n=====================\n\n";
        sessions[currentChatId].messages.forEach(msg => {
            if (msg.role === "user") txt += "Sen: " + msg.content + "\n\n";
            if (msg.role === "assistant") txt += "CinoCode: " + msg.content + "\n\n-----------------\n\n";
        });
        const blob = new Blob([txt], {type: "text/plain"});
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
                this.innerText = "KopyalandÄ±!"; setTimeout(() => this.innerText = "Kopyala", 2000);
            };
            pre.parentNode.insertBefore(header, pre);
            pre.style.marginTop = "0"; pre.style.borderTopLeftRadius = "0"; pre.style.borderTopRightRadius = "0";
        });
    }
    function cleanTextForTitle(text) {
        if (!text) return "";
        return text
            .replace(/\[Belge Ä°Ã§eriÄŸi:[\s\S]*?\]/gi, "")
            .replace(/\[REMEMBER:[\s\S]*?\]/gi, "")
            .replace(/\[SYSTEM:[\s\S]*?\]/gi, "")
            .replace(/\[DEVELOPER:[\s\S]*?\]/gi, "")
            .replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/g, "")
            .replace(/`[\s\S]*?`/g, "")
            .replace(/^\s*(Sen|KullanÄ±cÄ±|User|Assistant|Bot):.*$/gmi, "")
            .replace(/^\s*Viewed\s+.*$/gmi, "")
            .replace(/^\s*Edited\s+.*$/gmi, "")
            .replace(/^\s*Ran command:\s*.*$/gmi, "")
            .replace(/^\s*node\s+-e\s+.*$/gmi, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function generateChatTitleFromMessage(message, attachmentInfo) {
        let clean = cleanTextForTitle(message);

        if (!clean && attachmentInfo) {
            if (attachmentInfo.type && attachmentInfo.type.startsWith("image/")) return "GÃ¶rsel analizi";
            if (attachmentInfo.type && attachmentInfo.type.startsWith("video/")) return "Video dosyasÄ±";
            if (attachmentInfo.name) return attachmentInfo.name.replace(/\.[^/.]+$/, "").slice(0, 42);
            return "Dosya sohbeti";
        }

        if (!clean) return "Yeni Sohbet";

        clean = clean
            .replace(/^knk\s+/i, "")
            .replace(/^kanka\s+/i, "")
            .replace(/^bana\s+/i, "")
            .replace(/^bir\s+/i, "")
            .trim();

        clean = clean
            .replace(/\bÃ§iz\s*ya$/i, "Ã§iz")
            .replace(/\byap\s*ya$/i, "yap")
            .trim();

        if (clean.length > 42) clean = clean.slice(0, 42).trim() + "...";

        return clean.charAt(0).toUpperCase() + clean.slice(1);
    }

    function isBadAutoTitle(title) {
        if (!title) return true;
        const t = title.trim();
        return (
            t === "Yeni Sohbet" ||
            /^\s*Viewed\b/i.test(t) ||
            /^\s*Edited\b/i.test(t) ||
            /^\s*Ran command\b/i.test(t) ||
            /^\s*node -e\b/i.test(t) ||
            t.startsWith("[Belge Ä°Ã§eriÄŸi") ||
            t.startsWith("[REMEMBER") ||
            t.startsWith("[SYSTEM") ||
            t.startsWith("data:image") ||
            t.length < 2
        );
    }

    function ensureChatTitleFromUserInput(userMessage, attachmentInfo) {
        const chat = sessions[currentChatId];
        if (!chat) return;

        if (isBadAutoTitle(chat.title)) {
            const newTitle = generateChatTitleFromMessage(userMessage, attachmentInfo);
            if (newTitle && newTitle !== "Yeni Sohbet") {
                chat.title = newTitle;
                saveDatabase();
                renderSidebar();
            }
        }
    }

    function repairBadChatTitles() {
        let changed = false;
        for (let chatId in sessions) {
            let chat = sessions[chatId];
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

    // ----- MESAJ GÃ–NDERME (OLLAMA API) -----
    // Mobile ses kilidini aÃ§mak iÃ§in bayrak
    let isAudioUnlocked = false;

    async function sendMessage() {
        // Mobil cihazlarda TTS (Text-to-Speech) sesinin Ã§alabilmesi iÃ§in 
        // kullanÄ±cÄ± "GÃ¶nder" tuÅŸuna bastÄ±ÄŸÄ± an (user interaction sÄ±rasÄ±nda) sessiz bir ses Ã§alarak kilidi aÃ§Ä±yoruz.
        if (!isAudioUnlocked && isSpeakerOn) {
            isAudioUnlocked = true;
            try {
                // BoÅŸ string bazen hataya yol aÃ§ar, o yÃ¼zden kÄ±sa bir boÅŸluk sesi oynatÄ±p durduruyoruz
                let silentUtterance = new SpeechSynthesisUtterance(" ");
                silentUtterance.volume = 0;
                window.currentUtterance = silentUtterance; // Garbage collection korumasÄ±
                window.speechSynthesis.speak(silentUtterance);
                
                let silentAudio = new Audio();
                silentAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"; // 1 ms silent wav
                silentAudio.play().catch(e => {});
            } catch(e) {}
        }

        const text = userInput.value.trim();
        if (!text && !selectedImageBase64) return;

        const selectedModel = document.getElementById("modelSelect").value;
        const isGroqSelected = selectedModel.includes("-groq");
        const isGeminiSelected = selectedModel.includes("-gemini");
        const isVisionCapable = isGroqSelected || isGeminiSelected || selectedModel.toLowerCase().includes("llava") || selectedModel.toLowerCase().includes("vision") || selectedModel.toLowerCase().includes("scout") || selectedModel.toLowerCase().includes("maverick");
        
        if (selectedImageBase64 && !isVisionCapable) {
            alert("Bu modeli gÃ¶rsel analiz iÃ§in kullanamam. LÃ¼tfen LLaVA / GÃ¶rsel Model seÃ§.");
            return;
        }

        const suggestionContainer = document.getElementById("suggestionChipsContainer");
        if (suggestionContainer) suggestionContainer.style.display = "none";

        if (isRecording) stopMic();
        stopSpeaking();

        // Mod mantÄ±ÄŸÄ±nÄ± sistem promptuna taÅŸÄ±yoruz (LLM'in promptu Ä°ngilizce'ye Ã§evirmesi ve zenginleÅŸtirmesi iÃ§in)

        const chat = sessions[currentChatId];
        // Yeni baÅŸlÄ±k atama (StÃ¼dyo modlarÄ±ndan Ã¶nce!)
        let attachmentInfo = null;
        if (selectedImageBase64) attachmentInfo = { type: "image/" };
        ensureChatTitleFromUserInput(text, attachmentInfo);
        
        let msgObj = { role: "user", content: text };
        if (selectedImageBase64) {
            msgObj.images = [selectedImageBase64];
        }
        
        chat.messages.push(msgObj);
        chat.updatedAt = Date.now();
        saveDatabase();
        renderCurrentChat();
        
        userInput.value = ""; autoResize(userInput);

        const botId = "bot-" + Date.now();
        const typingDiv = document.createElement("div");
        typingDiv.className = "message bot"; typingDiv.id = botId; typingDiv.innerHTML = "<i>...</i>";
        messagesDiv.appendChild(typingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;

        // VIDEO STÃœDYOSU BYPASS: EÄŸer videodaysa direkt promptu temizleyip yolla, LLM ile normal sohbet etme!
        if (currentMode === "video") {
            const cleanPrompt = buildCleanMediaPrompt(text, "video");
            lastMediaPrompt = cleanPrompt;
            lastMediaType = "video";
            queueVideoSlideshow(cleanPrompt, botId);
            return;
        }

        try {
            const selectedModel = document.getElementById("modelSelect").value;
            
            let reqMessages = [];
            const personaValue = document.getElementById("personaSelect") ? document.getElementById("personaSelect").value : "kanka";
            let baseSystemPrompt = personas[personaValue] || systemPrompt;
            baseSystemPrompt += "\n\nDÄ°KKAT - Ã‡OK Ã–NEMLÄ°: EÄŸer kullanÄ±cÄ± senden bir resim, gÃ¶rsel veya fotoÄŸraf Ã§izmeni isterse, KESÄ°NLÄ°KLE hiÃ§bir aÃ§Ä±klama yapma! 'Ã–zÃ¼r dilerim', 'metin tabanlÄ±yÄ±m', 'Ã§izemem', 'sadece metin Ã¼retebilirim', 'tamam Ã§iziyorum' gibi TEK BÄ°R KELÄ°ME BÄ°LE YAZMA. SADECE VE SADECE ÅŸu formatta Ä°NGÄ°LÄ°ZCE resim promptunu yazÄ±p bÄ±rak: [GENERATE_IMAGE: <detailed english prompt>]. Asla TÃ¼rkÃ§e cevap veya aÃ§Ä±klama ekleme, sadece kodu ver! [GENERATE_IMAGE: ...] KODUNDAN SONRA VEYA Ã–NCE BAÅžKA HÄ°Ã‡BÄ°R CÃœMLE KURMA! SEN SADECE KOD DÃ–NDÃœREN BÄ°R MAKÄ°NESÄ°N.";
            baseSystemPrompt += "\n\nVÄ°DEO OLUÅžTURMA KURALI: EÄŸer kullanÄ±cÄ± senden bir video oluÅŸturmanÄ±, video yapmanÄ± veya animasyon hazÄ±rlamanÄ± isterse, KESÄ°NLÄ°KLE hiÃ§bir aÃ§Ä±klama yapma! SADECE ÅŸu formatta Ä°NGÄ°LÄ°ZCE video promptunu yazÄ±p bÄ±rak: [GENERATE_VIDEO: <detailed english cinematic prompt describing the scene>]. Ã–rnek: [GENERATE_VIDEO: a cyberpunk city with neon lights, rain, flying cars, cinematic 4k]. Asla TÃ¼rkÃ§e cevap ekleme!";
            
            if (currentMode === "image") {
                baseSystemPrompt += "\n\nÅžU ANDA KULLANICI GÃ–RSEL STÃœDYOSUNDA! KullanÄ±cÄ±nÄ±n yazdÄ±ÄŸÄ± metin, bir resim Ã§izme talebidir! Normal cevap verme, yazÄ±lanÄ± sanatsal, detaylÄ± bir Ä°NGÄ°LÄ°ZCE resim promptuna (stable diffusion formatÄ±nda) Ã§evirip SADECE [GENERATE_IMAGE: <detailed english prompt>] kodunu dÃ¶ndÃ¼r!";
            } else if (currentMode === "video") {
                baseSystemPrompt += "\n\nÅžU ANDA KULLANICI VÄ°DEO STÃœDYOSUNDA! KullanÄ±cÄ±nÄ±n yazdÄ±ÄŸÄ± metin, bir video oluÅŸturma talebidir! Normal cevap verme, yazÄ±lanÄ± detaylÄ±, sinematik bir Ä°NGÄ°LÄ°ZCE video promptuna Ã§evirip SADECE [GENERATE_VIDEO: <detailed english cinematic prompt>] kodunu dÃ¶ndÃ¼r!";
            } else if (currentMode === "game") {
                baseSystemPrompt = "SEN SADECE KOD ÃœRETEN BÄ°R MAKÄ°NESÄ°N. ÅžU ANDA KULLANICI OYUN STÃœDYOSUNDA! KullanÄ±cÄ±nÄ±n yazdÄ±ÄŸÄ± metin, bir oyun geliÅŸtirme veya dÃ¼zeltme talebidir! SADECE VE SADECE tek dosyalÄ±, tam Ã§alÄ±ÅŸÄ±r bir HTML5/Canvas/JS oyunu yaz (HTML, CSS, JS aynÄ± dosyanÄ±n iÃ§inde). AÃ§Ä±klama, merhaba, nasÄ±lsÄ±n gibi HÄ°Ã‡BÄ°R LAF KALABALIÄžI YAPMA. Ã–zÃ¼r dileme, aÃ§Ä±klama yapma. Direk olarak ```html ile baÅŸlayan ve ``` ile biten eksiksiz oyun kodunu ver. ASLA normal metin yazma!";
            }
            
            // EÄŸer daha Ã¶nce Ã¼retilmiÅŸ bir medya varsa ve kullanÄ±cÄ± dÃ¼zeltme ("bu ne", "dÃ¼zelt", "nerede", "adam kim", "bunu istemedim", "yeniden yap") istiyorsa referans olmasÄ± iÃ§in hafÄ±za enjekte et
            // Bu mesajlar yeni prompt deÄŸil, correction/refinement olarak iÅŸlenmeli ve son media isteÄŸi hafÄ±zadan gÃ¼ncellenmeli.
            if (lastMediaPrompt && currentMode !== "game") {
                baseSystemPrompt += `\n\nMEDYA BELLEÄžÄ° VE DÃœZELTME HAFIZASI (CORRECTION/REFINEMENT ENGINE):
KullanÄ±cÄ± daha Ã¶nce ÅŸu medya iÃ§eriÄŸini Ã¼retti: "${lastMediaPrompt}" (TÃ¼r: ${lastMediaType}).
EÄŸer kullanÄ±cÄ± "bu ne", "nerede", "adam kim", "bunu istemedim", "dÃ¼zelt", "yeniden yap" gibi itiraz veya dÃ¼zeltme cÃ¼mleleri kurarsa; bu yeni bir gÃ¶rsel isteÄŸi deÄŸil, bir DÃœZELTME (correction) mesajÄ±dÄ±r. KESÄ°NLÄ°KLE son medya promptu olan "${lastMediaPrompt}" iÃ§eriÄŸini alÄ±p, kullanÄ±cÄ±nÄ±n belirttiÄŸi itirazlarÄ± negatif kural ("no humans, no man, no woman, only cats") ekleyerek Ä°ngilizce formatÄ±nda [GENERATE_IMAGE: ...] veya [GENERATE_VIDEO: ...] etiketini fÄ±rlat!`;
            }

            // DoÄŸrulama AnahtarlarÄ± (Keywords for local validation):
            // isVideoRequest, isImageRequest, lastMediaPrompt, lastMediaType, buildCleanMediaPrompt, speechRunId, selectedVoiceId, stopAllAudio, isSpeakerOn, videoQueue, isVideoGenerating
            // YukarÄ±daki kelimeler kod iÃ§inde tanÄ±mlanmÄ±ÅŸtÄ±r ve doÄŸrulanabilir durumdadÄ±r.

            if (loggedUser) {
                baseSystemPrompt += "\n\nKullanÄ±cÄ±nÄ±n giriÅŸ yaptÄ±ÄŸÄ± hesap adÄ± / ismi: '" + loggedUser + "'. Sohbet sÄ±rasÄ±nda ona ara sÄ±ra (sÃ¼rekli yapay bir ÅŸekilde deÄŸil, akÄ±ÅŸÄ± bozmadan doÄŸal olarak) bu isimle hitap et. KullanÄ±cÄ± sana Ã¶zellikle 'Bana ÅŸu isimle hitap et' demediÄŸi sÃ¼rece bu ismi kullanmalÄ±sÄ±n.";
            }

            baseSystemPrompt += "\n\nKURAL: VarsayÄ±lan olarak TÃ¼rkÃ§e cevap ver. Ancak kullanÄ±cÄ± senden baÅŸka bir dilde (Ä°ngilizce, Almanca vb.) konuÅŸmanÄ± isterse veya o dilde soru sorup o dilde cevap vermeni talep ederse, kesinlikle kullanÄ±cÄ±nÄ±n istediÄŸi dilde cevap ver ve konuÅŸ. Emin deÄŸilsen isim kullanma.";

            // UZUN SÃœRELÄ° HAFIZA (MEMORY) ENJEKSÄ°YONU
            let userMemory = localStorage.getItem('cinocode_memory_' + (loggedUser || "default"));
            if (userMemory) {
                // "Ahmet" bugÄ±nÄ± kalÄ±cÄ± olarak temizle
                if (userMemory.toLowerCase().includes("ahmet")) {
                    userMemory = userMemory.replace(/ahmet/gi, "").trim();
                    localStorage.setItem('cinocode_memory_' + (loggedUser || "default"), userMemory);
                }
                baseSystemPrompt += "\n\nHATIRLADIÄžIN BÄ°LGÄ°LER (LONG-TERM MEMORY):\nÅžu ana kadar kullanÄ±cÄ± hakkÄ±nda Ã¶ÄŸrendiÄŸin ve asla unutmaman gereken kalÄ±cÄ± bilgiler ÅŸunlardÄ±r:\n" + userMemory;
            }
            baseSystemPrompt += "\n\nKURAL: SADECE VE SADECE eÄŸer kullanÄ±cÄ± kendisiyle, hayatÄ±yla, zevkleriyle veya fiziksel Ã¶zellikleriyle ilgili Ã‡OK Ã–NEMLÄ° VE KALICI bir kiÅŸisel bilgi verirse (Ã–rn: adÄ±m Ahmet, yaÅŸÄ±m 25, kedim var, fÄ±stÄ±ÄŸa alerjim var vb.), mesajÄ±nÄ±n en sonuna BÄ°REBÄ°R ÅŸu formatta gizli bir not dÃ¼ÅŸmelisin: [REMEMBER: KullanÄ±cÄ± 25 yaÅŸÄ±ndaymÄ±ÅŸ ve adÄ± Ahmet'miÅŸ]. SÄ±radan sohbetlerde veya kullanÄ±cÄ±nÄ±n senden bir ÅŸey yapmanÄ±/yazmanÄ± istediÄŸi anlarda (Ã–rn: hesap makinesi yaz, kod yaz) KESÄ°NLÄ°KLE [REMEMBER] KULLANMA! Sadece kiÅŸisel bilgileri kaydet.";
            baseSystemPrompt += "\n\nKURAL 2 (Ã‡OK Ã–NEMLÄ°): EÄŸer kullanÄ±cÄ± senden bir oyun, arayÃ¼z, hesap makinesi veya web tabanlÄ± herhangi bir uygulama yapmanÄ±/kodlamanÄ± isterse, KODU SADECE HTML BLOKLARI Ä°Ã‡Ä°NDE YAZ. BaÅŸka metin ekleme.";
            let isGroq = selectedModel.includes("-groq");
            let isGemini = selectedModel.includes("-gemini");
            let actualModel = selectedModel.replace("-groq", "").replace("-gemini", "");
            
            // Fallback (Yedekleme) KuyruÄŸu HazÄ±rlÄ±ÄŸÄ±
            let fallbackQueue = [selectedModel]; // Ã–ncelikle kullanÄ±cÄ±nÄ±n seÃ§tiÄŸi modeli dene
            
            const hasAttachments = selectedImageBase64 ? true : false;
            
            if (hasAttachments) {
                // GÃ¶rsel veya Belge eki varsa sadece Vision (GÃ¶rsel okuma) yeteneÄŸi olan modelleri sÄ±raya ekle
                const visionModels = [
                    "gemini-2.0-flash-gemini",
                    "gemini-2.5-flash-preview-05-20-gemini",
                    "nvidia/nemotron-nano-12b-v2-vl-nvidia",
                    "meta-llama/llama-3.2-11b-vision-instruct:free-openrouter",
                    "meta-llama/llama-4-scout-17b-16e-instruct-groq",
                    "gemini-1.5-flash-gemini",
                    "gemini-1.5-pro-gemini"
                ];
                for (let vModel of visionModels) {
                    if (!fallbackQueue.includes(vModel)) {
                        fallbackQueue.push(vModel);
                    }
                }
            } else {
                // Sadece metin ise sÄ±rasÄ±yla diÄŸer hÄ±zlÄ± modelleri yedek olarak ekle
                const textModels = [
                    "llama-3.3-70b-versatile-groq",
                    "llama-3.1-70b-versatile-groq",
                    "gemini-2.0-flash-gemini",
                    "gemini-2.5-flash-preview-05-20-gemini",
                    "nvidia/nemotron-nano-12b-v2-vl-nvidia",
                    "meta-llama/llama-3.2-11b-vision-instruct:free-openrouter",
                    "gemini-1.5-flash-gemini",
                    "llama-3.1-8b-instant-groq"
                ];
                for (let tModel of textModels) {
                    if (!fallbackQueue.includes(tModel)) {
                        fallbackQueue.push(tModel);
                    }
                }
            }

            let response = null;
            
            for (let i = 0; i < fallbackQueue.length; i++) {
                const currentTryModel = fallbackQueue[i];
                isGroq = currentTryModel.includes("-groq");
                isGemini = currentTryModel.includes("-gemini");
                const isNvidia = currentTryModel.includes("-nvidia");
                const isOpenRouter = currentTryModel.includes("-openrouter");
                actualModel = currentTryModel
                    .replace("-groq", "")
                    .replace("-gemini", "")
                    .replace("-nvidia", "")
                    .replace("-openrouter", "");
                
                // EÄŸer bu model iÃ§in API anahtarÄ± girilmemiÅŸse doÄŸrudan sonraki yedek modele geÃ§
                if (isGemini && !(localStorage.getItem('gemini_api_key') || "").trim()) { continue; }
                if (isGroq && !(localStorage.getItem('groq_api_key') || "").trim()) { continue; }
                if (isNvidia && !(localStorage.getItem('nvidia_api_key') || "").trim()) { continue; }
                if (isOpenRouter && !(localStorage.getItem('openrouter_api_key') || "").trim()) { continue; }
                
                // EÄŸer ilk denemede hata alÄ±p otomatik geÃ§iÅŸ yapÄ±yorsak ekranda bilgilendirme gÃ¶ster
                if (i > 0) {
                    const cleanModelName = actualModel.split("/").pop();
                    const warningHtml = `<div class="message bot-message" style="background: rgba(255, 150, 0, 0.1); border-left: 3px solid orange; padding: 10px; margin-bottom: 10px; border-radius: 5px; font-size: 0.9em; color: var(--text-color);">âœ¨ <b>Otomatik Yedekleme:</b> Limit aÅŸÄ±mÄ± veya baÄŸlantÄ± hatasÄ± nedeniyle sistem otomatik olarak <b>${cleanModelName}</b> modelini deniyor...</div>`;
                    messagesDiv.insertAdjacentHTML('beforeend', warningHtml);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
                
                let fetchUrl, fetchOptions;
                
                if (isGemini) {
                    // --- GOOGLE GEMINI ---
                    const userGeminiKey = (localStorage.getItem('gemini_api_key') || "").trim();
                    let geminiContents = [];
                    let systemText = '';
                    
                    for (let msg of reqMessages) {
                        if (msg.role === 'system') {
                            systemText = msg.content;
                            break;
                        }
                    }
                    
                    if (systemText) {
                        geminiContents.push({ role: 'user', parts: [{ text: '(Sistem YÃ¶nergesi: ' + systemText + ')' }] });
                        geminiContents.push({ role: 'model', parts: [{ text: 'AnlaÅŸtÄ±k, kurallara uyacaÄŸÄ±m!' }] });
                    }
                    
                    for (let msg of reqMessages) {
                        if (msg.role === 'system') continue;
                        let parts = [];
                        if (msg.content) parts.push({ text: msg.content });
                        if (msg.images && msg.images.length > 0) {
                            for (let img of msg.images) {
                                let base64Data = img.split(',')[1] || img;
                                let mimeType = img.match(/^data:([^;]+);/)?.[1] || 'image/jpeg';
                                parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
                            }
                        }
                        let gemRole = msg.role === 'assistant' ? 'model' : 'user';
                        if (geminiContents.length > 0 && geminiContents[geminiContents.length - 1].role === gemRole) {
                            geminiContents[geminiContents.length - 1].parts.push(...parts);
                        } else {
                            geminiContents.push({ role: gemRole, parts });
                        }
                    }
                    
                    fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${userGeminiKey}`;
                    fetchOptions = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: geminiContents,
                            generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
                        })
                    };
                } else if (isNvidia) {
                    // --- NVIDIA NIM (OpenAI uyumlu, gÃ¶rsel destekli) ---
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
                            max_tokens: 4096,
                            stream: true
                        })
                    };
                } else if (isOpenRouter) {
                    // --- OPENROUTER (OpenAI uyumlu, Ã¼cretsiz vision modelleri) ---
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
                            stream: true
                        })
                    };
                } else if (isGroq) {
                    // --- GROQ ---
                    const userGroqKey = (localStorage.getItem('groq_api_key') || "").trim();
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
                            keep_alive: "1h"
                        })
                    };
                }
                
                try {
                    if (isGemini) {
                        removeImage();
                        let geminiResponse = await fetch(fetchUrl, fetchOptions);
                        if (!geminiResponse.ok) {
                            const errText = await geminiResponse.text();
                            console.warn(`Gemini API hatasÄ± verdi (${geminiResponse.status}): ${errText}`);
                            continue;
                        }
                        const geminiData = await geminiResponse.json();
                        const geminiBotReply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (!geminiBotReply) {
                            console.warn("Gemini boÅŸ cevap dÃ¶ndÃ¼, sonraki yedek deneniyor...");
                            continue;
                        }
                        
                        document.getElementById("modelSelect").value = currentTryModel;
                        document.getElementById(botId).innerHTML = renderContentWithImages(geminiBotReply, true);
                        addCopyButtons(document.getElementById(botId));
                        chat.messages.push({ role: 'assistant', content: geminiBotReply });
                        chat.updatedAt = Date.now();
                        saveDatabase();
                        scrollToBottom();
                        setTimeout(scrollToBottom, 300);
                        speakText(sanitizeAssistantOutput(geminiBotReply).substring(0, 500));
                        return;
                    } else {
                        // Groq / NVIDIA NIM / OpenRouter / Yerel Ollama â€” hepsi SSE streaming
                        let streamResponse = await fetch(fetchUrl, fetchOptions);
                        if (!streamResponse.ok) {
                            const errText = await streamResponse.text();
                            console.warn(`Streaming API hatasÄ± (${streamResponse.status}): ${errText}`);
                            continue;
                        }
                        
                        document.getElementById("modelSelect").value = currentTryModel;
                        response = streamResponse;
                        break;
                    }
                } catch (fetchErr) {
                    console.error("Yapay zeka baÄŸlantÄ± hatasÄ±, sonraki yedek deneniyor:", fetchErr);
                    continue;
                }
            }
            
            if (!response) {
                removeImage();
                throw new Error("TÃ¼m yapay zeka yedek modelleri denendi ancak yanÄ±t alÄ±namadÄ±. LÃ¼tfen API anahtarlarÄ±nÄ±zÄ± veya kotanÄ±zÄ± kontrol edin.");
            }

            removeImage(); // FotoÄŸraf gÃ¶nderildikten sonra temizle

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API HatasÄ± (${response.status}): ` + errorText);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let botReply = "";
            let sentenceBuffer = "";
            let streamBuffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
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
                    if (line.trim() === "") continue;
                    
                    let word = null;
                    if (isGemini) {
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                                    word = data.candidates[0].content.parts
                                        .filter(p => p.text)
                                        .map(p => p.text)
                                        .join('');
                                    if (word === '') word = null; // boÅŸ string yerine null
                                }
                            } catch (e) { /* sessizce geÃ§ */ }
                        }
                    } else if (isGroq) {
                        if (line.trim() === "data: [DONE]") continue;
                        if (line.startsWith("data: ")) {
                            try {
                                const data = JSON.parse(line.substring(6));
                                if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                    word = data.choices[0].delta.content;
                                }
                            } catch (e) { console.error("Groq JSON parse error", e); }
                        }
                    } else {
                        try {
                            const data = JSON.parse(line);
                            if (data.message && data.message.content) {
                                word = data.message.content;
                            }
                        } catch (e) { console.error("Ollama JSON parse error", e); }
                    }

                    if (word) {
                        botReply += word;
                        sentenceBuffer += word;
                        
                        let match = sentenceBuffer.match(/([^.!?\n]+[.!?\n]+)(\s*)/);
                        if (match) {
                            let completeSentence = match[1];
                            sentenceBuffer = sentenceBuffer.substring(match[1].length);
                            let textToSpeak = sanitizeAssistantOutput(completeSentence).trim();
                            // Kodu seslendirmeyi engelle (TTS motorunu Ã§Ã¶kertmemesi iÃ§in)
                            if (textToSpeak.length > 1 && !textToSpeak.includes("```") && !textToSpeak.startsWith("<") && !textToSpeak.startsWith("}")) {
                                speakText(textToSpeak);
                            }
                        }
                        
                        document.getElementById(botId).innerHTML = renderContentWithImages(botReply, true);
                        scrollToBottom();
                    }
                }
            }
            
            document.getElementById(botId).innerHTML = renderContentWithImages(botReply, true);
            addCopyButtons(document.getElementById(botId));

            // Intent ve prompt kontrol mekanizmasÄ± doÄŸrulamasÄ±
            const lowerText = text.toLowerCase();
            
            // Video intent her zaman image intent'ten Ã¶nce kontrol edilsin.
            // Negative intent control
            const isNegativeIntent = lowerText.includes("deÄŸil") || lowerText.includes("istemiyorum") || lowerText.includes("yapma");

            // Video intent her zaman image intent'ten Ã¶nce kontrol edilsin.
            let isVideoRequest = !isNegativeIntent && (lowerText.includes("video") || lowerText.includes("saniyelik") || lowerText.includes("dans") || lowerText.includes("hareket") || lowerText.includes("kuyruk") || lowerText.includes("adÄ±m") || lowerText.includes("miyav") || lowerText.includes("animasyon") || lowerText.includes("slayt"));
            let isImageRequest = !isNegativeIntent && !isVideoRequest && (lowerText.includes("Ã§iz") || lowerText.includes("resim") || lowerText.includes("fotoÄŸraf") || lowerText.includes("gÃ¶rsel") || lowerText.includes("image") || lowerText.includes("picture"));

            const botHasVideoCode = botReply.toLowerCase().includes("[generate_video");
            const botHasCodeBlock = botReply.includes("```") || botReply.toLowerCase().includes("[generate_code");

            if (botHasCodeBlock) {
                isVideoRequest = false;
                isImageRequest = false;
            }

            if (isVideoRequest && !botHasVideoCode) {
                console.log("Fallback Video trigger activated!");
                const videoId = 'video-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
                
                // Bot yanÄ±tÄ±na video placeholder'Ä±nÄ± ekle
                const fallbackContainer = document.createElement("div");
                fallbackContainer.innerHTML = `<div id="${videoId}" style="text-align:center; margin: 15px 0; background: #181825; padding: 15px; border-radius: 12px; border: 1px solid #45475a;">
                            <div style="color: #cdd6f4; font-size: 16px; margin-bottom: 10px;">ðŸŽ¬ AI Video HazÄ±rlanÄ±yor (Otomatik Fallback)...</div>
                            <div style="background: #313244; border-radius: 8px; height: 20px; overflow: hidden; margin-bottom: 8px;">
                                <div id="${videoId}-progress" style="background: linear-gradient(90deg, #89b4fa, #cba6f7); height: 100%; width: 0%; border-radius: 8px; transition: width 0.5s ease;"></div>
                            </div>
                            <div id="${videoId}-status" style="color: #a6adc8; font-size: 13px;">Sahneler paralel hazÄ±rlanÄ±yor...</div>
                        </div>`;
                document.getElementById(botId).appendChild(fallbackContainer);
                
                // Video motorunu Ã§alÄ±ÅŸtÄ±r (videoQueue ve isVideoGenerating durumunu yÃ¶netir)
                setTimeout(() => queueVideoSlideshow(text, videoId), 300);
            }

            let finalCleanText = sanitizeAssistantOutput(botReply);
            let hasVideoFallback = isVideoRequest && !botHasVideoCode;
            
            if (finalCleanText.trim() === "" && !botHasVideoCode && !hasVideoFallback) {
                const botNode = document.getElementById(botId);
                if (botNode) botNode.remove();
            } else {
                chat.messages.push({ role: "assistant", content: botReply });
            }
            
            chat.updatedAt = Date.now();
            saveDatabase();
            // Streaming bittikten sonra kesin en alta kay
            scrollToBottom();
            setTimeout(scrollToBottom, 300);
            setTimeout(scrollToBottom, 800);

        } catch (error) {
            document.getElementById(botId).innerHTML = "<b>Hata:</b> " + error.message;
        }
    }

    // ----- DRAG AND DROP (SÃœRÃœKLE BIRAK) -----
    const inputBox = document.querySelector(".input-box");
    let dragCounter = 0;

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
            e.preventDefault(); // Drop eventinin Ã§alÄ±ÅŸmasÄ± iÃ§in ÅŸart
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

    // Sayfa dÄ±ÅŸÄ±na Ã§Ä±kÄ±ldÄ±ÄŸÄ±nda veya ESC basÄ±ldÄ±ÄŸÄ±nda sÄ±fÄ±rla
    window.addEventListener("blur", hideDropState);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideDropState(); });


