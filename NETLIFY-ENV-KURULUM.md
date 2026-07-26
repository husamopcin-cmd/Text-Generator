# Netlify / Render Environment Variables — Kurulum Kontrol Listesi

> Bu dosya yalnızca değişken adlarını ve kurulum adımlarını içerir. Gerçek anahtarları
> repoya, commit'e, ZIP paketine veya hata kayıtlarına koyma. Yerel `.env` dosyası Git
> tarafından yok sayılır.

## 1. Netlify — erişim ve kota güvenliği

Güncel backend, sohbet ve görsel üretim çağrılarından önce kimlik ve günlük kota
kontrolü yapar. Aşağıdaki değişkenler production context'inde zorunludur:

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_PUBLISHABLE_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CINOCODE_GUEST_TOKEN_SECRET` — en az 32 karakterlik rastgele uygulama sırrı
- [ ] `CINOCODE_QUOTA_HASH_SECRET` — en az 32 karakterlik farklı bir rastgele uygulama sırrı

`SUPABASE_SERVICE_ROLE_KEY` yalnızca Netlify Functions ortamında tutulur. Frontend
koduna, `.env` ile tarayıcıya veya public build değişkenlerine aktarılmaz.

Supabase production veritabanına
`supabase/migrations/202607220001_cinocode_usage_quotas.sql` uygulanmış olmalıdır.
Migration doğrulanmadan erişim/kota katmanı release-ready sayılmaz.

## 2. Netlify — misafir erişimi

Yerel profil veya oturum açmadan kullanım sunulacaksa Cloudflare Turnstile
zorunludur:

- [ ] `TURNSTILE_SITE_KEY`
- [ ] `TURNSTILE_SECRET_KEY`

Turnstile widget action değeri `cinocode-guest` olmalıdır. Secret key yalnızca
Netlify Functions tarafından okunur. Misafir erişimi kapalı tutulacaksa kullanıcı
Supabase hesabıyla oturum açmalıdır.

## 3. Netlify — sohbet sağlayıcıları

En az bir çalışan sağlayıcı yeterlidir:

- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `GROQ_API_KEY`
- [ ] `GEMINI_API_KEY`
- [ ] `DEEPSEEK_API_KEY`
- [ ] `MISTRAL_API_KEY`
- [ ] `OPENROUTER_API_KEY`
- [ ] `XAI_API_KEY`
- [ ] `CEREBRAS_API_KEY`
- [ ] `FIREWORKS_API_KEY`
- [ ] `TOGETHER_API_KEY`

Eksik sağlayıcılar fallback zincirinden çıkarılır. Geçersiz, kotası bitmiş veya
yetkisiz anahtarlar release kontrolünde ayrıca işaretlenir.

## 4. Netlify — görsel sağlayıcıları

En az bir çalışan görsel sağlayıcısı yeterlidir:

- [ ] `RUNWARE_API_KEY`
- [ ] `FAL_KEY`
- [ ] `REPLICATE_API_TOKEN`
- [ ] `STABILITY_API_KEY`
- [ ] `HUGGINGFACE_API_KEY`
- [ ] `POLLINATIONS_API_KEY`

## 5. Supabase Auth

- [ ] Email ve gerekiyorsa Google provider etkinleştirilir.
- [ ] Canlı Netlify adresi Supabase URL Configuration listesine eklenir.
- [ ] Yerel geliştirme için `http://localhost:8899/**` izinli redirect listesine eklenir.
- [ ] Google OAuth Client Secret yalnızca Supabase provider ayarında tutulur.

## 6. Render — TTS

- [ ] `GOOGLE_TTS_KEY`
- [ ] `CINOCODE_ALLOWED_ORIGINS` — canlı Netlify origin'i

`PORT` elle eklenmez; Render çalışma zamanında sağlar.

## 7. Release doğrulaması

- [ ] `auth-config` gerçek yapılandırmayı doğru raporlar.
- [ ] Supabase kullanıcı token'ı ile sohbet ve görsel çağrısı çalışır.
- [ ] Turnstile ile guest session alınır.
- [ ] Anonim ve giriş yapmış kullanıcı günlük kotaları ayrı çalışır.
- [ ] En az bir sohbet ve bir görsel sağlayıcısı canlı smoke testini geçer.
- [ ] TTS canlı origin'den çalışır.
- [ ] Environment değişikliklerinden sonra kontrollü tek deploy yapılır.

Environment değişikliği tek başına mevcut deploy'u güncellemez. Push, merge ve
deploy yalnızca release sahibinin açık onayıyla yapılır.
