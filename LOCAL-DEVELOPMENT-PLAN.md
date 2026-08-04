# Text-Generator Local Development Kurulum Planı

## 🎯 Hedef

Text-Generator (CinoCode V4.2) projesini local development için tam çalışır hale getirmek.

**Mevcut Durum**: %90 (Frontend tam, local development eksik)
**Hedef Durum**: %100 (Local development tam çalışır)
**Tahmini Süre**: 1-2 saat

---

## 📋 Plan Özeti

**Aşama 1**: .env Dosyası Oluşturma (10 dakika)
**Aşama 2**: API Key'leri Alma (30-60 dakika)
**Aşama 3**: Netlify CLI Dev Kurulumu (15 dakika)
**Aşama 4**: Local Test (15 dakika)
**Aşama 5**: Doğrulama ve Raporlama (10 dakika)

**Toplam Süre**: 1.5 - 2 saat

---

## AŞAMA 1: .env Dosyası Oluşturma (10 dakika)

### 1.1 .env Dosyası Oluştur

**Komut**:
```bash
cd C:\Users\Hüsamettin Öpçin\Desktop\Text-Generator
echo. > .env
```

**Sonuç**: .env dosyası oluşturulacak

### 1.2 Zorunlu Environment Variable'ları Ekle

**Eklenecek Değişkenler**:

```env
# Supabase Auth (Zorunlu)
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Guest Token Secret (Zorunlu - 32+ karakter)
CINOCODE_GUEST_TOKEN_SECRET=

# Quota Hash Secret (Zorunlu - 32+ karakter)
CINOCODE_QUOTA_HASH_SECRET=

# Guest Abuse Controls (İsteğe bağlı - varsayılan değerler)
CINOCODE_GUEST_ABUSE_WINDOW_SECONDS=900
CINOCODE_GUEST_ABUSE_MAX_NEW_DEVICES=6
CINOCODE_GUEST_ABUSE_MAX_FAILED_VERIFICATIONS=8
```

**Rastgele Secret'lar Oluşturma**:
- `CINOCODE_GUEST_TOKEN_SECRET`: 32+ karakter rastgele string
- `CINOCODE_QUOTA_HASH_SECRET`: 32+ karakter rastgele string (farklı)

**Başarı Kriteri**: .env dosyası oluşturuldu, zorunlu değişkenler eklendi

---

## AŞAMA 2: API Key'leri Alma (30-60 dakika)

### 2.1 Supabase Key'leri (Zorunlu)

