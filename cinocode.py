"""
cinocode.py — CinoCode Python API Wrapper
Kullanım: from cinocode import CinoCode
"""

import requests
import json
import sys

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "qwen2.5"

class CinoCode:
    """
    CinoCode'u Python kodundan kullanmak için wrapper.

    Örnek:
        ai = CinoCode()
        cevap = ai.sor("Python'da decorator nedir?")
        print(cevap)
    """

    def __init__(self, model=DEFAULT_MODEL, sistem_promptu=None):
        self.model = model
        self.gecmis = []  # Konuşma geçmişi
        self.sistem = sistem_promptu or (
            "Sen CinoCode adında Türkçe konuşan, yazılım geliştirme uzmanı "
            "bir yapay zeka asistanısın. Samimi ve teknik konularda yardımcı ol."
        )

    def sor(self, mesaj: str, stream=False) -> str:
        """Tek seferlik soru sor (geçmişi hatırlamaz)"""
        return self._istek([{"role": "user", "content": mesaj}], stream)

    def sohbet(self, mesaj: str, stream=True) -> str:
        """Geçmişi hatırlayan sohbet modu"""
        self.gecmis.append({"role": "user", "content": mesaj})
        cevap = self._istek(self.gecmis, stream)
        self.gecmis.append({"role": "assistant", "content": cevap})
        return cevap

    def gecmisi_temizle(self):
        """Sohbet geçmişini sıfırla"""
        self.gecmis = []
        print("🗑 Geçmiş temizlendi.")

    def _istek(self, mesajlar, stream=False) -> str:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.sistem},
                *mesajlar
            ],
            "stream": stream,
            "keep_alive": "1h",
            "options": {"temperature": 0.7}
        }

        try:
            res = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json=payload,
                stream=stream,
                timeout=120
            )
            res.raise_for_status()

            if stream:
                # Stream modda kelime kelime yazdır
                tam_cevap = ""
                for line in res.iter_lines():
                    if line:
                        try:
                            veri = json.loads(line)
                            parca = veri.get("message", {}).get("content", "")
                            print(parca, end="", flush=True)
                            tam_cevap += parca
                        except json.JSONDecodeError:
                            pass
                print()  # Son satır boşluğu
                return tam_cevap
            else:
                return res.json()["message"]["content"]

        except requests.exceptions.ConnectionError:
            hata = "❌ Ollama'ya bağlanılamadı! 'ollama run qwen2.5' çalışıyor mu?"
            print(hata)
            return hata
        except Exception as e:
            hata = f"❌ Hata: {e}"
            print(hata)
            return hata


# ─────────────────────────────────────────
# HAZIR KULLANIM ÖRNEKLERİ
# ─────────────────────────────────────────

def ornek_1_tek_soru():
    """Tek seferlik basit soru"""
    print("=" * 50)
    print("ÖRNEK 1: Tek seferlik soru")
    print("=" * 50)

    ai = CinoCode()
    cevap = ai.sor("Python'da list comprehension nedir? Kısa açıkla.")
    print(cevap)


def ornek_2_sohbet():
    """Geçmişi hatırlayan sohbet"""
    print("\n" + "=" * 50)
    print("ÖRNEK 2: Bağlamlı sohbet (geçmişi hatırlar)")
    print("=" * 50)

    ai = CinoCode()
    print("Sen: Python'da for döngüsü nasıl çalışır?")
    ai.sohbet("Python'da for döngüsü nasıl çalışır?")

    print("\nSen: Bunu bir örnekle göster")
    ai.sohbet("Bunu bir örnekle göster")  # Önceki soruyu hatırlıyor!


def ornek_3_kod_analizi():
    """Kod inceleme — kendi projelerinde kullan"""
    print("\n" + "=" * 50)
    print("ÖRNEK 3: Kod analizi")
    print("=" * 50)

    kod = """
def en_buyuk_bul(liste):
    en_b = liste[0]
    for eleman in liste:
        if eleman > en_b:
            en_b = eleman
    return en_b
    """

    ai = CinoCode()
    soru = f"Bu kodu incele, hataları ve iyileştirme önerilerini söyle:\n```python\n{kod}\n```"
    print(f"Analiz edilen kod:{kod}")
    print("CinoCode cevabı:")
    ai.sor(soru, stream=True)


def ornek_4_interaktif():
    """Terminal'de ChatGPT gibi sohbet"""
    print("\n" + "=" * 50)
    print("ÖRNEK 4: İnteraktif terminal sohbeti")
    print("Çıkmak için 'q' yaz")
    print("=" * 50)

    ai = CinoCode()
    while True:
        try:
            giris = input("\nSen: ").strip()
            if giris.lower() in ('q', 'quit', 'çık', 'exit'):
                print("Görüşürüz! 👋")
                break
            if not giris:
                continue
            print("\nCinoCode: ", end="")
            ai.sohbet(giris, stream=True)
        except KeyboardInterrupt:
            print("\nGörüşürüz! 👋")
            break


# ─────────────────────────────────────────
# ÇALIŞTIR
# ─────────────────────────────────────────

if __name__ == "__main__":
    print("🤖 CinoCode Python API — Test Modu\n")

    arg = sys.argv[1] if len(sys.argv) > 1 else "4"

    if arg == "1":
        ornek_1_tek_soru()
    elif arg == "2":
        ornek_2_sohbet()
    elif arg == "3":
        ornek_3_kod_analizi()
    elif arg == "4":
        ornek_4_interaktif()
    else:
        print("Kullanım: python cinocode.py [1|2|3|4]")
        print("  1 = Tek soru")
        print("  2 = Bağlamlı sohbet")
        print("  3 = Kod analizi")
        print("  4 = İnteraktif mod (varsayılan)")
