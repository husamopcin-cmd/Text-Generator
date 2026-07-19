# Netlify / Render Environment Variables - Kurulum Checklist

> Bu dosya yalnızca değişken adlarını ve kurulum adımlarını içerir. Gerçek anahtar içermez.
> Gerçek değerleri repoya, commit'e veya ZIP paketine koyma. Yerel `.env` dosyası Git tarafından yok sayılır.

## Güvenli Sıra

1. Daha önce paylaşılan veya ZIP'e giren eski anahtarları ilgili servis panelinden iptal et.
2. Her servis için yeni bir anahtar oluştur.
3. Sohbet ve görsel anahtarlarını **Netlify + yerel `.env`** içine yaz.
4. `GOOGLE_TTS_KEY` değerini **Render + yerel `.env`** içine yaz.
5. Aynı anahtarı ihtiyaç duymayan platformlara ekleme.

## 1. Netlify - Sohbet ve Görsel Sağlayıcıları

**Yol:** Netlify -> Project configuration -> Environment variables -> Add a variable

Netlify Functions tarafından gerçekten okunan değişkenler:

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
- [ ] `RUNWARE_API_KEY`
- [ ] `FAL_KEY`
- [ ] `REPLICATE_API_TOKEN`
- [ ] `STABILITY_API_KEY`
- [ ] `HUGGINGFACE_API_KEY`
- [ ] `POLLINATIONS_API_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_PUBLISHABLE_KEY`

Kurulum notları:

- Hepsini eklemek zorunda değilsin. En az bir sohbet ve bir görsel sağlayıcısı yeterlidir.
- Hızlı başlangıç için sohbet tarafında `GROQ_API_KEY`, `GEMINI_API_KEY` veya `OPENAI_API_KEY` kullanılabilir.
- Görsel tarafında `RUNWARE_API_KEY`, `FAL_KEY` veya `STABILITY_API_KEY` kullanılabilir.
- Arayüz izin veriyorsa kapsamı **Functions**, deploy context'i **Production** olarak seç.
- Arayüz izin veriyorsa anahtarları **Contains secret values** olarak işaretle.
- Eksik sağlayıcılar fallback zincirinden çıkarılır; en az bir çalışan sağlayıcı bulunmalıdır.
- `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY`, e-posta/şifre ve Google giriş ekranını etkinleştirir.
- Supabase publishable key tarayıcı istemcileri için tasarlanmıştır; `service_role` anahtarını kesinlikle Netlify'a bu adla ekleme veya frontend'e açma.
- Supabase Dashboard -> Authentication -> Providers bölümünde Email ve Google sağlayıcılarını etkinleştir.
- Google Cloud tarafındaki OAuth Client Secret yalnızca Supabase Google provider ayarına girilir; CinoCode `.env` dosyasına veya frontend'e yazılmaz.
- Supabase URL Configuration içinde canlı siteyi ve yerel geliştirme için `http://localhost:8899/**` adresini izinli redirect listesine ekle.

## 2. Render - TTS Sunucusu

**Yol:** Render -> TTS servisi (`server.py`) -> Environment -> Add Environment Variable

- [ ] `GOOGLE_TTS_KEY`
- [ ] `CINOCODE_ALLOWED_ORIGINS` - Netlify site origin'i; örnek: `https://poetic-sfogliatella-4a9202.netlify.app`

Kurulum notları:

- `CINOCODE_ALLOWED_ORIGINS` gizli değildir; TTS çağrısına izin verilecek frontend origin'lerini virgülle ayırır.
- `PORT` değerini elle ekleme; Render web servisine çalışma zamanında sağlar.
- Kaydederken **Save and deploy** veya **Save, rebuild, and deploy** seç. **Save only** seçersen değer sonraki deploy'a kadar kullanılmaz.

## 3. Yerel `.env`

- [ ] Kullandığın yeni Netlify sağlayıcı anahtarlarını yerel `.env` içinde güncelle.
- [ ] `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değerlerini yerel `.env` içine ekle.
- [ ] Google OAuth Client Secret değerini yerel `.env` içine koyma; Supabase panelinde tut.
- [ ] Yeni `GOOGLE_TTS_KEY` değerini yerel `.env` içinde güncelle.
- [ ] `.env` dosyasını silme; `netlify dev` ve yerel TTS çalıştırması bu dosyayı kullanır.
- [ ] `.env` dosyasını ZIP'e ekleme ve içeriğini sohbetlere yapıştırma.

## 4. Deploy Edilmeyen Eski Anahtarlar

Aşağıdaki değişkenleri güncel Netlify Functions ve `server.py` okumuyor. Eski değerler açığa çıktıysa ilgili servis panelinden iptal et; Netlify veya Render'a ekleme.

- [ ] `ASSEMBLYAI_API_KEY`
- [ ] `CLOUDFLARE_API_TOKEN`
- [ ] `DEEPGRAM_API_KEY`
- [ ] `ELEVENLABS_API_KEY`

## 5. Son Kontrol

- [ ] Netlify'da yeni bir deploy oluştur; environment variable değişiklikleri yeni deploy ile etkinleşir.
- [ ] Render TTS servisini yeni environment variable ile deploy et.
- [ ] Canlı sitede bir sohbet mesajı gönder.
- [ ] Canlı sitede bir görsel üret.
- [ ] TTS ses oynatımını test et.
- [ ] Başarılı testten sonra eski anahtarların iptal durumunu bir kez daha doğrula.