**Adımlar**:
1. https://supabase.com adresine git
2. Hesap aç (veya giriş yap)
3. New project oluştur
4. Project settings → API
5. Aşağıdaki key'leri kopyala:
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_PUBLISHABLE_KEY` (anon public)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role)

**Kullanıcının Yapacağı**: Key'leri alıp bana verecek

**Benim Yapacağım**: .env dosyasına ekleyeceğim

### 2.2 AI Provider Key'leri (En az biri gerekli)

**Seçenek A: Groq (Önerilen - Ücretsiz)**
1. https://console.groq.com adresine git
2. Hesap aç (veya giriş yap)
3. API Key oluştur
4. `GROQ_API_KEY` kopyala

**Seçenek B: Gemini (Önerilen - Ücretsiz)**
1. https://makersuite.google.com/app/apikey adresine git
2. Hesap aç (veya giriş yap)
3. API Key oluştur
4. `GEMINI_API_KEY` kopyala

**Seçenek C: OpenRouter (Önerilen - Ücretsiz tier)**
1. https://openrouter.ai/keys adresine git
2. Hesap aç (veya giriş yap)
3. API Key oluştur
4. `OPENROUTER_API_KEY` kopyala

**Kullanıcının Yapacağı**: En az bir key alıp bana verecek

**Benim Yapacağım**: .env dosyasına ekleyeceğim

### 2.3 İsteğe Bağlı Key'ler

**Guest Access için Turnstile** (İsteğe bağlı):
1. https://dash.cloudflare.com/sign-up adresine git
2. Turnstile oluştur
3. `TURNSTILE_SITE_KEY` ve `TURNSTILE_SECRET_KEY` kopyala

**Kullanıcının Yapacağı**: İstersen Turnstile key'leri alacak

**Benim Yapacağım**: .env dosyasına ekleyeceğim

**Başarı Kriteri**: Supabase key'ler + en az bir AI provider key eklendi

---

## AŞAMA 3: Netlify CLI Dev Kurulumu (15 dakika)

### 3.1 Netlify CLI Kurulumu

**Komut**:
```bash
cd C:\Users\Hüsamettin Öpçin\Desktop\Text-Generator
npm install -g netlify-cli
```

**Sonuç**: Netlify CLI global olarak kurulacak

### 3.2 Netlify Dev Başlatma

**Komut**:
```bash
npx netlify-cli dev
```

**Alternatif (Port çakışması varsa)**:
```bash
npx netlify-cli dev --port 8888
```

**Sonuç**: Netlify dev server başlayacak

**Beklenen Çıktı**:
```
◈ Netlify Dev ◈
◈ Ignored default context command
◈ Starting Netlify Dev with C:\Users\Hüsamettin Öpçin\Desktop\Text-Generator
◈ Loaded netlify.toml
◈ Netlify Dev serving C:\Users\Hüsamettin Öpçin\Desktop\Text-Generator at http://localhost:8888
```

**Başarı Kriteri**: Netlify dev server çalışıyor, http://localhost:8888 erişilebilir

---

## AŞAMA 4: Local Test (15 dakika)

### 4.1 Health Check Test

**Test**: Browser'da http://localhost:8888/cinocode_chat.html aç

**Beklenen Sonuç**:
- ✅ UI açılıyor
- ✅ Sidebar çalışıyor
- ✅ Settings açılıyor

### 4.2 Auth Test

**Test 1**: Supabase ile giriş yapmayı dene

**Beklenen Sonuç**:
- ✅ Auth modal açılıyor
- ✅ Email/password ile giriş çalışıyor
- ✅ Google OAuth butonu görünüyor

**Test 2**: Local profile oluştur

**Beklenen Sonuç**:
- ✅ Local profile oluşturuluyor
- ✅ Local profile ile giriş çalışıyor

### 4.3 AI Chat Test

**Test**: Bir mesaj gönder

**Beklenen Sonuç**:
- ✅ AI'dan cevap geliyor
- ✅ Groq/Gemini/OpenRouter çalışıyor
- ✅ Chat history kaydediliyor

### 4.4 Backend Function Test

**Test 1**: auth-config endpoint test

**Komut**:
```bash
curl http://localhost:8888/.netlify/functions/auth-config
```

**Beklenen Sonuç**:
```json
{
  "supabaseUrl": "...",
  "supabaseAnonKey": "...",
  "googleProviderEnabled": true
}
```

**Test 2**: ai-chat endpoint test

**Komut**:
```bash
curl -X POST http://localhost:8888/.netlify/functions/ai-chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Merhaba","provider":"groq"}'
```

**Beklenen Sonuç**:
```json
{
  "reply": "...",
  "provider": "groq"
}
```

**Başarı Kriteri**: Tüm testler başarılı

---

## AŞAMA 5: Doğrulama ve Raporlama (10 dakika)

### 5.1 Test Suite Çalıştırma

**Komut**:
```bash
npm test
```

**Beklenen Sonuç**: 385/385 test geçiyor

### 5.2 Final Rapor

**Rapor İçeriği**:
- ✅ .env dosyası oluşturuldu
- ✅ Supabase key'ler eklendi
- ✅ AI provider key'leri eklendi
- ✅ Netlify CLI dev kuruldu
- ✅ Local server çalışıyor
- ✅ Auth testleri başarılı
- ✅ AI chat testleri başarılı
- ✅ Backend function testleri başarılı
- ✅ Test suite geçiyor (385/385)

**Başarı Kriteri**: Tüm testler başarılı, local development tam çalışır

---

## 🎯 Sonuç

**Tamamlanan**:
- ✅ .env dosyası oluşturuldu
- ✅ API key'ler eklendi
- ✅ Netlify CLI dev kuruldu
- ✅ Local server çalışıyor
- ✅ Tüm testler başarılı

**İlerleme**: %90 → %100

**Sonraki Adım**: Local development kullanmaya başla

---

## ⚠️ Riskler ve Çözümler

### Risk 1: API Key Alınması Zaman Alabilir

**Risk**: Kullanıcı API key almakta zorlanabilir
**Çözüm**: Öncelikle ücretsiz provider'lar seç (Groq, Gemini)

### Risk 2: Port Çakışması

**Risk**: 8888 portu kullanımda olabilir
**Çözüm**: Farklı port kullan (--port 3000 gibi)

### Risk 3: Supabase Migration Uygulanmamış

**Risk**: Supabase migration'ları uygulanmamış olabilir
**Çözüm**: Migration'ları kontrol et, gerekirse uygula

### Risk 4: Key'ler Geçersiz

**Risk**: API key'ler geçersiz veya kotası bitmiş olabilir
**Çözüm**: Key'leri test et, geçersizse yenile

---

## 📋 Kontrol Listesi

### Aşama 1: .env Dosyası
- [ ] .env dosyası oluşturuldu
- [ ] Supabase URL eklendi
- [ ] Supabase Publishable Key eklendi
- [ ] Supabase Service Role Key eklendi
- [ ] Guest Token Secret eklendi (32+ karakter)
- [ ] Quota Hash Secret eklendi (32+ karakter)

### Aşama 2: API Key'ler
- [ ] Supabase key'ler alındı
- [ ] Groq/Gemini/OpenRouter key'i alındı
- [ ] Turnstile key'leri alındı (isteğe bağlı)
- [ ] Tüm key'ler .env dosyasına eklendi

### Aşama 3: Netlify CLI Dev
- [ ] Netlify CLI kuruldu
- [ ] Netlify dev başlatıldı
- [ ] Server çalışıyor (http://localhost:8888)

### Aşama 4: Local Test
- [ ] UI açılıyor
- [ ] Auth çalışıyor
- [ ] AI chat çalışıyor
- [ ] Backend functions çalışıyor

### Aşama 5: Doğrulama
- [ ] Test suite geçiyor (385/385)
- [ ] Final rapor hazırlandı
- [ ] Local development tam çalışır

---

## 🚀 Başlangıç

**Kullanıcının Yapacağı İlk Adım**:
Supabase key'lerini almak için supabase.com'a git

**Benim Yapacağım İlk Adım**:
.env dosyasını oluşturup rastgele secret'ları ekleyeceğim

**Hadi Başlayalım!** 🎉
