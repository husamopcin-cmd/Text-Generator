# Stage 39 Fiziksel Android QA Test Checklisti

## Test Öncesi Hazırlık

### Cihaz Bilgileri
- **Cihaz Modeli**: _______________
- **Android Versiyonu**: _______________
- **Ekran Çözünürlüğü**: _______________
- **Test Tarihi**: _______________
- **Test Süresi**: _______________

### Test Ortamı Kontrolü
- [ ] WiFi veya mobil veri bağlantısı aktif
- [ ] Cihaz pili en az %50
- [ ] Tarayıcı güncel (Chrome önerilir)
- [ ] Yeterli depolama alanı mevcut
- [ ] Mikrofon izni verilmiş (istemde)
- [ ] Ses ayarları normal seviyede

### Test URL
**Production URL**: https://cinocode-final-v4.netlify.app/cinocode_chat.html

---

## Test Checklisti

### ✅ 39.1A - Canlı URL Fiziksel Açılışı (TAMAMLANDI)
**Durum**: ✅ PASS
**Not**: Önceki oturumda ekran kanıtı ile doğrulandı

---

### ⏳ 39.1B - Mobil Sidebar Interaction (Toggle ve Görsel Kayma)

#### Test Adımları
1. URL'yi mobil tarayıcıda açın
2. Sayfa tam yüklendiğinde sidebar toggle butonunu bulun (genellikle ☰ veya benzeri ikon)
3. Toggle butonuna tıklayın
4. Sidebar'ın soldan sağa doğru kayarak açıldığını gözlemleyin
5. Sidebar açıkken tekrar toggle butonuna tıklayın
6. Sidebar'ın sağdan sola doğru kayarak kapandığını gözlemleyin
7. Arka plan overlay (backdrop) görünüp kaybolduğunu kontrol edin
8. Body scroll'un sidebar açıkken kilitlendiğini kontrol edin

#### Beklenen Davranış
- Sidebar toggle butonuna tıklandığında sidebar smoothly açılmalı
- CSS transition ile `translateX(-100%)` → `translateX(0)` animasyonu çalışmalı
- Backdrop overlay görünmeli ve tıklandığında sidebar kapanmalı
- Sidebar açıkken sayfa içeriği scroll olmamalı
- Sidebar kapanırken ters animasyon çalışmalı

#### PASS Kriterleri
- [ ] Toggle butonu tıklanabilir ve responsive
- [ ] Sidebar açılma animasyonu smooth ve visible
- [ ] Backdrop overlay görünür ve çalışır
- [ ] Body scroll sidebar açıkken kilitlenir
- [ ] Sidebar kapanma animasyonu smooth ve visible
- [ ] Herhangi bir görsel glitch veya taşma yok

#### FAIL Kriterleri
- Toggle butonu çalışmıyor
- Sidebar açılmıyor veya animasyon yok
- Backdrop görünmüyor veya çalışmıyor
- Body scroll kilitlenmiyor
- Görsel taşma veya layout bozulması var
- Animasyon takılıyor veya çok yavaş

#### Sonuç Formatı
```
39.1B: PASS/FAIL - [kısa açıklama]
Detaylar: [varsa ek bilgiler]
```

---

### ⏳ 39.2 - Mobil Sidebar Navigation (Menü Öğeleri Tıklanabilir mi?)

#### Test Adımları
1. Sidebar'ı açın
2. Tüm menü öğelerini listeleyin:
   - Standart Sohbet
   - Görsel
   - Video
   - Oyun
   - Belge
   - Projeler
   - My Apps
   - Beceriler/Bağlayıcılar
3. Her menü öğesine sırayla tıklayın
4. Her tıklama sonrası sidebar'ın kapanıp kapanmadığını kontrol edin
5. İlgili sayfa/modülün yüklendiğini kontrol edin
6. Geri butonu veya sidebar ile ana ekrana dönün

#### Beklenen Davranış
- Tüm menü öğeleri görünür ve tıklanabilir olmalı
- Menü öğeleri doğru sayfalara yönlendirmeli
- Sidebar menü öğesine tıklandığında kapanmalı
- Yönlendirilen sayfa/mode düzgün yüklenmeli
- Hiçbir broken link veya 404 hatası olmamalı

