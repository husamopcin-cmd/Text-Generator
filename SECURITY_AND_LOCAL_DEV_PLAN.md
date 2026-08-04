# ✅ CinoCode Güvenlik ve Yerel Ortam Doğrulama Planı (Final - Güncellenmiş)

## P0 — Bloklayıcılar

### Checkpoint A — Güvenlik

**Tamamlanma Kriteri:**
* Yeni API key aktif
* Eski key iptal
* Production çalışıyor

**Adımlar:**
1. Eski Anthropic API key'i revoke et
2. Yeni Anthropic API key oluştur
3. Netlify'daki `ANTHROPIC_API_KEY` değerini güncelle
4. Supabase Edge Functions / Secrets kullanılıyorsa orayı da güncelle
5. Gerekliyse yeniden deploy veya ilgili servisi yeniden başlat
6. AI kullanan basit bir istek göndererek **401/403 alınmadığını** doğrula

**Kanııt:**
* Ham terminal çıktısı
* Deploy çıktısı (varsa)
* AI isteğinin başarılı olduğunu gösteren çıktı
* **API anahtarı hiçbir yerde paylaşılmayacak**

---

### Checkpoint B — Geliştirme Ortamı

**Tamamlanma Kriteri:**
* .env mevcut
* Migration doğrulandı
* Local çalışıyor
* Smoke test geçti

**Adımlar:**
1. `.env` oluştur veya Netlify'dan çek
2. Sadece environment variable isimlerini doğrula
3. Local development ortamını başlat
4. Supabase migration status kontrol et
5. Migration'ları apply et (gerekirse)
6. Database schema validation

**Kanıt:**
* Ham terminal çıktıları
* Environment variable isimleri (değerler maskeli)
* Migration status çıktısı

---

## P0.5 — Deployment Parity

**Amaç:** Yerel ile production'ın aynı davranıp davranmadığını doğrula.

**Adımlar:**
1. Aynı environment variable isimleri kullanılıyor mu?
2. Local ile Netlify farklı davranıyor mu?
3. Local'de çalışan production'da da çalışıyor mu (ve tersi)?

**Kanııt:**
* Environment variable karşılaştırması
* Local vs production test çıktıları

---

## P1 — Çalışabilirlik Doğrulaması

### Faz 4 — Smoke Testleri

**Amaç:** Konfigürasyon doğruysa sistem çalışıyor mu test et.

**Testler:**
* ✅ Local development başlat
* ✅ AI endpoint smoke test
* ✅ Supabase bağlantı testi

**Kanııt:**
* Ham terminal çıktıları
* Test sonuçları

---

## P2 — Mimari Kararlar

### Faz 5 — Mimari Temizlik

**Amaç:** Sistem stabil olduktan sonra mimari kararları değerlendir.

**Kanııt Öncesi Kararlar:**
7. Wrapper layer gerçekten gerekli mi?
8. `vercel.json` gerekli mi?
9. Security header'lar gerçekten çakışıyor mu?
10. Dead code gerçekten var mı?

**Kanııt:**
* Her madde için kanıt
* Sonra karar

---

## P3 — Refactor / Temizlik

### Faz 6 — V2 Refactor

**Amaç:** Stabil çalışan sistemi planlı refactor et.

**Adımlar:**
11. `main.js` modülerleştirme
12. `index.html` sadeleştirme

**Not:** Bunlar V1 kapanışını engellemez. Stabil çalışan bir sistemi sırf "daha temiz olsun" diye parçalamak yerine, V2'de planlı refactor yapmak daha güvenlidir.

---

# Rollback Planı

### Checkpoint A (Güvenlik) Rollback

1. Mevcut env değişkenlerini export et
2. Eski deploy ID'sini not al
3. Netlify Previous Deploy'e dön (gerekirse)
4. Secret'ı eski değerle geri yükle
5. Smoke test tekrar çalıştır
6. Hangi adım başarısız oldu? Kaydet

### Checkpoint B (Geliştirme Ortamı) Rollback

1. .env dosyasını sil
2. Netlify env'leri geri yükle
3. Local dev yeniden başlat
4. Migration rollback
5. Smoke test tekrar çalıştır
6. Hangi adım başarısız oldu? Kaydet

---

# Exit Criteria

### Checkpoint A Tamamlandı Sayılması İçin
✔ Eski Anthropic API key'i revoke edildi
✔ Yeni Anthropic API key'i oluşturuldu
✔ Netlify'da `ANTHROPIC_API_KEY` güncellendi
✔ AI isteği 401/403 vermiyor

### Checkpoint B Tamamlandı Sayılması İçin
✔ .env dosyası oluşturuldu
✔ Environment variable isimleri doğrulandı
✔ Local development ortamı başlatıldı
✔ Supabase migration doğrulandı
✔ Smoke test geçti

---

# Evidence Folder

Tüm kanıtlar şurada toplanacak:

```
docs/
└── verification/
    ├── README.md
    ├── 01-security/
    ├── 02-local-env/
    ├── 03-migrations/
    ├── 04-parity/
    └── 05-smoke/
```

### README.md İçeriği

| Checkpoint | Kanıt        |
| ---------- | ------------ |
| A          | 01-security  |
| B          | 02-local-env |

### Evidence Standardı

Her checkpoint için:

* Tarih
* Commit SHA
* Branch
* Komut
* Çıktı
* Sonuç (PASS / FAIL)

Bu sayede denetim izi (audit trail) daha güçlü olur.

---

# Version

**v1.0 - Frozen**

Bu belge artık dondurulmuştur. Bundan sonraki değişiklikler sadece gerçekten yeni bir gereksinim çıktığında yapılacaktır.

Yeni ihtiyaç çıkarsa:
* v1.1
* v1.2
* v2.0

gibi yeni bir sürüm oluşturun ve kısa bir changelog ekleyin.

---

# Changelog

### v1.0 (2026-08-03)
* İlk versiyon
* Checkpoint yapısı (A: Güvenlik, B: Geliştirme Ortamı)
* Rollback planı (somut adımlar)
* Exit criteria (checkpoint bazlı)
* Evidence folder yapısı (README + klasörler)
* Evidence standardı (Tarih, Commit SHA, Branch, Komut, Çıktı, Sonuç)
* Audit raporu kararları (tarih eklendi)
* Uygulama döngüsü (5 adım)

---

# Audit Raporu Kararları

| Madde            | Karar         | Tarih      |
| ---------------- | ------------- | ---------- |
| API key          | ✅ Yapılacak   | 2026-08-03 |
| .env             | ✅ Yapılacak   | 2026-08-03 |
| Migration        | ✅ Yapılacak   | 2026-08-03 |
| Wrapper          | ⏳ İncelenecek | 2026-08-03 |
| vercel.json      | ⏳ İncelenecek | 2026-08-03 |
| Security headers | ⏳ İncelenecek | 2026-08-03 |
| Dead code        | ⏳ İncelenecek | 2026-08-03 |
| main.js refactor | 🔜 V2         | 2026-08-03 |
| index.html       | 🔜 V2         | 2026-08-03 |

---

# Uygulama Döngüsü

1. Bir checkpoint seç
2. Uygula
3. Ham çıktıyı al
4. Doğrula
5. Bir sonraki checkpoint'e geç

---

# Doğrulama Prensibi

Her iddia aşağıdakilerden biriyle desteklenmeli:

* Ham terminal çıktısı
* Build/Test çıktısı
* Deploy çıktısı
* HTTP durum kodu veya uygulama logu

**"Çalıştı", "tamam", "%100 oldu" gibi ifadeler tek başına kanıt kabul edilmez.**

---

## Son not

Bu planın en güçlü yanı teknik adımlar değil, **kanıt disiplini**. Özellikle birden fazla agent (Devin, Codex, Antigravity vb.) ile çalışırken aynı kuralı uygularsan, yanlış raporlar veya eksik doğrulamalar çok daha kolay yakalanır.

Bence bu haliyle plan tamamlanmış ve uygulanmaya hazır. Bundan sonra yapılacak iş, yalnızca adımları sırayla uygulayıp her aşamada doğrulanabilir çıktıları kontrol etmek.

---

# PASS / FAIL Şablonu

Her checkpoint için bu format kullanılacaktır:

```text
Checkpoint: [A/B] - [Checkpoint Adı]

Date: [YYYY-MM-DD]
Commit: [SHA]
Branch: [branch-name]

Commands:
- [komut 1]
- [komut 2]
...

Result:
PASS / FAIL / UNKNOWN

Evidence:
- [kanıt dosyası 1]
- [kanıt dosyası 2]

Notes:
- [ek notlar]
```

### PASS Tanımı
PASS yalnızca bütün Exit Criteria sağlandıysa verilir:
✓ Exit Criteria sağlandı
✓ Kanıt mevcut
✓ Kritik hata yok

### FAIL Tanımı
EXIT Criteria sağlanmadığında verilir ve neden yazılır.

### UNKNOWN Tanımı
PASS veya FAIL demek doğru olmadığında verilir:
✓ Erişim yok
✓ Servis kapalı
✓ Yetki eksik
✓ Test edilemedi

Böylece bütün kanıtlar aynı formatta olur.

---

# Risk Register

| Risk                                     | Etki   | Önlem             | Durum |
| ---------------------------------------- | ------ | ----------------- | ----- |
| API key revoke sonrası servis çalışmıyor | High   | Rollback          | Open  |
| Migration başarısız                      | High   | Backup + rollback | Open  |
| Local/prod farkı                         | Medium | Parity test       | Open  |

---

# Evidence İsim Standardı

Dosya isimleri standartlaştırılmıştır:

```text
2026-08-03_checkpoint-a_terminal.txt
2026-08-03_checkpoint-a_deploy.log
2026-08-03_checkpoint-a_http.json
```

Bu sayede arama kolaylaşır.
