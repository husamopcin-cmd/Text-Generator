import random

# Yapay zekamızın 'Eğitim Verisi' (Bunu ne kadar büyütürsen o kadar iyi konuşur)
egitim_metni = """
selam kanka naber nasılsın bence de öyle kanka
naber nasıl gidiyor hayat nasıl gidiyor projeler nasıl gidiyor
selam millet bugün hava çok güzel kanka hava çok güzel bence de
yapay zeka öğrenmek çok eğlenceli kanka yazılım çok eğlenceli
"""

def model_egit(metin):
    kelimeler = metin.lower().split()
    zincir = {}
    
    # Kelime çiftlerini dönerek olasılık haritası çıkarıyoruz
    for i in range(len(kelimeler) - 1):
        mevcut_kelime = kelimeler[i]
        sonraki_kelime = kelimeler[i+1]
        
        if mevcut_kelime not in zincir:
            zincir[mevcut_kelime] = []
        zincir[mevcut_kelime].append(sonraki_kelime)
        
    return zincir

def cumle_uret(zincir, baslangic_kelimesi, uzunluk=7):
    kelime = baslangic_kelimesi.lower()
    if kelime not in zincir:
        return f"Bu kelimeyi ('{kelime}') henüz öğrenmedim knk!"
        
    cumle = [kelime]
    for _ in range(uzunluk - 1):
        if kelime in zincir:
            # Bir sonraki kelimeyi arkadaki istatistik listesinden rastgele seçiyoruz
            sonraki = random.choice(zincir[kelime])
            cumle.append(sonraki)
            kelime = sonraki # Ufak bir hata düzeltildi
        else:
            break
            
    return " ".join(cumle)

# Modeli eğit ve test et
hafiza = model_egit(egitim_metni)

# Test ediyoruz: "selam" kelimesiyle başlayan 6 kelimelik bir cümle üret
print("Yapay Zekanın Cümlesi:", cumle_uret(hafiza, baslangic_kelimesi="selam", uzunluk=6))