#### PASS Kriterleri
- [ ] Tüm 8 menü öğesi görünür
- [ ] Tüm menü öğeleri tıklanabilir
- [ ] Her tıklama sonrası sidebar kapanır
- [ ] Tüm yönlendirmeler çalışır
- [ ] Yönlendirilen sayfalar düzgün yüklenir
- [ ] Hiçbir menü öğesi çalışmıyor veya broken değil

#### FAIL Kriterleri
- Menü öğesi görünmüyor
- Menü öğesi tıklanabilir değil
- Tıklama sonrası sidebar kapanmıyor
- Yönlendirme çalışmıyor (404, broken link)
- Sayfa yüklenmiyor

#### Sonuç Formatı
```
39.2: PASS/FAIL - [kısa açıklama]
Detaylar: [hangi menü öğesi başarısız oldu, vb.]
```

---

### ⏳ 39.3 - Navigasyon Öğeleri Testi (Tüm Öğeler Görünüyor mu?)

#### Test Adımları
1. Sidebar'ı açın
2. Aşağıdaki navigasyon öğelerinin görünürlüğünü kontrol edin:
   - Standart Sohbet
   - Görsel
   - Video
   - Oyun
   - Belge
   - Projeler
   - My Apps
   - Beceriler/Bağlayıcılar
3. Her öğenin metnini ve ikonunu kontrol edin
4. Mobil viewport'ta taşma olmadığını kontrol edin
5. Tüm öğeler okunabilir font boyutunda olmalı

#### Beklenen Davranış
- Tüm 8 navigasyon öğesi görünmeli
- Metinler net ve okunabilir olmalı
- İkonlar (varsa) düzgün görünmeli
- Mobil viewport'ta taşma olmamalı
- Öğeler birbirini kapatan veya overlapping olmamalı

#### PASS Kriterleri
- [ ] Tüm 8 navigasyon öğesi görünür
- [ ] Metinler okunabilir font boyutunda
- [ ] İkonlar düzgün görünür
- [ ] Yatay taşma yok
- [ ] Öğeler birbirini kapamıyor
- [ ] Tüm öğeler tıklanabilir region içinde

#### FAIL Kriterleri
- Navigasyon öğesi eksik
- Metin çok küçük veya okunamaz
- İkon görünmüyor veya bozuk
- Yatay taşma var
- Öğeler overlapping

#### Sonuç Formatı
```
39.3: PASS/FAIL - [kısa açıklama]
Detaylar: [hangi öğe eksik veya problemli]
```

---

### ⏳ 39.4 - Composer Testi (Metin Alanı ve Gönder Butonu)

#### Test Adımları
1. Ana ekranda composer alanını bulun
2. Metin alanına tıklayın
3. Klavye açıldığını kontrol edin
4. Kısa bir test metni yazın (örn: "Merhaba")
5. Gönder butonuna tıklayın
6. Mesajın gönderildiğini kontrol edin
7. Metin alanının boşaldığını kontrol edin
8. Çok uzun metin yazın ve taşma kontrolü yapın

#### Beklenen Davranış
- Metin alanı tıklanabilir ve focus olmalı
- Klavye tıklandığında açılmalı
- Metin yazılabilir olmalı
- Gönder butonu tıklanabilir olmalı
- Mesaj gönderilmeli
- Metin alanı gönder sonrası temizlenmeli
- Uzun metinlerde taşma olmamalı

#### PASS Kriterleri
- [ ] Metin alanı tıklanabilir
- [ ] Klavye açılıyor
- [ ] Metin yazılabilir
- [ ] Gönder butonu tıklanabilir
- [ ] Mesaj gönderiliyor
- [ ] Metin alanı temizleniyor
- [ ] Uzun metin taşması yok
- [ ] UI layout bozulmuyor

#### FAIL Kriterleri
- Metin alanı tıklanamaz
- Klavye açılmıyor
- Metin yazılamıyor
- Gönder butonu çalışmıyor
- Mesaj gönderilmiyor
- Metin alanı temizlenmiyor
- Layout bozuluyor

#### Sonuç Formatı
```
39.4: PASS/FAIL - [kısa açıklama]
Detaylar: [hangi adım başarısız oldu]
```

---

### ⏳ 39.5 - Mikrofon / STT Testi (Donanım Erişimi)

