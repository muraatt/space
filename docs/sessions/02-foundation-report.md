# Oturum 2 — Foundation pass raporu

Tarih: 2026-09-06. Durum: **FOUNDATION PASS COMPLETE; SESSION 2 COMPLETE DEĞİL.** Kullanıcı Oturum 1'i tamamlanmış kabul ederek bu geçişi başlattı. Repository'de `docs/sessions/01-report.md` bulunmadığı için önceki kabul kanıtı bu raporda yeniden üretilmedi.

## Uygulanan fizik

- ECI `OrbitalState`, geçerlilik denetimi, özgül yörünge enerjisi ve özgül açısal momentum yardımcıları.
- Güçsüz iki-cisim coast için universal-variable Kepler propagasyonu.
- Kuru gövde, modül, kargo, mühimmat ve yakıt bileşenleri; desteklenmeyen oynanış bileşenleri başlangıçta sıfır.
- Toplam kütle bileşenlerden türetilir; negatif, NaN/Infinity ve toplam-bileşen uyumsuzluğu reddedilir.
- Kimyasal `Isp`, standart yerçekimi, kuvvete bağlı yakıt debisi ve Tsiolkovsky mevcut Δv hesabı.
- Mevcut fixed-step yolunda gemi quaternion yönelimli, gerçek kuvvetli sonlu yanma. Komut sonu tüketimi bitirir; son kısmi adım mevcut yakıtla sınırlandırılır; sıfır yakıt itkiyi keser.
- İstemci hâlâ yalnızca kontrol niyeti gönderir. Kütle/yakıt/konum/hız istemci tarafından yazılamaz.

## Sayısal sonuçlar

Standart başlangıç: 400 km dairesel LEO, Earth two-body μ; JS Float64. Kepler enerji/momentum ölçümü 6 saat, karşılaştırma 600 saniye; RK4 referansı 1/60 s adım.

| Ölçüm                         |                  Sonuç |                Hedef | Durum   |
| ----------------------------- | ---------------------: | -------------------: | ------- |
| Bağıl özgül enerji sapması    | 2.9140065252087843e-15 |                ≤1e-6 | PASS    |
| Bağıl açısal momentum sapması | 1.3210173573224763e-15 |                ≤1e-6 | PASS    |
| 10 dk Kepler–RK4 konum farkı  | 7.014040046841923e-8 m |                ≤10 m | PASS    |
| Başlangıç mevcut Δv           |   902.783166658962 m/s |                Bilgi | Kayıtlı |
| 24 kN, 320 s Isp, 1 s yakıt   |   7.647871597334462 kg |        Analitik debi | PASS    |
| Yanma sonrası toplam kütle    |   7992.352128402666 kg | 8000 kg eksi tüketim | PASS    |

Test referansları: roket denklemi doğrudan formülden; yakıt debisi `F/(Isp·g0)` bağımsız beklentiden; 10 dakika konum farkı ayrı RK4 integratörüyle. Bit düzeyi platformlar arası eşitlik iddia edilmez.

## Doğrulama

- Static/type/lint: `node scripts/check.mjs` — PASS.
- Unit/integration: `node node_modules/vitest/vitest.mjs run` — 6 dosya, 32/32 PASS. Buna mass, orbit, finite-burn ve dört authoritative server dispatch testi dahildir.
- Production build: `node scripts/build.mjs` — PASS; 142 modül dönüştürüldü.
- Tarayıcı entegrasyonu: forged authoritative alanların reddi ve gerçek klavye ile thrust/rotation/camera akışı — 2/2 PASS. Testler tamamlandıktan sonra Windows'ta Playwright web-server cleanup süreci kapanmadığı için koşucu elle sonlandırıldı; test assertion hatası yoktu.
- Yerel runtime yeni kodla yeniden başlatıldı: authority `127.0.0.1:8787/health` HTTP 200, istemci `127.0.0.1:5173` HTTP 200.
- Görsel test/screenshot çalıştırılmadı; talep gereği Session 1 görselleri değişmedi.

## Kalan Oturum 2 işi

Manevra aday üretimi/çözücü, hedef yörünge ve seçim UI, süre/maliyet/risk sunumu, analitik coast ↔ fixed-step oyun modu geçişi, zaman damgalı/soyut uzun transfer durumu, `low_fuel` ve manevra test sahneleri. Mevcut HUD yardım metninin kütleyi sabit göstermesi de planner/UI geçişinde güncellenecektir. Rendezvous oynanışı bu foundation geçişinde yoktur. Oturum 3+ sistemleri eklenmedi.

Engel: yok. Manevra-planner geçişi için sayısal foundation hazırdır; Session 2 henüz tamamlanmış sayılmaz.
