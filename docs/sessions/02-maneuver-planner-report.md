# Oturum 2 — Maneuver planner pass raporu

Tarih: 2026-09-06. Durum: **MANEUVER PLANNER PASS COMPLETE; SESSION 2 COMPLETE DEĞİL.**

## Desteklenen kapsam

- Aynı yönlü ve aynı düzlemli, dairesele yakın başlangıçtan daha yüksek/düşük dairesel yörünge transferi.
- Hedefin planlama anındaki fazını hesaba katan bekleme ve varış zamanı.
- Aynı yörüngede alt phasing elipsleriyle kısa yakın-rendezvous state hedefi.
- Geçerli ve ayrı çözümler arasından düşük Δv `ECONOMIC`, ara ödünleşim `BALANCED`, kısa ETA `FAST` seçimi.
- Sürüm 1 sunucu sözleşmesi: Δv, yakıt, bekleme/transfer/ETA, burn dizisi, final state/kütle, kalan Δv ve doğrulama hataları.

Genel Lambert, düzlem değişimi, ters yön, eliptik hedef, n-cisim, atmosfer ve gezegenler arası hedefler desteklenmez.

## Finite-burn doğrulaması

Her kalkış ve varış yanması mevcut kimyasal itki/yakıt/kütle yolu ile en fazla `1/60 s` adımda RK4 üzerinden tekrar yürütülür. Coast mevcut universal-variable Kepler propagatorünü kullanır. Varış kabul sınırları konum ve yarıçap için 10 km, hız için 5 m/s'dir. Başarısız seçenek aday listesinden çıkar ve makine-okunur ret sebebi döner. Planlama salt-okunurdur; world state değişmez.

Temsili `orbit_maneuver` senaryosu: 400 km dairesel LEO'dan 800 km dairesel yörüngeye, hedef 0.5 rad ileride.

| Aday     |   Toplam Δv |       Yakıt |        ETA |   Transfer |    Kalan Δv | Konum hatası |
| -------- | ----------: | ----------: | ---------: | ---------: | ----------: | -----------: |
| ECONOMIC | 216.668 m/s |  533.712 kg | 6902.493 s | 2953.377 s | 686.115 m/s |     60.069 m |
| BALANCED | 317.947 m/s |  770.830 kg | 6221.581 s | 2250.158 s | 584.836 m/s |     40.931 m |
| FAST     | 616.529 m/s | 1426.952 kg | 5698.831 s | 1569.295 s | 286.254 m/s |    497.242 m |

## Performans ve doğrulama

Temsili senaryoda aynı Node sürecinde çekirdek soğuk koşu 560.109 ms, 12 sıcak koşunun medyanı 445.318 ms ve p95'i 465.497 ms'dir. Yeniden kullanılan server worker ana tick'i bloke etmez; worker'ın ilk TypeScript yükleme maliyeti sunucu açılışında önden başlar.

Çalışan yerel sunucuya gerçek WebSocket `plan_maneuver` isteği üç adayı 455.474 ms'de döndürdü. İstemci `127.0.0.1:5173`, authority `127.0.0.1:8787` üzerinde açık bırakıldı.

- Static/type/lint: `node scripts/check.mjs` — PASS.
- Unit/integration: `node node_modules/vitest/vitest.mjs run` — 8 dosya, 42/42 PASS. Aynı düzlem yüksek/düşük transfer, phasing/near-rendezvous, finite-burn varış, aday sırası/ayrımı, determinizm, yetersiz yakıt, geçersiz hedef/kütle, salt-okunur dispatch ve worker olay-döngüsü testleri dahildir.
- Production build: `node scripts/build.mjs` — PASS; 144 modül dönüştürüldü.
- Görsel/screenshot testi çalıştırılmadı; bu geçiş render veya UI değiştirmedi.

## Kalan Oturum 2 işi

Manevra seçim arayüzü, yörünge gösterimi, otoriter yürütme/iptal akışı, analitik coast ↔ fixed-step geçiş kaydı, zaman damgalı uzun transfer, `low_fuel` ve `orbit_maneuver` sahneleri, HUD yakıt/kütle sunumu ve nihai manuel/görsel kabul.
