
    window.professionsList = [
        { id: "usta_yazilimci", name: "Usta Yazılımcı", emoji: "💻", description: "Yazılım, algoritma ve oyun geliştirme uzmanı." },
        { id: "profesor_doktor", name: "Profesör Doktor", emoji: "🩺", description: "Tıbbi teşhis, tedavi ve akademik tıp uzmanı." },
        { id: "ogretmen", name: "Öğretmen / Eğitmen", emoji: "🏫", description: "Pedagojik eğitim, konu anlatımı ve ders rehberi." },
        { id: "mimar", name: "Mimar / Tasarımcı", emoji: "📐", description: "Yapı tasarımı, estetik ve mekansal planlama uzmanı." },
        { id: "psikolog", name: "Psikolog / Danışman", emoji: "🧠", description: "Ruh sağlığı, terapi ve insan davranışı uzmanı." },
        { id: "dis_hekimi", name: "Diş Hekimi", emoji: "🦷", description: "Ağız ve diş sağlığı, tedavi uzmanı." },
        { id: "avukat", name: "Avukat / Hukukçu", emoji: "⚖️", description: "Hukuki danışmanlık, savunma ve mevzuat uzmanı." },
        { id: "diyetisyen", name: "Diyetisyen / Beslenme Uzmanı", emoji: "🍎", description: "Beslenme programları, diyet ve sağlıklı yaşam uzmanı." },
        { id: "muhasebeci", name: "Muhasebeci / Finansçı", emoji: "💼", description: "Mali tablolar, vergilendirme ve finans yönetimi." },
        { id: "tarihci", name: "Tarihçi", emoji: "📜", description: "Tarih araştırmaları, arşiv inceleme uzmanı." },
        { id: "gazeteci", name: "Gazeteci / Yazar", emoji: "📰", description: "Araştırmacı gazetecilik, haber ve makale yazarı." },
        { id: "bilim_insani", name: "Bilim İnsanı / Araştırmacı", emoji: "🧬", description: "Bilimsel araştırmalar, deney ve teori uzmanı." },
        { id: "ceo", name: "CEO / İş Danışmanı", emoji: "👔", description: "Şrketi yönetimi, strateji ve liderlik uzmanı." },
        { id: "pilot", name: "Pilot / Havacı", emoji: "✈️", description: "Uçuş emniyeti, havacılık ve seyrüsefer uzmanı." },
        { id: "muzisyen", name: "Müzisyen / Besteci", emoji: "🎻", description: "Müzik teorisi, beste ve enstrüman uzmanı." },
        { id: "ressam", name: "Ressam / Sanatçı", emoji: "🎨", description: "Görsel sanatlar, resim ve estetik uzmanı." },
        { id: "antrenor", name: "Spor Antrenörü", emoji: "⚽", description: "Fiziksel kondisyon, spor teknikleri ve idman planlama." },
        { id: "sef_asci", name: "Şef Aşçı", emoji: "🍳", description: "Gastronomi, tarifler ve mutfak yönetimi uzmanı." },
        { id: "makine_muhendisi", name: "Makine Mühendisi", emoji: "🛠️", description: "Mekanik tasarım, üretim ve termodinamik uzmanı." },
        { id: "eczaci", name: "Eczacı", emoji: "🧪", description: "İlaç formülasyonları, etkileşimler ve eczacılık uzmanı." },
        { id: "ziraat_muhendisi", name: "Ziraat Mühendisi", emoji: "🚜", description: "Tarım teknolojileri, bitki yetiştirme ve toprak uzmanı." },
        { id: "elektrik_muhendisi", name: "Elektrik Mühendisi", emoji: "⚡", description: "Elektrik şebekeleri, elektronik ve güç sistemleri uzmanı." },
        { id: "insaat_muhendisi", name: "İnşaat Mühendisi", emoji: "🏗️", description: "Statik hesaplamalar, şantiye ve yapı mühendisliği." },
        { id: "pazarlama_uzmani", name: "Pazarlama Uzmanı", emoji: "📊", description: "Marka yönetimi, reklam ve pazar analizi uzmanı." },
        { id: "insan_kaynaklari", name: "İnsan Kaynakları Uzmanı", emoji: "🤝", description: "İşe alım, personel yönetimi ve iş hukuku uzmanı." }
    ];

    function loadCustomProfessions() {
        try {
            const saved = JSON.parse(localStorage.getItem('cinocode_custom_professions')) || [];
            saved.forEach(p => {
                if (!window.professionsList.some(ex => ex.id === p.id)) {
                    window.professionsList.push(p);
                }
            });
        } catch(e) {}
    }

    function openProfessionModal() {
        loadCustomProfessions();
        document.getElementById('professionOverlay').classList.add('active');
        const menu = document.getElementById('professionMenu');
        menu.style.display = 'flex';
        setTimeout(() => menu.style.opacity = '1', 50);
        document.getElementById('professionSearchInput').value = '';
        populateProfessionsList();
        document.getElementById('professionSearchInput').focus();
    }

    function closeProfessionModal() {
        const menu = document.getElementById('professionMenu');
        menu.style.opacity = '0';
        setTimeout(() => {
            menu.style.display = 'none';
            document.getElementById('professionOverlay').classList.remove('active');
        }, 300);
    }

    function populateProfessionsList(filter = '') {
        const container = document.getElementById('professionsListContainer');
        if (!container) return;
        container.innerHTML = '';

        const normalizedFilter = filter.toLocaleLowerCase('tr-TR').trim();
        const filtered = window.professionsList.filter(p =>
            p.name.toLocaleLowerCase('tr-TR').includes(normalizedFilter) ||
            p.description.toLocaleLowerCase('tr-TR').includes(normalizedFilter)
        );

        filtered.forEach(p => {
            const item = document.createElement('div');
            item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:10px; border-radius: var(--cc-radius); background:var(--cc-border); cursor:pointer; border: 1px solid rgba(255, 255, 255, 0.08); transition:background 0.2s, border-color 0.2s;';
            item.onmouseenter = () => {
                item.style.background = 'var(--cc-border)';
                item.style.borderColor = 'var(--cc-accent-brand)';
            };
            item.onmouseleave = () => {
                item.style.background = 'var(--cc-border)';
                item.style.borderColor = 'var(--cc-border)';
            };

            const selectedVal = document.getElementById('personaSelect').value;
            if (selectedVal === p.id) {
                item.style.borderColor = '#a6e3a1';
                item.style.background = 'rgba(166,227,161,0.1)';
            }

            item.onclick = () => selectProfession(p.id);

            item.innerHTML = `
                <div style="font-size:24px; line-height:1;">${p.emoji}</div>
                <div style="flex:1;">
                    <div style="font-weight:bold; color:var(--cc-text-primary); font-size:13px;">${p.name}</div>
                    <div style="font-size:11px; color:var(--cc-text-muted); margin-top:2px;">${p.description}</div>
                </div>
            `;
            container.appendChild(item);
        });
    }

    function filterProfessions() {
        const val = document.getElementById('professionSearchInput').value;
        populateProfessionsList(val);
    }

    function selectProfession(id) {
        const chosen = window.professionsList.find(p => p.id === id);
        if (!chosen) return;

        const select = document.getElementById('personaSelect');
        const selectMobile = document.getElementById('personaSelectMobile');

        let opt = select.querySelector(`option[value="${id}"]`);
        if (!opt) {
            opt = document.createElement('option');
            opt.value = id;
            select.appendChild(opt);
        }
        opt.textContent = `${chosen.emoji} ${chosen.name}`;

        let optM = selectMobile.querySelector(`option[value="${id}"]`);
        if (!optM) {
            optM = document.createElement('option');
            optM.value = id;
            selectMobile.appendChild(optM);
        }
        optM.textContent = `${chosen.emoji} ${chosen.name}`;

        select.value = id;
        selectMobile.value = id;
        if (typeof syncCustomPersonaUi === 'function') syncCustomPersonaUi();

        closeProfessionModal();
        showNonBlockingToast(`Rol seçildi: ${chosen.name}`);

        // Update welcome header if welcome is visible
        const welcomeGreetingTextEl = document.getElementById("welcomeGreetingText");
        if (welcomeGreetingTextEl) {
            welcomeGreetingTextEl.textContent = getWelcomeGreetingText(id);
        }

        saveComposerDraft();
    }

    function addNewCustomProfession() {
        const name = prompt("Eklemek istediğiniz mesleğin adını girin (Örn: Astrolog, Tesisatçı, Emlakçı):");
        if (!name || !name.trim()) return;

        const emoji = prompt("Bu meslek için tek bir emoji seçin (Örn: 🔮, 🔧, 🏠):", "💼");
        const desc = prompt("Bu mesleğin kısa bir açıklamasını veya uzmanlık alanını yazın:", "Kendi alanında uzman rehber.");

        const id = "custom_" + Date.now();
        const newProf = {
            id: id,
            name: name.trim(),
            emoji: emoji || "💼",
            description: desc || "Uzman danışman."
        };

        window.professionsList.push(newProf);

        try {
            const saved = JSON.parse(localStorage.getItem('cinocode_custom_professions')) || [];
            saved.push(newProf);
            localStorage.setItem('cinocode_custom_professions', JSON.stringify(saved));
        } catch(e) {}

        populateProfessionsList();
        selectProfession(id);

        showNonBlockingToast(`"${name}" mesleği başarıyla oluşturuldu ve seçildi!`);
    }

    function getWelcomeGreetingText(personaValue) {
        if (personaValue === 'kanka') return "Bugün ne üretmek istersin kanka? Sana nasıl yardımcı olabilirim?";
        if (personaValue === 'akademik_koc') return "📚 Sınav Koçu Modu Aktif. PDF yükle ya da çalışmak istediğin dersi yaz, hemen hazırlanalım!";
        if (personaValue === 'dil_kocu') return "🌍 Özel Dil Koçu Modu Aktif. Hangi dili öğrenmek istersin kanka? Hadi pratik yapalım!";
        if (personaValue === 'derin_arastirma') return "🔍 Derin Araştırma Modu Aktif. Araştırmak istediğin konuyu yaz, kapsamlı analiz hazırlayayım.";

        if (window.professionsList) {
            const found = window.professionsList.find(p => p.id === personaValue);
            if (found) {
                return `${found.emoji} GinoCode ${found.name} olarak sana yardımcı olmaya hazır. Hangi konuda danışmak istersin?`;
            }
        }

        return "Bugün ne üretmek istersin? Sana yardımcı olmaya hazırım.";
    }

    // Auto-load custom professions on launch
    document.addEventListener('DOMContentLoaded', () => {
        // FAZ 21 GÖREV E: Slider Başlangıç Senkronu
        const sp = window.fz19GetTtsSpeed();
        const sl = document.getElementById('fz19TtsSpeedSlider');
        const lb = document.getElementById('fz19TtsSpeedLabel');
        if(sl) sl.value = sp;
        if(lb) lb.innerText = sp.toFixed(1) + 'x';

        loadCustomProfessions();
        initCustomPersonaDropdown();

        // Faz 19: Keşfet Turu — ilk açılışta bir kez otomatik başlat
        if (!localStorage.getItem('fz19_tour_seen')) {
            setTimeout(() => { if (typeof fz19StartTour === 'function' && !localStorage.getItem('fz19_tour_seen')) fz19StartTour(); }, 1500);
        }

        // If current saved draft uses a custom profession, inject it into selects so select element values match
        setTimeout(() => {
            const select = document.getElementById('personaSelect');
            const selectMobile = document.getElementById('personaSelectMobile');
            if (select && select.value && !select.querySelector(`option[value="${select.value}"]`)) {
                const found = window.professionsList.find(p => p.id === select.value);
                if (found) {
                    const opt = document.createElement('option');
                    opt.value = found.id;
                    opt.textContent = `${found.emoji} ${found.name}`;
                    select.appendChild(opt);

                    if (selectMobile) {
                        const optM = document.createElement('option');
                        optM.value = found.id;
                        optM.textContent = `${found.emoji} ${found.name}`;
                        selectMobile.appendChild(optM);
                    }
                }
            }
        }, 500);
    });
