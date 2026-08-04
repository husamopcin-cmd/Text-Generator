# Stage 39 Test Raporlama Formatı

Bu doküman Stage 39 fiziksel Android QA test sonuçlarının standart bir şekilde raporlanması için format ve şablonları içerir.

## Standart Raporlama Formatı

### Tek Test Sonucu Formatı

Her test için sonuç aşağıdaki formatta raporlanmalı:

```
[Test ID]: [PASS/FAIL] - [Kısa açıklama]

Detaylar: [varsa ek bilgiler]
```

**Örnekler:**

```
39.1B: PASS - Sidebar toggle düzgün çalışıyor, animasyon smooth

Detaylar: Sidebar açılış/kapanış animasyonu 0.3s, backdrop overlay çalışıyor, body scroll kilitleniyor.
```

```
39.2: FAIL - "Projeler" menü öğesi tıklanabilir değil

Detaylar: Sidebar açılıyor, "Projeler" öğesi görünür ama tıklandığında hiçbir tepki vermiyor. Diğer menü öğeleri normal çalışıyor.
```

### Hata Raporlama Formatı

FAIL sonuçları için detaylı hata raporu:

```
[Test ID]: FAIL - [Kısa hata özeti]

Beklenen: [Beklenen davranış]
Gerçek: [Gerçekleşen davranış]
Adımlar: [Hata reproduksiyon adımları]
Hata Mesajı: [varsa hata mesajı]
Cihaz: [Cihaz modeli ve Android versiyonu]
Ekran Görüntüsü: [ekran görüntüsü dosya adı veya URL]
```

**Örnek:**

```
39.7: FAIL - Google OAuth giriş başarısız

Beklenen: Google ile giriş yapıldığında uygulamaya geri yönlendirilmeli
Gerçek: Google giriş sayfası yükleniyor ama giriş sonrası beyaz ekran kalıyor
Adımlar:
1. "Google ile Devam Et" butonuna tıklandı
2. Google giriş sayfası açıldı
3. Hesap seçildi ve şifre girildi
4. "İzin Ver" butonuna tıklandı
5. Beyaz ekran geldi, uygulama yüklenmedi
Hata Mesajı: Konsolda "redirect_uri_mismatch" hatası görüldü
Cihaz: Samsung Galaxy S21, Android 13
Ekran Görüntüsü: error_oauth_redirect.png
```

## Toplu Test Sonucu Formatı

Tüm testlerin sonuçlarını içeren toplu rapor:

```
# Stage 39 Fiziksel Android QA Test Raporu

## Cihaz Bilgileri
- Cihaz Modeli: [Model]
- Android Versiyonu: [Versiyon]
- Ekran Çözünürlüğü: [Çözünürlük]
- Test Tarihi: [Tarih]
- Test Süresi: [Süre]
- Tarayıcı: [Tarayıcı versiyonu]

## Test Sonuçları

### 39.1A - Canlı URL Fiziksel Açılışı
Sonuç: ✅ PASS
Not: Önceki oturumda ekran kanıtı ile doğrulandı

### 39.1B - Mobil Sidebar Interaction
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.2 - Mobil Sidebar Navigation
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.3 - Navigasyon Öğeleri Testi
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.4 - Composer Testi
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.5 - Mikrofon / STT Testi
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.6 - TTS Gerçek Ses Testi
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.7 - OAuth Gerçek Giriş Testi
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

### 39.12 - Dokunmatik Hissiyat ve UI Responsiveness
Sonuç: [PASS/FAIL]
Detaylar: [açıklama]

## Özet
- Toplam Test: 8 (39.1A dahil)
- PASS: [sayı]
- FAIL: [sayı]
- NOT TESTED: [sayı]

## Genel Notlar
[Genel test deneyimi, cihaz spesifik sorunlar, vb.]

## Ek Kanıtlar
- [ ] Ekran görüntüleri
- [ ] Video kayıtları
- [ ] Konsol logları

## Stage 39 Kararı
- [ ] Tüm mandatory testler PASS → Stage 39 KAPAT
- [ ] Bir veya daha fazla test FAIL → Düzeltme planı gerekli
- [ ] Bazı testler NOT TESTED → Gerekçeli onay gerekli
```

## Basit Hızlı Rapor Formatı

Kısa, hızlı rapor için basit format:

```
# Stage 39 Hızlı Test Raporu

Cihaz: [Model, Android versiyonu]
Tarih: [Tarih]

Sonuçlar:
39.1A: ✅ PASS (önceki oturum)
39.1B: [P/F] - [kısa not]
39.2: [P/F] - [kısa not]
39.3: [P/F] - [kısa not]
39.4: [P/F] - [kısa not]
39.5: [P/F] - [kısa not]
39.6: [P/F] - [kısa not]
39.7: [P/F] - [kısa not]
39.12: [P/F] - [kısa not]

Karar: [KAPAT / DÜZELTME GEREKLİ / GEREKÇELİ ONAY]
```

## Konsol Hata Logları Formatı

Eğer konsol hataları varsa:

```
## Konsol Hataları

### [Test ID]
Zaman: [timestamp]
Hata Türü: [Error/Warning/Network]
Hata Mesajı: [mesaj]
Stack Trace: [varsa stack trace]
```

## Video/Ekran Görüntüsü Kanıtları

Kanıt dosyaları için format:

```
## Kanıt Dosyaları

### Ekran Görüntüleri
- [Test ID]_[açıklama].png
- [Test ID]_[açıklama].png

### Video Kayıtları
- [Test ID]_[açıklama].mp4
- [Test ID]_[açıklama].mp4
```

## Hata Öncelik Sınıflandırması

FAIL sonuçları için öncelik:

### Kritik (Critical)
- Uygulama çöküyor
- Ana fonksiyon çalışmıyor (giriş, sohbet, vb.)
- Güvenlik sorunu
- Veri kaybı

### Yüksek (High)
- Önemli özellik çalışmıyor
- Kullanıcı deneyimi ciddi şekilde etkileniyor
- Çoklu kullanıcı etkileniyor

### Orta (Medium)
- Küçük özellik çalışmıyor
- Kullanıcı deneyimi orta derecede etkileniyor
- Workaround mevcut

### Düşük (Low)
- Cosmetic sorun
- Edge case
- Nadir görülen durum

## Rapor Gönderme

Raporlar şu şekillerde gönderilebilir:

1. **Metin olarak**: Bu formatın olduğu şekilde metin dosyası veya doğrudan mesaj
2. **Markdown dosyası**: `.md` formatında dosya
3. **Şablon doldurma**: `STAGE-39-TEST-CHECKLIST.md` dosyasını doldurup gönderme

## İpuçları

1. **Spesifik olun**: "Çalışmıyor" yerine "X butonuna tıklandığında Y hatası veriyor" deyin
2. **Adımları belirtin**: Hata reproduksiyon adımlarını net olarak belirtin
3. **Ekran görüntüsü alın**: Özellikle FAIL durumlarında ekran görüntüsü çok yardımcı olur
4. **Cihaz bilgisi**: Hangi cihazda test yapıldığını mutlaka belirtin
5. **Konsol logları**: Varsa konsol hatalarını raporlayın
6. **Beklenen vs Gerçek**: Beklenen davranışı ve gerçek davranışı net şekilde belirtin

## Örnek Tam Rapor

```
# Stage 39 Fiziksel Android QA Test Raporu

## Cihaz Bilgileri
- Cihaz Modeli: Samsung Galaxy S21
- Android Versiyonu: 13
- Ekran Çözünürlüğü: 1080x2400
- Test Tarihi: 2026-08-03
- Test Süresi: 45 dakika
- Tarayıcı: Chrome 114.0.5735.196

## Test Sonuçları

### 39.1A - Canlı URL Fiziksel Açılışı
Sonuç: ✅ PASS
Not: Önceki oturumda ekran kanıtı ile doğrulandı

### 39.1B - Mobil Sidebar Interaction
Sonuç: ✅ PASS
Detaylar: Sidebar toggle düzgün çalışıyor, animasyon smooth (0.3s), backdrop overlay çalışıyor, body scroll kilitleniyor.

### 39.2 - Mobil Sidebar Navigation
Sonuç: ✅ PASS
Detaylar: Tüm 8 menü öğesi tıklanabilir ve doğru sayfalara yönlendiriyor. Sidebar tıklama sonrası kapanıyor.

### 39.3 - Navigasyon Öğeleri Testi
Sonuç: ✅ PASS
Detaylar: Tüm navigasyon öğeleri görünür, metinler okunabilir, ikonlar düzgün, taşma yok.

### 39.4 - Composer Testi
Sonuç: ✅ PASS
Detaylar: Metin alanı tıklanabilir, klavye açılıyor, metin yazılabilir, gönder butonu çalışıyor, mesaj gönderiliyor, metin alanı temizleniyor.

### 39.5 - Mikrofon / STT Testi
Sonuç: ⚠️ PARTIAL
Detaylar: Mikrofon butonu çalışıyor, izin verilebiliyor, recording indicator görünüyor, ancak bazen konuşma metne dönüştürülmüyor (her 3. denemede 1 başarısız).

### 39.6 - TTS Gerçek Ses Testi
Sonuç: ❌ FAIL
Detaylar: Sesli okuma butonu tıklanabilir, ancak ses başlamıyor. Konsolda "TTS endpoint not configured" hatası görülüyor.

### 39.7 - OAuth Gerçek Giriş Testi
Sonuç: ✅ PASS
Detaylar: Google OAuth düzgün çalışıyor, giriş başarılı, uygulama geri yönlendirme çalışıyor, UI güncelleniyor, kullanıcı bilgileri görüntüleniyor.

### 39.12 - Dokunmatik Hissiyat ve UI Responsiveness
Sonuç: ✅ PASS
Detaylar: Tıklama feedback var, scroll smooth, buton tıklama alanları yeterli, animasyonlar smooth, genel UX olumlu.

## Özet
- Toplam Test: 8 (39.1A dahil)
- PASS: 6
- FAIL: 1 (39.6)
- PARTIAL: 1 (39.5)

## Genel Notlar
Genel uygulama deneyimi olumlu. TTS backend yapılandırılmadığı için sesli okuma çalışmıyor (beklenen durum). STT bazen başarısız oluyor, muhtemelen network timeout.

## Ek Kanıtlar
- [x] Ekran görüntüleri (başarılı testler için)
- [x] Ekran görüntüsü (39.6 TTS hatası için)
- [ ] Video kayıtları

## Stage 39 Kararı
- [x] Bir veya daha fazla test FAIL → Düzeltme planı gerekli

### Düzeltme Öncelikleri
1. **Kritik**: 39.6 TTS (backend yapılandırma gerekiyor)
2. **Yüksek**: 39.5 STT (network timeout investigation)
```

## Düzeltme Planı İsteği Formatı

Eğer düzeltme planı gerekiyorsa:

```
## Düzeltme Planı İsteği

### Hatalar
1. [Test ID]: [Hata açıklaması]
2. [Test ID]: [Hata açıklaması]

### Öncelik Sıralaması
1. [Kritik/Yüksek/Orta/Düşük] - [Test ID]
2. [Kritik/Yüksek/Orta/Düşük] - [Test ID]

### Beklenen Düzeltme Süresi
- [Tahmini süre]

### Ek Notlar
[varsa ek bilgiler]
```