#### Test Adımları
1. Composer alanında mikrofon ikonunu bulun ("Sesle Yaz" butonu)
2. Mikrofon butonuna tıklayın
3. Mikrofon izni istendiğinde izin verin
4. Mikrofon aktif olduğunu gösteren visual feedback'i kontrol edin
5. Birkaç saniye konuşun
6. Konuşma metne dönüştüğünü kontrol edin
7. Mikrofon butonuna tekrar tıklayarak durdurun
8. Dönüştürülen metni composer alanında kontrol edin

#### Beklenen Davranış
- Mikrofon butonu görünür ve tıklanabilir
- İzin istendiğinde izin verilebilmeli
- İzin verildiğinde mikrofon aktif olmalı
- Visual feedback (recording indicator) görünmeli
- Konuşma metne dönüştürülmeli
- Durdurulduğunda recording durmalı
- Dönüştürülen metin composer alanına eklenmeli

#### PASS Kriterleri
- [ ] Mikrofon butonu görünür
- [ ] Mikrofon butonu tıklanabilir
- [ ] İzin isteği gösteriliyor
- [ ] İzin verilebiliyor
- [ ] Mikrofon aktif oluyor
- [ ] Visual feedback çalışıyor
- [ ] Konuşma metne dönüştürülüyor
- [ ] Metin composer alanına ekleniyor

#### FAIL Kriterleri
- Mikrofon butonu görünmüyor
- Mikrofon butonu tıklanamaz
- İzin isteği gösterilmiyor
- İzin verilemiyor
- Mikrofon aktif olmuyor
- Visual feedback yok
- Konuşma metne dönüştürülmüyor
- Metin eklenmiyor

#### Sonuç Formatı
```
39.5: PASS/FAIL - [kısa açıklama]
Detaylar: [hangi adım başarısız oldu, hata mesajı]
```

---

### ⏳ 39.6 - TTS Gerçek Ses Testi (Ses Çıkışı)

#### Test Adımları
1. Bir sohbet mesajı gönderin veya var olan bir mesajı bulun
2. Mesaj üzerinde "Sesli Okuma" butonunu bulun
3. Sesli okuma butonuna tıklayın
4. Ses çıkışını dinleyin
5. Ses kalitesini ve netliğini değerlendirin
6. Ses hızı kontrolü (varsa) test edin
7. Sesli okumayı durdurun

#### Beklenen Davranış
- Sesli okuma butonu görünür ve tıklanabilir
- Tıklandığında ses başlamalı
- Ses net ve anlaşılır olmalı
- Ses hızı ayarlanabilir olmalı (varsa)
- Durdurma butonu çalışmalı
- Ses kesintisiz ve stable olmalı

#### PASS Kriterleri
- [ ] Sesli okuma butonu görünür
- [ ] Sesli okuma butonu tıklanabilir
- [ ] Ses başlıyor
- [ ] Ses net ve anlaşılır
- [ ] Ses hızı ayarlanabilir (varsa)
- [ ] Durdurma butonu çalışıyor
- [ ] Ses kesintisiz

#### FAIL Kriterleri
- Sesli okuma butonu görünmüyor
- Sesli okuma butonu tıklanamaz
- Ses başlamıyor
- Ses çok bozuk veya anlaşılmaz
- Ses sürekli kesiliyor
- Durdurma butonu çalışmıyor

#### Sonuç Formatı
```
39.6: PASS/FAIL - [kısa açıklama]
Detaylar: [ses kalitesi, netlik, hata mesajı]
```

---

### ⏳ 39.7 - OAuth Gerçek Giriş Testi (Hesap Girişi)

#### Test Adımları
1. Ana ekranda "Giriş Yap" veya benzeri butonu bulun
2. Giriş ekranına gidin
3. "Google ile Devam Et" butonunu bulun
4. Google OAuth butonuna tıklayın
5. Google giriş sayfasına yönlendirildiğini kontrol edin
6. Google hesabınızla giriş yapın
7. Uygulamaya geri yönlendirildiğinizi kontrol edin
8. Başarılı giriş sonrası UI değişikliklerini kontrol edin
9. Kullanıcı profil bilgilerinin görüntülendiğini kontrol edin

