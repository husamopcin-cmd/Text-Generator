"""
ders_botu.py — CinoCode Ders Notu Botu
PDF veya TXT notlarını yükle, CinoCode sadece o notlara göre cevap versin.

Kurulum (pip install gerekli):
    pip install requests pymupdf

Kullanım:
    python ders_botu.py notlar.pdf
    python ders_botu.py notlar.txt
"""

import sys
import os
import json
import requests

OLLAMA_URL  = "http://localhost:11434"
DEFAULT_MODEL = "qwen2.5"
MAX_CHARS   = 12000  # Modelin context limitine göre ayarla


# ─────────────────────────────────────────
# DOSYA OKUMA
# ─────────────────────────────────────────

def txt_oku(yol: str) -> str:
    with open(yol, encoding="utf-8", errors="ignore") as f:
        return f.read()


def pdf_oku(yol: str) -> str:
    try:
        import fitz  # pymupdf
    except ImportError:
        print("❌ PyMuPDF yüklü değil! Şu komutu çalıştır:")
        print("   pip install pymupdf")
        sys.exit(1)

    doc = fitz.open(yol)
    metin = ""
    for sayfa in doc:
        metin += sayfa.get_text()
    doc.close()
    return metin


def dosya_oku(yol: str) -> str:
    if not os.path.exists(yol):
        print(f"❌ Dosya bulunamadı: {yol}")
        sys.exit(1)

    ext = yol.lower().split(".")[-1]
    if ext == "pdf":
        print(f"📄 PDF okunuyor: {yol}")
        metin = pdf_oku(yol)
    elif ext in ("txt", "md"):
        print(f"📝 Metin dosyası okunuyor: {yol}")
        metin = txt_oku(yol)
    else:
        print(f"❌ Desteklenmeyen format: .{ext} (sadece .pdf veya .txt)")
        sys.exit(1)

    if len(metin) > MAX_CHARS:
        print(f"⚠️  Dosya çok büyük ({len(metin)} karakter), ilk {MAX_CHARS} karakter alınıyor.")
        metin = metin[:MAX_CHARS]

    print(f"✅ {len(metin)} karakter yüklendi.\n")
    return metin


# ─────────────────────────────────────────
# OLLAMA İSTEĞİ
# ─────────────────────────────────────────

def cinocode_sor(sistem_promptu: str, gecmis: list, stream=True) -> str:
    payload = {
        "model": DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": sistem_promptu},
            *gecmis
        ],
        "stream": stream,
        "keep_alive": "1h",
        "options": {"temperature": 0.3}  # Düşük temp = notlara sadık kalır
    }

    try:
        res = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            stream=stream,
            timeout=180
        )
        res.raise_for_status()

        tam = ""
        for line in res.iter_lines():
            if line:
                try:
                    veri = json.loads(line)
                    parca = veri.get("message", {}).get("content", "")
                    print(parca, end="", flush=True)
                    tam += parca
                except json.JSONDecodeError:
                    pass
        print()
        return tam

    except requests.exceptions.ConnectionError:
        print("❌ Ollama kapalı! 'ollama run qwen2.5' çalıştır önce.")
        return ""


# ─────────────────────────────────────────
# DEMO MODU (dosya olmadan test)
# ─────────────────────────────────────────

DEMO_NOT = """
CMPE 382 - İşletim Sistemleri Ders Notları

SANAL BELLEK (Virtual Memory):
- Sanal bellek, programların fiziksel RAM'den daha fazla bellek kullanabilmesini sağlar.
- Her işlem kendi sanal adres alanını görür, fiziksel adresi işletim sistemi yönetir.
- Page (sayfa): Sanal belleğin sabit boyutlu bloklarıdır (genellikle 4KB).
- Page Fault: İşlem erişmek istediği sayfa RAM'de yoksa oluşur, OS diski okur.
- TLB (Translation Lookaside Buffer): Sanal→Fiziksel adres çevirisi için önbellek.

DISK ZAMANLAMA ALGORİTMALARI:
- FCFS (First Come First Served): Gelen sırayla işler, basit ama verimsiz.
- SSTF (Shortest Seek Time First): En yakın isteği önce işler, starvation riski var.
- SCAN (Elevator): Disk kafası bir yöne gider, döner, elevator gibi çalışır.
- C-SCAN: Sadece bir yönde gider, sona gelince başa döner, daha adil.

SENKRONIZASYON:
- Race Condition: İki işlem aynı veriye aynı anda erişince tutarsızlık olur.
- Critical Section: Aynı anda tek işlemin girebileceği kod bölgesi.
- Mutex: Bir kaynağa aynı anda tek erişim garantisi verir.
- Semaphore: Sayaç tabanlı senkronizasyon, birden fazla erişime izin verebilir.
- Deadlock: İki işlem birbirini bekleyip kilitlenirse oluşur.
"""


# ─────────────────────────────────────────
# ANA PROGRAM
# ─────────────────────────────────────────

def main():
    print("=" * 55)
    print("📚 CinoCode Ders Notu Botu")
    print("=" * 55)

    # Dosya argümanı
    if len(sys.argv) > 1:
        dosya_yolu = sys.argv[1]
        not_metni = dosya_oku(dosya_yolu)
        dosya_adi = os.path.basename(dosya_yolu)
    else:
        print("📌 Demo modu — gerçek dosya için: python ders_botu.py dosya.pdf\n")
        not_metni = DEMO_NOT
        dosya_adi = "CMPE382_demo_notlar"

    # Sistem promptu — "sadece notlara göre cevap ver" talimatı
    sistem = f"""Sen bir ders asistanısın. Aşağıdaki ders notlarını analiz et ve öğrencinin sorularını YALNIZCA bu notlardaki bilgilere dayanarak cevapla.

Eğer soru notlarda yoksa: "Bu konu notlarında yer almıyor, hocana danışmanı öneririm." de.
Türkçe cevap ver, kısa ve net ol, örnekler kullan.

--- DERS NOTLARI ({dosya_adi}) ---
{not_metni}
--- NOTLAR BİTTİ ---"""

    print(f"🎯 Konu: {dosya_adi}")
    print("💬 Sorularını sor! (çıkmak için 'q')\n")
    print("-" * 55)

    gecmis = []

    while True:
        try:
            soru = input("\n📖 Sorum: ").strip()
            if soru.lower() in ('q', 'quit', 'çık', 'exit'):
                print("\n📚 Bol şans sınavında!")
                break
            if not soru:
                continue

            gecmis.append({"role": "user", "content": soru})
            print("\n🤖 CinoCode: ", end="")
            cevap = cinocode_sor(sistem, gecmis)
            gecmis.append({"role": "assistant", "content": cevap})

            # Geçmişi 10 mesajla sınırla (context limit)
            if len(gecmis) > 20:
                gecmis = gecmis[-20:]

        except KeyboardInterrupt:
            print("\n\n📚 Bol şans sınavında!")
            break


if __name__ == "__main__":
    main()
