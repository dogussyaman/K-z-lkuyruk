# Takım Savaşı V1 — UX + Gameplay Contract

## Hedef
Takım Savaşı, Kızılkuyruk'un ilk gerçek A/B sosyal modu. Klasik blöf motorunu korur ama oyuncu skorundan çok takım kararını öne çıkarır.

## Görsel kimlik
- A Takımı: elektrik mavisi / cyan, soğuk glow, mavi tilki bayrağı.
- B Takımı: kızıl / turuncu, sıcak glow, kızıl tilki bayrağı.
- Lobby: iki kolonlu VS arena; oyuncu kartları takım alanlarına taşınmış gibi görünür.
- Oyun: üstte sürekli A/B skor şeridi, ortada tur sayacı; kendi takımın hafif glow ile vurgulanır.
- Sonuç: kazanan takım tam genişlik zafer kartı + MVP + En İyi Blöfçü.

## Lobby davranışı
1. Team Battle 4–10 oyuncu kabul eder.
2. Host `Otomatik Dengele` ile join sırasına göre A/B dağıtabilir.
3. Host oyuncuyu A veya B'ye manuel taşıyabilir.
4. Tüm oyuncular atanmış olmalı.
5. Her takımda en az 2 oyuncu olmalı.
6. Takımlar arasındaki oyuncu farkı en fazla 1 olmalı.
7. Start CTA bu koşullar sağlanana kadar neden kapalı olduğunu açıkça söyler.

## V1 puan kuralları
- Doğru cevap: oyuncu +2, takım +2.
- Rakip oyuncu senin fake cevabını seçerse: oyuncu +1, takım +1.
- Takım arkadaşının fake cevabını seçmek takım sahibine trap puanı üretmez.
- Bireysel skor MVP ve maç içi ödüller için tutulur; maçı takım toplamı kazanır.
- Beraberlikte önce toplam doğru cevap, sonra başarılı rakip tuzağı sayısı tie-break olur.

## Ability kuralları
- Shield self-only kalır.
- Block/Penalty gibi saldırı yetenekleri yalnızca rakip takımı hedefleyebilir.
- Takım arkadaşını hedefleme hem UI'da gizlenir hem server'da reddedilir.

## Server authority
- `room_players.team_id` tek doğruluk kaynağıdır.
- `assign_team_secure`: host-only manuel takım ataması.
- `auto_balance_teams_secure`: host-only deterministic dağıtım.
- `validate_team_battle_start_secure`: start öncesi 2v2+, assignment ve denge kontrolü.
- `get_team_scores_secure`: istemci hesaplamasına güvenmeden takım toplamlarını verir.

## Uygulama sırası
1. Service interface: assignTeam / autoBalanceTeams / getTeamScores.
2. Supabase + demo adapter parity.
3. Lobby A/B arena component.
4. Start guard'ı mevcut `start_game_secure` içine bağla.
5. Enemy-only trap scoring.
6. Enemy-only offensive ability targeting.
7. Question ekranına takım skor şeridi.
8. Scoreboard + game-over takım zaferi/MVP.
9. Migration/unit tests + advisor kontrolü.

## Sonraki sosyal katman
Team Battle stabil olduktan sonra Meme Studio maç eventlerinden otomatik kart üretebilir: `Takımı Sırtladı`, `Son Saniye Kahramanı`, `Blöf Ustası`, `0'dan Geri Döndü`. GIF/reaction picker ise oyun state'ini değiştirmeyen ephemeral reaction olarak ayrı tutulmalı; böylece spam ve persistence maliyeti düşük kalır.