#### Beklenen Davranış
- Giriş butonu görünür ve tıklanabilir
- Google OAuth butonu görünür
- Tıklandığında Google'a yönlendirilmeli
- Google giriş sayfası düzgün yüklenmeli
- Giriş başarılı olmalı
- Uygulamaya geri yönlendirilmeli
- Giriş sonrası UI güncellenmeli
- Kullanıcı bilgileri görüntülenmeli

#### PASS Kriterleri
- [ ] Giriş butonu görünür
- [ ] Google OAuth butonu görünür
- [ ] Google'a yönlendirme çalışıyor
- [ ] Google giriş sayfası yükleniyor
- [ ] Google girişi başarılı
- [ ] Uygulamaya geri yönlendirme çalışıyor
- [ ] UI güncelleniyor
- [ ] Kullanıcı bilgileri görüntüleniyor

#### FAIL Kriterleri
- Giriş butonu görünmüyor
- Google OAuth butonu görünmüyor
- Yönlendirme çalışmıyor
- Google giriş sayfası yüklenmiyor
- Google girişi başarısız
- Geri yönlendirme çalışmıyor
- UI güncellenmiyor
- Kullanıcı bilgileri görüntülenmiyor

#### Sonuç Formatı
```
39.7: PASS/FAIL - [kısa açıklama]
Detaylar: [hangi adım başarısız oldu, hata mesajı]
```

---

### ⏳ 39.12 - Dokunmatik Hissiyat ve UI Responsiveness

#### Test Adımları
1. Sayfanın genel UI hissiyatını değerlendirin
2. Tıklama geri bildirimlerini (ripple effect, visual feedback) kontrol edin
3. Scroll hissiyatını test edin
4. Butonların tıklama alanlarını kontrol edin
5. Animasyonların smoothness'ini değerlendirin
6. Yükleme durumlarını (loading states) kontrol edin
7. Hata durumlarının (error states) görsel kontrolü
8. Genel kullanıcı deneyimini değerlendirin

#### Beklenen Davranış
- Tıklamalarda visual feedback olmalı
- Scroll smooth olmalı
- Butonlar yeterli tıklama alanına sahip olmalı
- Animasyonlar smooth olmalı
- Loading states görünür olmalı
- Error states anlaşılır olmalı
- Genel UX olumlu olmalı

#### PASS Kriterleri
- [ ] Tıklama feedback var
- [ ] Scroll smooth
- [ ] Buton tıklama alanları yeterli
- [ ] Animasyonlar smooth
- [ ] Loading states görünür
- [ ] Error states anlaşılır
- [ ] Genel UX olumlu
- [ ] Herhangi bir "jank" veya lag yok

#### FAIL Kriterleri
- Tıklama feedback yok
- Scroll takılıyor
- Butonlar çok küçük
- Animasyonlar choppy
- Loading states görünmüyor
- Error states anlaşılmaz
- Genel UX olumsuz
- Jank veya lag var

#### Sonuç Formatı
```
39.12: PASS/FAIL - [kısa açıklama]
Detaylar: [UX hissiyatı, spesifik sorunlar]
```

---

## Genel Notlar

### Cihaz Spesifik Sorunlar
```
[Cihazınızda yaşanan spesifik sorunları buraya not edin]
```

### Ekrş Görüntü Kanıtı
Önemli hatalar için ekran görüntüsü veya video kanıtı:
- [ ] Ekran görüntüleri alındı
- [ ] Video kaydı alındı (gerekirse)

### Test Süresi
- Başlangıç: _______________
- Bitiş: _______________
- Toplam Süre: _______________

### Genel Değerlendirme
```
[Genel test deneyiminizi buraya not edin]
```

---

## Sonuç Özeti

| Test ID | Sonuç | Notlar |
|---|---|---|
| 39.1A | ✅ PASS | Önceki oturumda tamamlandı |
| 39.1B | ___ | ___ |
| 39.2 | ___ | ___ |
| 39.3 | ___ | ___ |
| 39.4 | ___ | ___ |
| 39.5 | ___ | ___ |
| 39.6 | ___ | ___ |
| 39.7 | ___ | ___ |
| 39.12 | ___ | ___ |

### Stage 39 Kararı
- [ ] Tüm mandatory testler PASS → Stage 39 KAPAT
- [ ] Bir veya daha fazla test FAIL → Düzeltme planı gerekli
- [ ] Bazı testler NOT TESTED → Gerekçeli onay gerekli
