
// ===== SINAV KOÇU MOD SEÇİM SİSTEMİ =====
window.skState = { mode: null, ozet: null, flashcardCount: 10, quizCount: 10, challengeDiff: 'medium', resolve: null };
if (!window.skQuizHistory) window.skQuizHistory = [];

function openSinavKocuModal(fileName) {
    window.skState = { mode: null, ozet: null, flashcardCount: 10, quizCount: 10, challengeDiff: 'medium', resolve: null };
    document.getElementById('skFileBadge').textContent = '\u{1F4C4} ' + fileName;

    // UI Sıfırlama
    document.querySelectorAll('.sk-card').forEach(c => c.classList.remove('sk-selected'));
    document.querySelectorAll('.sk-pill').forEach(p => p.classList.remove('sk-pill-active'));
    document.querySelectorAll('.sk-count-btn').forEach(b => b.classList.remove('sk-count-active'));

    // Tab sıfırlama (İlk tabı aktif yap)
    skSwitchTab(null, 'tab-ogren');
    document.querySelectorAll('.sk-tab-btn').forEach((btn, idx) => {
        if (idx === 0) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    document.getElementById('sinavKocuOverlay').classList.add('active');
    return new Promise(resolve => { window.skState.resolve = resolve; });
}

function closeSinavKocuModal() {
    document.getElementById('sinavKocuOverlay').classList.remove('active');
    if (window.skState.resolve) { window.skState.resolve(null); window.skState.resolve = null; }
}

function skOverlayClick(e) {
    if (e.target === document.getElementById('sinavKocuOverlay')) closeSinavKocuModal();
}

function skSwitchTab(e, tabId) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    // Tüm tab butonlarının aktifliğini kaldır
    document.querySelectorAll('.sk-tab-btn').forEach(btn => btn.classList.remove('active'));
    // Tüm tab içeriklerini gizle
    document.querySelectorAll('.sk-tab-content').forEach(content => content.classList.remove('active'));

    // Tıklananı aktif et
    if (e && e.target) e.target.classList.add('active');
    const targetContent = document.getElementById(tabId);
    if (targetContent) targetContent.classList.add('active');
}

function skDirectConfirm(mode, subVal) {
    window.skState.mode = mode;
    if (mode === 'ozet') {
        window.skState.ozet = subVal;
    } else if (mode === 'flashcard') {
        window.skState.flashcardCount = parseInt(subVal);
    } else if (mode === 'quiz') {
        window.skState.quizCount = parseInt(subVal);
    } else if (mode === 'challenge') {
        window.skState.challengeDiff = subVal;
    }

    document.getElementById('sinavKocuOverlay').classList.remove('active');

    // Paneli senkronize et ve kalıcı yap
    skpSyncPanelFromState();
    // Persona'yı akademik_koc'a çek → panel görünür kalır
    const personaSel = document.getElementById('personaSelect');
    if (personaSel && personaSel.value !== 'akademik_koc') {
        personaSel.value = 'akademik_koc';
    }
    const sinavPanel = document.getElementById('sinavKocuPanel');
    if (sinavPanel) sinavPanel.classList.add('active');
    const dilPanel = document.getElementById('dilKocuPanel');
    if (dilPanel) dilPanel.classList.remove('active');

    if (window.skState.resolve) {
        window.skState.resolve(mode);
        window.skState.resolve = null;
    }
}

// ===== SINAV KOÇU PANELİ FONKSİYONLARI =====

// Panel dropdownlarını window.skState'e göre güncelle (modal → panel senkronu)
function skpSyncPanelFromState() {
    const modeEl = document.getElementById('skp-mode');
    if (modeEl && window.skState.mode) {
        modeEl.value = window.skState.mode;
    }
    skpOnModeChange();
    // Sub seçeneği de ayarla
    const subEl = document.getElementById('skp-sub-select');
    if (subEl) {
        let subVal = '';
        if (window.skState.mode === 'ozet') subVal = window.skState.ozet || '5dk';
        else if (window.skState.mode === 'flashcard') subVal = String(window.skState.flashcardCount || 10);
        else if (window.skState.mode === 'quiz') subVal = String(window.skState.quizCount || 10);
        else if (window.skState.mode === 'challenge') subVal = window.skState.challengeDiff || 'medium';
        if (subVal) subEl.value = subVal;
    }
}

// Panel dropdownlarını okuyup window.skState'i güncelle (gönderim öncesi)
function skpSyncStateFromPanel() {
    const modeEl = document.getElementById('skp-mode');
    const subEl = document.getElementById('skp-sub-select');
    const mode = modeEl ? modeEl.value : null;
    const subVal = subEl ? subEl.value : '';
    if (!mode) return;
    window.skState.mode = mode;
    if (mode === 'ozet') window.skState.ozet = subVal || '5dk';
    else if (mode === 'flashcard') window.skState.flashcardCount = parseInt(subVal) || 10;
    else if (mode === 'quiz') window.skState.quizCount = parseInt(subVal) || 10;
    else if (mode === 'challenge') window.skState.challengeDiff = subVal || 'medium';
}

function skpBuildStartInstruction() {
    const modeEl = document.getElementById('skp-mode');
    const subEl = document.getElementById('skp-sub-select');
    const mode = window.skState.mode || (modeEl ? modeEl.value : null);
    const subVal = window.skState.mode === 'ozet' ? window.skState.ozet : (subEl ? subEl.value : '');
    if (!mode) return null;

    let modeLabel = '';
    let extra = '';
    switch (mode) {
        case 'ozet':
            modeLabel = 'Hızlı Özet';
            extra = `Süre: ${subVal || window.skState.ozet || '5dk'}.`;
            break;
        case 'flashcard':
            modeLabel = `Flashcard (${window.skState.flashcardCount || parseInt(subEl?.value) || 10} kart)`;
            break;
        case 'quiz':
            modeLabel = `Quiz (${window.skState.quizCount || parseInt(subEl?.value) || 10} soru)`;
            break;
        case 'challenge':
            modeLabel = `Challenge (${window.skState.challengeDiff || subVal || 'medium'})`;
            break;
        case 'ozet':
            modeLabel = 'Hızlı Özet';
            extra = `Süre: ${window.skState.ozet || '5dk'}.`;
            break;
        case 'profesor_anlatim':
            modeLabel = 'Profesör Anlatımı';
            break;
        case 'sifirdan':
            modeLabel = 'Sıfırdan Anlatım';
            break;
        case 'eli5':
            modeLabel = 'ELI5';
            break;
        case 'hikaye':
            modeLabel = 'Hikâyeleştirme';
            break;
        case 'flashcard':
            modeLabel = `Flashcard (${window.skState.flashcardCount || 10} kart)`;
            break;
        case 'quiz':
            modeLabel = `Quiz (${window.skState.quizCount || 10} soru)`;
            break;
        case 'sonsuz_quiz':
            modeLabel = 'Sonsuz Quiz';
            break;
        case 'sozlu_sinav':
            modeLabel = 'Sözlü Sınav';
            break;
        case 'sokratik':
            modeLabel = 'Sokratik Mod';
            break;
        case 'eksik_analizi':
            modeLabel = 'Eksik Analizi';
            break;
        case 'challenge':
            modeLabel = `Challenge (${window.skState.challengeDiff || 'medium'})`;
            break;
        default:
            modeLabel = 'Bilinmeyen Mod';
    }

    const sourceEl = document.getElementById('skp-source');
    const sourceVal = sourceEl ? skpGuardSourceSelection() : 'chat';
    const sourceLabel = sourceVal === 'pdf' ? 'PDF içeriğini' : sourceVal === 'both' ? 'Bu PDF ve sohbet geçmişini' : 'Sohbet geçmişini';
    return `${sourceLabel} seçili Sınav Koçu moduna göre işle. Mod: ${modeLabel}. ${extra}`.trim();
}

// Mod değişince dinamik alt seçenek göster
function skpOnModeChange() {
    const modeEl = document.getElementById('skp-mode');
    const labelEl = document.getElementById('skp-sub-label');
    const subEl = document.getElementById('skp-sub-select');
    if (!modeEl || !labelEl || !subEl) return;
    const mode = modeEl.value;

    const subConfigs = {
        ozet: {
            label: '⏱️ Süre:',
            options: [
                { value: '30s', text: '⚡ 30 sn' },
                { value: '1dk', text: '⏱️ 1 dk' },
                { value: '2dk', text: '⏱️ 2 dk' },
                { value: '5dk', text: '⏱️ 5 dk', selected: true },
                { value: '10dk', text: '⏱️ 10 dk' }
            ]
        },
        flashcard: {
            label: '🎴 Kart:',
            options: [
                { value: '10', text: '10 Kart', selected: true },
                { value: '20', text: '20 Kart' },
                { value: '30', text: '30 Kart' },
                { value: '50', text: '50 Kart' }
            ]
        },
        quiz: {
            label: '❓ Soru:',
            options: [
                { value: '5', text: '5 Soru' },
                { value: '10', text: '10 Soru', selected: true },
                { value: '15', text: '15 Soru' },
                { value: '20', text: '20 Soru' },
                { value: '50', text: '50 Soru' }
            ]
        },
        challenge: {
            label: '🎯 Zorluk:',
            options: [
                { value: 'easy', text: '🟢 Kolay' },
                { value: 'medium', text: '🟡 Orta', selected: true },
                { value: 'hard', text: '🔴 Zor' },
                { value: 'professor', text: '👨‍🏫 Hoca' },
                { value: 'interview', text: '💼 Mülakat' }
            ]
        }
    };

    const cfg = subConfigs[mode];
    if (cfg) {
        labelEl.textContent = cfg.label;
        labelEl.style.display = 'flex';
        subEl.style.display = '';
        subEl.innerHTML = cfg.options.map(o =>
            `<option value="${o.value}"${o.selected ? ' selected' : ''}>${o.text}</option>`
        ).join('');
    } else {
        labelEl.style.display = 'none';
        subEl.style.display = 'none';
        subEl.innerHTML = '';
    }
}

function skpHasDocument() {
    return !!(window.activeDocText || window.selectedDocumentText);
}

function skpGuardSourceSelection() {
    const sourceEl = document.getElementById('skp-source');
    if (!sourceEl) return 'chat';
    const hasDoc = skpHasDocument();
    Array.from(sourceEl.options).forEach(opt => { opt.disabled = false; });
    if (!hasDoc && sourceEl.value !== 'chat') {
        sourceEl.value = 'chat';
        try { localStorage.setItem('cinocode_skp_source', 'chat'); } catch(e) {}
        if (typeof showNonBlockingToast === 'function') {
            showNonBlockingToast('PDF yüklü değil; Sohbet Geçmişi kullanılacak.');
        }
    }
    return sourceEl.value || 'chat';
}

// PDF yüklü mü kontrolü — durum yazısını güncelle
function skpUpdateDocStatus() {
    const el = document.getElementById('skp-doc-status');
    const sourceEl = document.getElementById('skp-source');
    const hasDoc = skpHasDocument();
    skpGuardSourceSelection();
    if (sourceEl && sourceEl.dataset.sourceGuardBound !== '1') {
        sourceEl.dataset.sourceGuardBound = '1';
        sourceEl.addEventListener('change', () => {
            skpGuardSourceSelection();
            try { localStorage.setItem('cinocode_skp_source', sourceEl.value || 'chat'); } catch(e) {}
            skpUpdateDocStatus();
        });
    }
    if (!el) return;
    if (hasDoc) {
        el.textContent = '📄 PDF hazır';
        el.className = '';
        el.style.display = 'inline';
    } else {
        el.textContent = '📄 PDF yüklü değil — Sohbet Geçmişi kullanılacak.';
        el.className = 'skp-no-doc';
        el.style.display = 'inline';
    }
}

// ▶ Başlat butonuna tıklanınca
function skpTriggerGo() {
    const personaSel = document.getElementById('personaSelect');
    if (personaSel && personaSel.value !== 'akademik_koc') {
        personaSel.value = 'akademik_koc';
    }
    skpSyncStateFromPanel();

    const userInputEl = document.getElementById('userInput');
    if (!userInputEl) return;

    const hasDocument = skpHasDocument();
    const sourceValue = skpGuardSourceSelection();
    if (!hasDocument && sourceValue !== 'chat') {
        userInputEl.placeholder = 'PDF yüklü değil; Sohbet Geçmişi kullanılacak.';
    }

    const startInstruction = skpBuildStartInstruction();
    if (!startInstruction) {
        userInputEl.placeholder = "Sınav Koçu modunu seçip yeniden başlat.";
        userInputEl.focus();
        return;
    }

    const currentText = userInputEl.value.trim();
    if (currentText) {
        userInputEl.value = `${currentText}\n\n${startInstruction}`;
    } else {
        userInputEl.value = startInstruction;
    }

    window.isExamMode = true;
    if (typeof skpUpdateDocStatus === 'function') skpUpdateDocStatus();
    sendMessage();
}

function buildExamCoachSuffix() {
    let mode = window.skState.mode;
    if (!mode) return '';

    // Geçmiş Soru/Konu tekrarlarını önlemek için not oluştur
    let histNote = '';
    if (window.skQuizHistory && window.skQuizHistory.length > 0) {
        let items = window.skQuizHistory.map(h => `- Konu/Açıklama: "${h.topic}", Soru Tipi: "${h.questionType}", Zorluk: "${h.difficulty}"`).join('\n');
        histNote = `\n\n⚠️ ÖNEMLİ (Tekrar Önleme): Bu belge için daha önce şu soru/konu setleri çalışılmıştır:\n${items}\nLütfen bu konuların, soru tarzlarının ve zorluk derecelerinin dışına çık. Tamamen özgün, farklı alt başlıklara değinen sorular ve kavramlar üret!`;
    }

    if (mode === 'ozet') {
        let t = window.skState.ozet || '5dk';
        let configs = {
            '30s': { label: '30 Saniyelik', desc: 'sınav kapısında son okumayla tüm konuya hızlıca hâkim olmak için', len: '3-4 cümle', style: 'son derece özlü, ezbere kolay, madde işareti yok' },
            '1dk': { label: '1 Dakikalık', desc: 'temel kavramları hızlıca taramak için', len: '2-3 madde veya kısa paragraf', style: 'net, madde işaretli' },
            '2dk': { label: '2 Dakikalık', desc: 'ana başlıkları ve önemli örnekleri kavramak için', len: '4-6 madde', style: 'başlıklı, somut örnekler ekle' },
            '5dk': { label: '5 Dakikalık', desc: 'ağırlıklı konuları ve detayları anlamak için', len: '8-12 madde', style: 'başlıklı, alt madde de kullan, önemli terimleri bold yaz' },
            '10dk': { label: '10 Dakikalık', desc: 'kapsamlı çalışma rehberi olarak', len: 'kapsamlı bölümler halinde', style: 'başlıklı bölümler, detaylı açıklamalar, örnekler, önemli formüller/kurallar' }
        };
        let c = configs[t];
        return `\n\n[📖 SINAV KOÇU — ${c.label} ÖZET]\nBu belgeyi ${c.desc} özetle. Uzunluk: ${c.len}. Stil: ${c.style}.\nSon satırda şunu ekle: "✅ Bu özet ${c.label.toLowerCase()} okuma için optimize edilmiştir."`;
    }

    if (mode === 'profesor_anlatim') {
        return `\n\n[👨‍🏫 SINAV KOÇU — PROFESÖR ANLATIMI]\nBu belge içeriğini kıdemli bir profesör edasıyla anlat. Konunun en kritik noktalarını, akademik detaylarını bozmadan ama öğrencinin kolayca anlayabileceği formda açıkla. Önemli akademik kavramları **kalın yazı (bold)** olarak vurgula ve sonuna 'Sormak istediğin bir detay var mı?' şeklinde bitir.`;
    }

    if (mode === 'sifirdan') {
        return `\n\n[🎓 SINAV KOÇU — SIFIRDAN ANLATIM]\nBu belgedeki konuyu, sanki hayatında ilk kez duyuyormuşum gibi en baştan ve en yalın haliyle anlat. Günlük hayattan benzetmeler (analojiler) ve örnekler kullan. Anlatımın sonuna 3 maddelik kısa bir 'Öğrenme Alıştırması (Mini Egzersiz)' ekle ve benden bunu yapmamı iste.`;
    }

    if (mode === 'eli5') {
        return `\n\n[🎓 SINAV KOÇU — ÇOCUK ANLATIMI (ELI5)]\nBu belgeyi 5 yaşındaki bir çocuğa anlatır gibi son derece basit, eğlenceli ve anlaşılır bir dille açıkla. Karmaşık teknik terimler yerine oyuncaklar, hayvanlar veya gündelik basit olaylar üzerinden analojiler kur.`;
    }

    if (mode === 'hikaye') {
        return `\n\n[🎓 SINAV KOÇU — HİKÂYELEŞTİRME MODU]\nBu belgedeki teorik ve sıkıcı olabilecek tüm bilgileri, akılda kalıcı, macera dolu veya eğlenceli bir hikaye kurgusuna dönüştürerek anlat. Hikayedeki karakterler veya olaylar belgedeki teknik kavramları (örneğin Entity, Normalization, Database vs.) temsil etsin veya simgelesin.`;
    }

    if (mode === 'flashcard') {
        let count = window.skState.flashcardCount || 10;
        return `\n\n[🎓 SINAV KOÇU — FLASHCARD MODU]\nBu belgedeki en önemli ${count} kavramı flashcard formatında oluştur.\n\nHer kart için kesinlikle şu formatı kullan:\n\n---\n**[KART X / ${count}]**\n- ? **Terim:** (İngilizce teknik terim)\n- 🇬🇧 **İngilizce Açıklama:** (1-2 cümle, sade İngilizce)\n- 🇹🇷 **Türkçe Karşılık:** (Türkçe adı)\n- 📝 **Türkçe Açıklama:** (kısa, anlaşılır Türkçe)\n---\n\nEn önemli kavramlardan başla. Son kart bittikten sonra şunu ekle:\n"✅ ${count} flashcard hazır! 'Bana bu kartları sınav formatında sor' yazarsan seni test edebilirim."`;
    }

    if (mode === 'quiz') {
        let count = window.skState.quizCount || 10;

        let histItem = {
            topic: `Çoktan seçmeli genel quiz (${count} soru)`,
            questionType: "multiple-choice",
            difficulty: "mixed",
            timestamp: Date.now()
        };
        window.skQuizHistory.push(histItem);
        if (window.skQuizHistory.length > 10) window.skQuizHistory.shift();

        return `\n\n[🎓 SINAV KOÇU — QUIZ MODU — ${count} SORU]${histNote}\n\nBu belgeye dayanarak ${count} adet özgün çoktan seçmeli soru hazırla. Sorular farklı zorluk seviyelerinde olsun (kolay, orta, zor).\n\nHer soru için format:\n**Soru X:** [Soru metni]\nA) ...\nB) ...\nC) ...\nD) ...\n\nTüm sorular bittikten sonra:\n## ✅ CEVAP ANAHTARI\nSoru 1: [Harf] — [Kısa açıklama neden doğru]\n...\n\nEn sona şunu ekle: "💡 Farklı sorular için 'Yeni Quiz' yaz. Sözlü sınav için 'Sokratik mod başlat' yaz."`;
    }

    if (mode === 'sonsuz_quiz') {
        return `\n\n[🎓 SINAV KOÇU — SONSUZ QUIZ MODU]\nBu belgeyle ilgili interaktif bir test başlatıyoruz. Kurallar:\n1. Bana her seferinde sadece TEK bir çoktan seçmeli soru sor.\n2. Ben cevabı (A, B, C veya D) yazana kadar yeni soru sorma.\n3. Ben cevap verince: Doğruluğunu kontrol et. Yanlışsa mini bir anlatım ile neden yanlış olduğunu ve doğrusunu açıkla.\n4. Yanlış yaptığım konuları hafızanda tut ve birkaç soru sonra benzer konudan tekrar soru sor.\n5. Ben 'Durdur' veya 'Bitir' diyene kadar bu döngüyü sürdür.\n\nHadi ilk soruyla hemen başla!`;
    }

    if (mode === 'sozlu_sinav') {
        return `\n\n[📖 SINAV KOÇU — SÖZLÜ / SESLİ SINAV]\nBu belge üzerinden benimle bir sözlü sınav gerçekleştir. Kurallar:\n1. Rolün: Deneyimli ve titiz bir ders hocası. Sesli yanıtlara uygun kısa, net sorular soracaksın.\n2. Bana her seferinde sadece TEK bir açık uçlu soru yönelt.\n3. Ben yanıtımı verene kadar bekle.\n4. Verdiğim yanıtı değerlendir: Eksik veya yanlış bir yer varsa kibarca düzelt, hoca gözüyle ekleme yap (örn: 'Güzel ama Primary Key detayını unuttun').\n5. Hemen ardından sıradaki soruya geç.\n\nHadi hocam, ilk sorunuzla başlayın!`;
    }

    if (mode === 'sokratik') {
        return `\n\n[🎓 SINAV KOÇU — SOKRATİK ÖĞRENME MODU]\nBu belge içeriğiyle ilgili beni eğiteceksin. Ancak bana doğrudan cevapları verme! Kurallar:\n1. Bana konunun mantığını kavratacak sorular sor.\n2. Her seferinde sadece TEK soru sor ve cevabımı bekle.\n3. Verdiğim cevaba göre beni yönlendir. Doğru yoldaysam bir sonraki aşamaya geçmek için takip sorusu sor. Yanlış yoldaysam ipucu vererek beni doğru düşünmeye sevk et.\n4. Örnek: 'Entity nedir?' sorusuna ben cevap verince 'Peki Student neden bir entity olur da student name neden attribute olur?' gibi tümdengelim sorularıyla beni konunun içine sok.\n\nHadi ilk sorunla başla!`;
    }

    if (mode === 'eksik_analizi') {
        let histItem = {
            topic: "Eksik Analizi Tanı Testi",
            questionType: "diagnostic-test",
            difficulty: "mixed",
            timestamp: Date.now()
        };
        window.skQuizHistory.push(histItem);
        if (window.skQuizHistory.length > 10) window.skQuizHistory.shift();

        return `\n\n[📊 SINAV KOÇU — EKSİK ANALİZİ (TANI TESTİ)]\nBu belge üzerinden benim eksiklerimi tespit etmek için 10 adet kısa soruluk bir tanı testi hazırla.\n\nKurallar:\n1. 10 soruyu peş peşe listele (kısa cevaplı veya boşluk doldurma tarzında olsunlar).\n2. Soruların altına benden cevaplarımı yazmamı iste.\n3. Ben cevaplarımı girince, her soru alt konusunu (Örn: Normalization, Normal Formlar, Primary Key, Weak Entity vs.) analiz et ve bana yüzdelik bir tablo çıkart:\n   - Konu A: %95 Başarı\n   - Konu B: %30 Başarı (Eksik Yakalandı!)\n4. Bu tablonun ardından, bana sadece en zayıf kaldığım (%50 altı) konuları çalıştırmak üzere özel bir ders planı öner.\n\nHadi soruları listele!`;
    }

    if (mode === 'challenge') {
        let diff = window.skState.challengeDiff || 'medium';
        let diffLabels = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', professor: 'Hoca Seviyesi', interview: 'Google Mülakat Seviyesi' };
        let diffLabel = diffLabels[diff];

        let histItem = {
            topic: `Challenge Modu (${diffLabel})`,
            questionType: "challenge-duel",
            difficulty: diff,
            timestamp: Date.now()
        };
        window.skQuizHistory.push(histItem);
        if (window.skQuizHistory.length > 10) window.skQuizHistory.shift();

        return `\n\n[🎓 SINAV KOÇU — CHALLENGE MODU (${diffLabel.toUpperCase()})]${histNote}\n\nBu belgeden benim için ${diffLabel} zorluk derecesinde son derece zorlayıcı, zeka gerektiren 5 adet soru hazırla. Sorular klasik veya çoktan seçmeli olabilir. Formatı serbest bırakıyorum ancak seçtiğim zorluk derecesinin hakkını sonuna kadar ver! En sona cevap anahtarını ve detaylı çözümlerini ekle.`;
    }

    if (mode === 'munazara') {
        return `\n\n[📊 SINAV KOÇU — MÜNAZARA MODU]\nBu belgedeki tartışmalı veya farklı yorumlanabilecek bir konuyu ele alalım. Kurallar:\n1. Sen belgedeki bir görüşün/tezin tam karşıt tarafını (şeytanın avukatını) savunacaksın.\n2. Bana tezini sun ve beni kendi tezimi savunmaya, kanıt göstermeye zorla.\n3. Her mesajda sadece kendi karşı argümanını sunup sözü bana bırak.\n4. Bu fikir düellosu sayesinde benim konuyu çok yönlü kavramamı sağla.\n\nHadi münazara konusunu ve senin ilk karşı tezini sunarak tartışmayı başlat!`;
    }

    if (mode === 'hoca_tahmin') {
        return `\n\n[📖 SINAV KOÇU — HOCA NE SORAR? TAHMİNİ]\nBu belgeyi hazırlayan akademisyenin gözünden bir analiz yap:\n\n## ✍️ 1. Klasik Soru Gelebilecek Yerler\nBelgeden 3 adet klasik (açık uçlu) soru tahmin et ve hocanın hangi anahtar kelimeleri (keywords) cevap kâğıdında arayacağını yaz.\n\n## 🎯 2. Test Sorusuna Uygun Püf Noktaları\nÇoktan seçmeli sınavlarda çeldirici olarak kullanılabilecek, ezberlenmesi gereken 3-4 kritik ayrımı veya kuralı listele.\n\n## 📌 3. Mutlaka Ezberlenecek Kavramlar Listesi\nSınavda çıkma olasılığı %90+ olan terimleri **bold** olarak listele ve tek cümleyle açıkla.`;
    }

    return '';
}

    function applyShowMoreLogic(container) {
        if (!container) return;
        if (container.querySelector('.cinocode-show-more-btn')) return;

        // Eşik değeri: 700px
        if (container.scrollHeight <= 750) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'cinocode-message-clamped';
        wrapper.style.maxHeight = '700px';
        wrapper.style.overflow = 'hidden';
        wrapper.style.position = 'relative';

        const nodesToMove = [];
        container.childNodes.forEach(n => {
            if (n.nodeType !== 1) {
                nodesToMove.push(n);
            } else {
                const cls = n.className || '';
                if (!cls.includes('msg-actions') && !cls.includes('smart-suggestion') && !cls.includes('continuation-row') && !cls.includes('continuation-card') && !cls.includes('typing-indicator') && n.id !== 'chat-bottom-anchor') {
                    nodesToMove.push(n);
                }
            }
        });

        nodesToMove.forEach(n => wrapper.appendChild(n));

        const fade = document.createElement('div');
        fade.className = 'cinocode-fade-bottom';
        fade.style.position = 'absolute';
        fade.style.bottom = '0';
        fade.style.left = '0';
        fade.style.width = '100%';
        fade.style.height = '60px';
        fade.style.background = 'linear-gradient(transparent, var(--cc-bg-main))';
        fade.style.pointerEvents = 'none';
        wrapper.appendChild(fade);

        container.insertBefore(wrapper, container.firstChild);

        const btn = document.createElement('button');
        btn.className = 'cinocode-show-more-btn';
        btn.innerHTML = 'Devamını göster ▼';
        btn.style.display = 'block';
        btn.style.width = 'fit-content';
        btn.style.margin = '8px auto';
        btn.style.background = 'rgba(137,180,250,0.1)';
        btn.style.border = '1px solid rgba(137,180,250,0.3)';
        btn.style.color = 'var(--cc-accent-brand)';
        btn.style.padding = '6px 16px';
        btn.style.borderRadius = '20px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = 'bold';
        btn.style.transition = '0.2s';

        btn.onmouseover = () => btn.style.background = 'rgba(137,180,250,0.2)';
        btn.onmouseout = () => btn.style.background = 'rgba(137,180,250,0.1)';

        btn.onclick = () => {
            if (wrapper.style.maxHeight === '700px') {
                wrapper.style.maxHeight = 'none';
                fade.style.display = 'none';
                btn.innerHTML = 'Daha az göster ▲';
            } else {
                wrapper.style.maxHeight = '700px';
                fade.style.display = 'block';
                btn.innerHTML = 'Devamını göster ▼';
                const rect = container.getBoundingClientRect();
                if (rect.top < 0) {
                    container.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            }
        };

        container.insertBefore(btn, wrapper.nextSibling);
    }


    function renderProjectSection() {
        const pIds = getSortedProjectIds();

        const section = document.createElement("div");
        section.className = "chat-section";
        section.style.marginBottom = "15px";

        const header = document.createElement("div");
        header.className = "chat-section-header";
        header.innerHTML = 'Çalışma Alanları <span style="font-size:9px; background:rgba(249,226,175,0.1); color:#f9e2af; padding:2px 6px; border-radius: var(--cc-radius); margin-left:8px; vertical-align:middle;">Not Defterleri</span>';
        section.appendChild(header);

        if (pIds.length === 0) {
            const emptyDiv = document.createElement("div");
            emptyDiv.style.fontSize = "12px";
            emptyDiv.style.color = "#6c7086";
            emptyDiv.style.padding = "5px 10px";
            emptyDiv.style.fontStyle = "italic";
            emptyDiv.innerText = "Henüz not defteri yok.";

            const btn = document.createElement("button");
            btn.innerText = "Projeleri Aç";
            btn.style.display = "block";
            btn.style.marginTop = "8px";
            btn.style.background = "rgba(137,180,250,0.1)";
            btn.style.border = "1px solid rgba(137,180,250,0.3)";
            btn.style.color = "var(--cc-accent-brand)";
            btn.style.padding = "4px 8px";
            btn.style.borderRadius = "4px";
            btn.style.fontSize = "11px";
            btn.style.cursor = "pointer";
            btn.onclick = (e) => { e.stopPropagation(); if(typeof openProjectsScreen === 'function') openProjectsScreen(); };

            emptyDiv.appendChild(btn);
            section.appendChild(emptyDiv);
            return section;
        }

        const listDiv = document.createElement("div");
        if (pIds.length > 6) {
            listDiv.style.maxHeight = "220px";
            listDiv.style.overflowY = "auto";
            listDiv.style.paddingRight = "4px";
        }

        pIds.forEach(pid => {
            const proj = projects[pid];
            if (!proj) return;
            const pDiv = document.createElement("div");
            pDiv.className = "chat-item";
            if (typeof activeProjectId !== 'undefined' && activeProjectId === pid) pDiv.classList.add("active");

            pDiv.onclick = (e) => {
                window.expandedProjects = window.expandedProjects || {};
                window.expandedProjects[pid] = !window.expandedProjects[pid];
                renderSidebar();
            };

            let chatCount = 0;
            try { chatCount = Object.values(sessions).filter(c => c && c.projectId === pid).length; } catch(e) {}

            const isExpanded = !!(window.expandedProjects && window.expandedProjects[pid]);
            const folderIcon = isExpanded ? "📂" : "📁";
            const arrowIcon = isExpanded ? "▼" : "▶";

            pDiv.innerHTML = `
                <div style="font-size: 8px; margin-right: 6px; color: var(--cc-text-muted);">${arrowIcon}</div>
                <div class="chat-icon">${folderIcon}</div>
                <div class="chat-title-container">
                    <span>${proj.name ? proj.name.replace(/</g,"&lt;").replace(/>/g,"&gt;") : "İsimsiz"}</span>
                    ${chatCount > 0 ? `<div style="font-size:10px; color:var(--cc-text-muted); margin-top:2px;">${chatCount} sohbet</div>` : ''}
                </div>
            `;
            listDiv.appendChild(pDiv);

            if (isExpanded) {
                const projectChats = getSortedChatIds(Object.keys(sessions).filter(id => sessions[id]?.projectId === pid));
                if (projectChats.length === 0) {
                    const emptyChatDiv = document.createElement("div");
                    emptyChatDiv.style.fontSize = "11px";
                    emptyChatDiv.style.color = "#6c7086";
                    emptyChatDiv.style.padding = "6px 12px 6px 36px";
                    emptyChatDiv.style.fontStyle = "italic";
                    emptyChatDiv.innerText = "Sohbet yok";
                    listDiv.appendChild(emptyChatDiv);
                } else {
                    projectChats.forEach(chatId => {
                        const chatRow = renderChatRow(chatId, true);
                        listDiv.appendChild(chatRow);
                    });
                }
            }
        });

        section.appendChild(listDiv);
        return section;
    }


    // ===== YEREL TEMA SİSTEMİ =====
    function applyStoredTheme() {
        try {
            const t = localStorage.getItem('cinocode_theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
        } catch (e) {}
    }
    function toggleTheme() {
        openThemeStudio();
    }
    function toggleSimpleDarkLight() {
        try {
            const current = localStorage.getItem('cinocode_theme') || 'dark';
            const next = current === 'light' ? 'dark' : 'light';
            localStorage.setItem('cinocode_theme', next);
            applyStoredTheme();
        } catch (e) {}
    }
    applyStoredTheme();


    // ===== FAZ 20: GELİŞMİŞ TEMA VE DÜZEN MOTORU =====
    const FZ20_PRESETS = {
        mocha: {
            '--cc-bg-main': '#11111b',
            '--cc-bg-surface': '#181825',
            '--cc-bg-elevated': '#1e1e2e',
            '--cc-border': '#313244',
            '--cc-text-primary': '#cdd6f4',
            '--cc-accent-brand': '#89b4fa'
        },
        latte: {
            '--cc-bg-main': '#eff1f5',
            '--cc-bg-surface': '#e6e9ef',
            '--cc-bg-elevated': '#dce0e8',
            '--cc-border': '#ccd0da',
            '--cc-text-primary': '#4c4f69',
            '--cc-accent-brand': '#1e66f5'
        },
        saas: {
            '--cc-bg-main': '#0B0C10',
            '--cc-bg-surface': '#1C1E26',
            '--cc-bg-elevated': '#282A36',
            '--cc-border': '#2D303E',
            '--cc-text-primary': '#E2E8F0',
            '--cc-accent-brand': '#6366F1'
        }
    };

    function openThemeStudio() {
        if (typeof closeSettings === 'function') closeSettings();
        document.getElementById('fz20ThemeStudioOverlay').style.display = 'block';
        const menu = document.getElementById('fz20ThemeStudioMenu');
        menu.style.display = 'block';
        setTimeout(() => menu.style.opacity = '1', 50);

        // Load current custom colors into pickers
        const rootStyles = getComputedStyle(document.documentElement);
        document.getElementById('fz20ColorMain').value = rgbToHex(rootStyles.getPropertyValue('--cc-bg-main').trim());
        document.getElementById('fz20ColorSurface').value = rgbToHex(rootStyles.getPropertyValue('--cc-bg-surface').trim());
        document.getElementById('fz20ColorText').value = rgbToHex(rootStyles.getPropertyValue('--cc-text-primary').trim());
        document.getElementById('fz20ColorAccent').value = rgbToHex(rootStyles.getPropertyValue('--cc-accent-brand').trim());
        document.getElementById('fz20ColorBorder').value = rgbToHex(rootStyles.getPropertyValue('--cc-border').trim());
    }

    function closeThemeStudio() {
        document.getElementById('fz20ThemeStudioMenu').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('fz20ThemeStudioOverlay').style.display = 'none';
            document.getElementById('fz20ThemeStudioMenu').style.display = 'none';
        }, 300);
    }

    function fz20SwitchTab(tab) {
        document.getElementById('fz20TabContentTheme').style.display = tab === 'theme' ? 'block' : 'none';
        document.getElementById('fz20TabContentLayout').style.display = tab === 'layout' ? 'block' : 'none';

        document.getElementById('fz20TabTheme').style.borderColor = tab === 'theme' ? '#cba6f7' : 'transparent';
        document.getElementById('fz20TabTheme').style.color = tab === 'theme' ? '#cdd6f4' : '#6c7086';

        document.getElementById('fz20TabLayout').style.borderColor = tab === 'layout' ? '#cba6f7' : 'transparent';
        document.getElementById('fz20TabLayout').style.color = tab === 'layout' ? '#cdd6f4' : '#6c7086';
    }

    function fz20ApplyPreset(presetName) {
        const preset = FZ20_PRESETS[presetName];
        if(!preset) return;
        Object.keys(preset).forEach(key => {
            document.documentElement.style.setProperty(key, preset[key]);
        });
        // Update color pickers to reflect preset
        document.getElementById('fz20ColorMain').value = preset['--cc-bg-main'];
        document.getElementById('fz20ColorSurface').value = preset['--cc-bg-surface'];
        document.getElementById('fz20ColorText').value = preset['--cc-text-primary'];
        document.getElementById('fz20ColorAccent').value = preset['--cc-accent-brand'];
        document.getElementById('fz20ColorBorder').value = preset['--cc-border'];
    }

    function fz20PreviewCustomColor() {
        document.documentElement.style.setProperty('--cc-bg-main', document.getElementById('fz20ColorMain').value);
        document.documentElement.style.setProperty('--cc-bg-surface', document.getElementById('fz20ColorSurface').value);
        document.documentElement.style.setProperty('--cc-text-primary', document.getElementById('fz20ColorText').value);
        document.documentElement.style.setProperty('--cc-accent-brand', document.getElementById('fz20ColorAccent').value);
        document.documentElement.style.setProperty('--cc-border', document.getElementById('fz20ColorBorder').value);
    }

    function fz20SaveTheme() {
        const customTheme = {
            '--cc-bg-main': document.getElementById('fz20ColorMain').value,
            '--cc-bg-surface': document.getElementById('fz20ColorSurface').value,
            '--cc-text-primary': document.getElementById('fz20ColorText').value,
            '--cc-accent-brand': document.getElementById('fz20ColorAccent').value,
            '--cc-border': document.getElementById('fz20ColorBorder').value
        };
        localStorage.setItem('cinocode_custom_theme', JSON.stringify(customTheme));
        showNonBlockingToast("🎨 Özel tema kaydedildi ve uygulandı!");
        closeThemeStudio();
    }

    function fz20ResetToDefault() {
        localStorage.removeItem('cinocode_custom_theme');
        fz20ApplyPreset('mocha');
        showNonBlockingToast("↩ Varsayılan temaya dönüldü.");
        closeThemeStudio();
    }

    function fz20LoadSavedTheme() {
        const saved = localStorage.getItem('cinocode_custom_theme');
        if(saved) {
            try {
                const customTheme = JSON.parse(saved);
                Object.keys(customTheme).forEach(key => {
                    document.documentElement.style.setProperty(key, customTheme[key]);
                });
            } catch(e) {}
        }
    }

    // Yardımcı fonksiyon: hex'e çevirme
    function rgbToHex(color) {
        if (!color || color.indexOf("rgb") !== 0) return color.startsWith("#") ? color : "#11111b";
        let a = color.split("(")[1].split(")")[0].split(",");
        let b = a.map(x => {
            x = parseInt(x).toString(16);
            return (x.length === 1) ? "0"+x : x;
        });
        return "#" + b.join("");
    }

    // Uygulama başlangıcında temayı yükle
    fz20LoadSavedTheme();


    // ===== YEREL PROFİL / HESAP YÖNETİMİ =====
    function getUserScopedKeys(name) {
        const n = (name || "default");
        return { memory: 'cinocode_memory_' + n, db: 'cinocode_db_' + n };
    }

    const LOCAL_PROFILE_REGISTRY_KEY = 'cinocode_local_profiles_v1';

    function normalizeLocalProfileName(value) {
        return String(value || '')
            .replace(/[\u0000-\u001f\u007f<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40);
    }

    function getLocalProfiles() {
        try {
            const parsed = JSON.parse(localStorage.getItem(LOCAL_PROFILE_REGISTRY_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            const seen = new Set();
            return parsed.map(normalizeLocalProfileName).filter(name => {
                const key = name.toLocaleLowerCase('tr-TR');
                if (!name || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        } catch (e) {
            return [];
        }
    }

    function saveLocalProfiles(profiles) {
        try {
            localStorage.setItem(LOCAL_PROFILE_REGISTRY_KEY, JSON.stringify(profiles.slice(0, 12)));
        } catch (e) {
            console.warn('Local profile registry could not be saved', e);
        }
    }

    function rememberLocalProfile(name) {
        const normalized = normalizeLocalProfileName(name);
        if (!normalized) return;
        const profiles = getLocalProfiles().filter(item => item.toLocaleLowerCase('tr-TR') !== normalized.toLocaleLowerCase('tr-TR'));
        profiles.unshift(normalized);
        saveLocalProfiles(profiles);
    }

    function forgetLocalProfile(name) {
        const normalized = normalizeLocalProfileName(name).toLocaleLowerCase('tr-TR');
        saveLocalProfiles(getLocalProfiles().filter(item => item.toLocaleLowerCase('tr-TR') !== normalized));
    }

    function localProfileExists(name) {
        const normalized = normalizeLocalProfileName(name);
        if (!normalized) return false;
        if (getLocalProfiles().some(item => item.toLocaleLowerCase('tr-TR') === normalized.toLocaleLowerCase('tr-TR'))) return true;
        const keys = getUserScopedKeys(normalized);
        try {
            return localStorage.getItem(keys.db) !== null || localStorage.getItem(keys.memory) !== null;
        } catch (e) {
            return false;
        }
    }

    function openLocalAuthModal(initialMode) {
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
                    <input id="localAuthName" name="displayName" type="text" minlength="2" maxlength="40" autocomplete="name" placeholder="Örn: Hüsamettin" required>
                    <div id="localAuthAgeGroup" class="cc-auth-field-group">
                        <label for="localAuthAge">Yaş <span>(isteğe bağlı)</span></label>
                        <input id="localAuthAge" name="age" type="number" min="1" max="120" inputmode="numeric" placeholder="Örn: 24">
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
                rememberLocalProfile(name);
                window.location.reload();
            } catch (storageError) {
                console.error('Local auth failed', storageError);
                error.textContent = 'Tarayıcı yerel depolamaya izin vermedi. Site verisi izinlerini kontrol et.';
            }
        };

        setMode(mode);
    }

    function renameLocalProfile(newNameRaw) {
        const newName = normalizeLocalProfileName(newNameRaw);
        if (!newName) { showNonBlockingToast('İsim boş olamaz.'); return false; }
        if (newName.toLocaleLowerCase('tr-TR') === (loggedUser || "").trim().toLocaleLowerCase('tr-TR')) {
            rememberLocalProfile(newName);
            return true;
        }
        const oldKeys = getUserScopedKeys(loggedUser);
        const newKeys = getUserScopedKeys(newName);
        try {
            const oldMemory = localStorage.getItem(oldKeys.memory);
            const oldDb = localStorage.getItem(oldKeys.db);
            if (oldMemory !== null) { localStorage.setItem(newKeys.memory, oldMemory); localStorage.removeItem(oldKeys.memory); }
            if (oldDb !== null) { localStorage.setItem(newKeys.db, oldDb); localStorage.removeItem(oldKeys.db); }
            localStorage.setItem('cinocode_user', newName);
            forgetLocalProfile(loggedUser);
            rememberLocalProfile(newName);
            return true;
        } catch (e) {
            console.error('Profile rename failed', e);
            showNonBlockingToast('İsim değiştirilemedi.');
            return false;
        }
    }

    function exportLocalChats() {
        try {
            const dbKey = 'cinocode_db_' + (loggedUser || 'default');
            const raw = localStorage.getItem(dbKey);
            const data = raw ? JSON.parse(raw) : { sessions: {}, projects: {} };
            const payload = {
                exportedAt: new Date().toISOString(),
                user: loggedUser || 'default',
                sessions: data.sessions || {},
                projects: data.projects || {}
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cinocode-sohbetler-' + new Date().toISOString().slice(0, 10) + '.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            showNonBlockingToast('Sohbetler dışa aktarıldı.');
        } catch (e) {
            console.error('Export failed', e);
            showNonBlockingToast('Dışa aktarma başarısız.');
        }
    }

    function deleteLocalAccount() {
        const typed = prompt('Bu islem geri alinamaz. Tüm yerel sohbetleriniz ve hafizaniz silinecek.\nOnaylamak için SIL yazin:');
        if (typed !== 'SIL') { showNonBlockingToast('Iptal edildi.'); return; }
        try {
            const keys = getUserScopedKeys(loggedUser);
            localStorage.removeItem(keys.memory);
            localStorage.removeItem(keys.db);
            localStorage.removeItem('cinocode_user');
            forgetLocalProfile(loggedUser);
            CinoDB.delete('workspaces', keys.db).finally(() => {
                location.reload();
            });
        } catch (e) {
            console.error('Account deletion failed', e);
            location.reload();
        }
    }

    function openLocalProfileModal() {
        const existing = document.getElementById('localProfileModalOverlay');
        if (existing) existing.remove();
        const dbKey = 'cinocode_db_' + (loggedUser || 'default');
        let chatCount = 0, approxKb = 0;
        try {
            const raw = localStorage.getItem(dbKey);
            if (raw) {
                approxKb = Math.round(raw.length / 1024);
                const parsed = JSON.parse(raw);
                chatCount = parsed && parsed.sessions ? Object.keys(parsed.sessions).length : 0;
            }
        } catch (e) {}

        const overlay = document.createElement('div');
        overlay.id = 'localProfileModalOverlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:20000; display:flex; align-items:center; justify-content:center;';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const safeName = String(loggedUser || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        const box = document.createElement('div');
        box.style.cssText = 'background:var(--cc-mantle); border:1px solid var(--cc-surface2); border-radius: var(--cc-radius); padding:20px; width:320px; max-width:90vw; color:var(--cc-text);';
        const currentAge = localStorage.getItem('cinocode_user_age') || '';
        box.innerHTML = `
            <div style="font-weight:bold; font-size:15px; margin-bottom:14px; color:var(--cc-blue);">👤 Yerel Profil</div>
            <div style="font-size:11px; color:var(--cc-subtext0); margin-bottom:6px;">Görünen isim</div>
            <input id="localProfileNameInput" type="text" value="${safeName}" style="width:100%; box-sizing:border-box; background:var(--cc-base); border:1px solid var(--cc-surface2); color:var(--cc-text); padding:8px; border-radius: var(--cc-radius); font-size:13px; margin-bottom:10px;">
            <div style="font-size:11px; color:var(--cc-subtext0); margin-bottom:6px;">Yaş</div>
            <input id="localProfileAgeInput" type="number" value="${currentAge}" placeholder="Örn: 20" style="width:100%; box-sizing:border-box; background:var(--cc-base); border:1px solid var(--cc-surface2); color:var(--cc-text); padding:8px; border-radius: var(--cc-radius); font-size:13px; margin-bottom:10px;">
            <div style="font-size:11px; color:var(--cc-subtext0); margin-bottom:14px;">${chatCount} sohbet, yaklaşık ${approxKb} KB yerel veri</div>
            <div style="font-size:11px; color:var(--cc-subtext0); margin-bottom:14px; line-height:1.45;">Bu profil yalnızca bu tarayıcıda saklanır; parola veya bulut senkronizasyonu içermez.</div>
            <button id="localProfileSaveBtn" style="width:100%; background:var(--cc-blue); border:none; color:var(--cc-base); cursor:pointer; font-size:12px; font-weight:700; padding:8px; border-radius: var(--cc-radius); margin-bottom:8px;">Kaydet</button>
            <button id="localProfileExportBtn" style="width:100%; background:transparent; border:1px solid var(--cc-surface2); color:var(--cc-text); cursor:pointer; font-size:12px; font-weight:600; padding:8px; border-radius: var(--cc-radius); margin-bottom:8px;">⬇️ Sohbetleri Dışa Aktar</button>
            <button id="localProfileThemeBtn" style="width:100%; background:transparent; border:1px solid var(--cc-surface2); color:var(--cc-text); cursor:pointer; font-size:12px; font-weight:600; padding:8px; border-radius: var(--cc-radius); margin-bottom:8px;">🎨 Açık/Koyu Tema</button>
            <button id="localProfileDeleteBtn" style="width:100%; background:rgba(243,139,168,0.1); border:1px solid rgba(243,139,168,0.3); color:var(--cc-red); cursor:pointer; font-size:12px; font-weight:600; padding:8px; border-radius: var(--cc-radius); margin-bottom:8px;">🗑️ Hesabı Sil</button>
            <button id="localProfileCloseBtn" style="width:100%; background:transparent; border:none; color:var(--cc-subtext0); cursor:pointer; font-size:12px; padding:6px;">Kapat</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('localProfileSaveBtn').onclick = () => {
            const val = document.getElementById('localProfileNameInput').value;
            const ageVal = document.getElementById('localProfileAgeInput').value;
            localStorage.setItem('cinocode_user_age', ageVal);
            if (renameLocalProfile(val)) {
                overlay.remove();
                location.reload();
            }
        };
        document.getElementById('localProfileExportBtn').onclick = exportLocalChats;
        document.getElementById('localProfileThemeBtn').onclick = toggleSimpleDarkLight;
        document.getElementById('localProfileDeleteBtn').onclick = deleteLocalAccount;
        document.getElementById('localProfileCloseBtn').onclick = () => overlay.remove();
    }

    function toggleAccountPopover(e) {
        if(e) e.stopPropagation();
        const popover = document.getElementById('accountPopover');
        if (!popover) return;
        popover.style.display = popover.style.display === 'none' ? 'block' : 'none';
        if (popover.style.display === 'block') {
            document.getElementById('voiceQuickSettingsPopover').style.display = 'none';
        }
    }

    document.addEventListener('click', (e) => {
        const vPop = document.getElementById('voiceQuickSettingsPopover');
        if (vPop && vPop.style.display === 'block' && !e.target.closest('#voiceControlsContainer')) {
            vPop.style.display = 'none';
        }

        const aPop = document.getElementById('accountPopover');
        if (aPop && aPop.style.display === 'block' && !e.target.closest('.user-profile')) {
            aPop.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const vPop = document.getElementById('voiceQuickSettingsPopover');
            if (vPop) vPop.style.display = 'none';
            const aPop = document.getElementById('accountPopover');
            if (aPop) aPop.style.display = 'none';
        }
    });
