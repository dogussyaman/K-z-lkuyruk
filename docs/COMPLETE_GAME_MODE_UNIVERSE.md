# Kızılkuyruk — Complete Game Mode Universe

Kızılkuyruk artık tek bir quiz varyasyonu değil; aynı oda, profil, arkadaşlık, soru bankası ve realtime altyapısını paylaşan dokuz farklı parti oyunu stilini barındırır.

## Oynanabilir modlar

- **Klasik Blöf** — standart bilgi + blöf dengesi.
- **Hayatta Kalma** — 3 can, yanlışta can kaybı ve eliminasyon.
- **Herkes Şüpheli** — başarılı blöfçüyü tahmin etmeye dayalı sosyal çıkarım.
- **Fırtına Turu** — 7 saniye, ilk 3 saniyede doğru cevap hız bonusu.
- **Takım Savaşı** — A/B takımları, otomatik dengeleme, dost tuzağı puansız, saldırı yetenekleri rakibe özel.
- **Gizli Görevler** — oyuncuya özel gizli hedefler ve görev bonusları.
- **Çifte Tuzak** — oyuncunun normal blöfüne ek server-owned gölge tuzak.
- **Altın Soru** — her üçüncü turda x3 doğru cevap puanı.
- **Dedektif Tilki** — dönüşümlü dedektif rolü ve başarılı blöfçüyü teşhis bonusu.

## Tema sözleşmesi

Her mod `features/game/themes` altında kendi accent, secondary accent, background, surface, glow, hero emoji, atmosfer tipi ve ekran başlıklarını tanımlar. Ortak `Screen` bileşeni aktif odanın modunu okuyup lobby, soru, bekleme, sonuç ve skor ekranlarının arka planını otomatik olarak o moda taşır.

## Server authority

Puanlama, minimum oyuncu doğrulaması, Team Battle takım kuralları, offensive ability hedefleri, altın tur çarpanı, gizli görev bonusları, dedektif seçimi ve Double Trap gölge tuzakları Supabase tarafında otoriterdir. Client yalnızca görünümü ve kullanıcı etkileşimini yönetir.

## Migration drift notu

Production Supabase migration history eski repo migration dosyalarının tamamını birebir taşımıyor. Bu nedenle history repair zorlanmadı. Bunun yerine final `20261118*` migration dosyaları repo replay sırasının sonuna yerleştirildi; production şeması da aynı nihai fonksiyon/constraint davranışlarına getirildi. Gelecekte history repair yapılacaksa ayrı ve kontrollü bir bakım çalışması olarak ele alınmalıdır.
