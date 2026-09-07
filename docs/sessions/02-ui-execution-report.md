# Oturum 2 — UI / execution pass raporu

Tarih: 2026-09-07. Durum: **UI / EXECUTION PASS UYGULANDI; SESSION 2 COMPLETE DEĞİL.**

## Oyuncu akışı ve arayüz

Oyuncu manevra bilgisayarını açar; 800 km servis halkası, 450 km yakın denetim yörüngesi veya aynı-yörünge faz işaretini seçer. Sunucu adayları hesaplar. Geçerli `ECONOMIC`, `BALANCED`, `FAST` kartları ETA, transfer süresi, Δv, yakıt ve kalan Δv ile karşılaştırılır. Geçersiz seçenekler makine ret sebebinin Türkçe açıklamasını gösterir. Seçilen plan yürütülür veya etkin yanma/coast açık bir düğmeyle iptal edilir.

HUD otoriter snapshot'tan yakıt kg/yüzde, mevcut Δv, seçili plan tüketimi/rezervi ve manevra durumunu gösterir. Rezerv 100 m/s altındaysa güvenli uyarı görünür. `low_fuel` sahnesi 80 kg yakıtla başlar; 800 km hedefi için aday üretmez ve gerçek kapasite reddini gösterir.

## Otoriter yürütme

İstemci plan sonucunu geri göndermez; yalnızca sunucunun bağlantıya bağladığı plan kimliği ve aday tipini gönderir. Plan kimliği bir kez tüketilir. Durumlar `EXECUTING_BURN`, `COASTING`, `ARRIVAL_BURN`, `COMPLETE`, `CANCELLED`, `FAILED` olarak snapshot'ta yayınlanır. Manuel uçuş girdisi etkin manevrada kesilir. İptal o ana kadarki gerçek state ve yakıtı korur.

Uzun coast, başlangıç zaman damgası + ECI state/kütle ankrajı + sonraki olay zamanıyla temsil edilir ve Kepler propagator ile doğrudan güncellenir. Yanma adımları mevcut 60 Hz kuvvet/yakıt/kütle yolundadır. Unit test, iki yanmalı transferi timestamp coast üzerinden tamamlayıp planlanan final state için 10 km/5 m/s sınırını doğrular.

## Yörünge görselleştirmesi

Far render pass'te mevcut yörünge, hedef yörünge, seçili transfer hattı, ilk yanma ve varış noktaları toplam dört ek draw call ile çizilir. ECI noktaları her frame mevcut kamera-bağıl render frame'e ve kilometre ölçeğine çevrilir; büyük koordinatlar doğrudan GPU Float32'ye verilmez.

Yakın üçüncü şahıs kamerada tam yörünge çizgilerinin kadraj dışında kalabildiği son görsel kontrolde görüldü. Manevra paneline aynı plan verisini kullanan küçük bir yörünge haritası eklendi. Harita mevcut ve hedef yörüngeyi, transfer yayını, kalkış yanmasını ve varış işaretini her kamera açısında okunur tutar.

## Doğrulama ve kalan kabul

2026-09-07 kapanış doğrulaması:

- Statik/type kontrolü: `pnpm check` geçti.
- Unit ve entegrasyon: 9 dosyada 46/46 Vitest testi geçti. Otoriter plan yürütme, timestamp coast, iptal, yinelenen yürütme reddi, düşük yakıt ve protokol güven sınırı kapsandı.
- Production build: `pnpm build` geçti; 146 modül üretildi.
- Hedefli journey: `orbit_maneuver` ve `low_fuel` senaryolarındaki 2/2 Playwright assertion geçti. Windows'ta test webServer temizliği assertion'lar bittikten sonra kapanmadığı için runner elle sonlandırıldı; bu bir test sonucu başarısızlığı değildir, harness temizleme açığıdır.
- Final görsel test: 1/1 assertion geçti; aynı Windows cleanup davranışı nedeniyle runner sonuçtan sonra elle sonlandırıldı.
- Görsel inceleme: `maneuver-selection.png`, `maneuver-active.png` ve `low-fuel.png` 1920×1080 Chrome/WebGL2 çıktıları ayrı ayrı incelendi. Kartlar, HUD, mini yörünge haritası, aktif yanma/iptal ve kapasiteye bağlı düşük yakıt retleri okunur. İlk kontrolde bulunan rota görünürlüğü sorunu mini haritayla düzeltildi ve yalnızca bu engelleyici kusur için tekrar çekim yapıldı. Oturum 1 baseline'ları değiştirilmedi.

Kısa görsel smoke ölçümü Chrome, WebGL2, ANGLE/D3D11 ve Intel UHD üzerinde 1920×1080 viewport ile alındı. Baseline 15 draw call / 54.454 üçgen; plan seçimi 19 draw call / 54.454 üçgen; aktif yürütme 27 draw call / 54.582 üçgen üretti. Kısa örnekte seçim ortalaması 130,68 ms ve p95 145,90 ms; aktif yürütme ortalaması 99,16 ms ve p95 125,00 ms ölçüldü. Bunlar görsel smoke telemetrisidir; kararlı benchmark veya GTX 1060/1660 kabul ölçümü değildir. Manevra geometrisi seçime bağlı güncellenir, panel plan durumu 4 Hz'de örneklenir ve planner isteği UI'yi bloklamaz.

Kod ve otomasyon kapsamında bu geçişi engelleyen açık hata kalmadı. İnsan tarafından plan okunabilirliği ve plan/yakın-kumanda geçişi playtest'i ile hedef GTX 1060/1660 sınıfı donanımda kararlı performans kabulü doğrulanmadı. Windows Playwright webServer cleanup açığı takip edilmelidir.

Final Session 2 kapanışına giriş koşulu karşılandı: oynanabilir akış, otoriter güven sınırı, senaryolar, görsel kanıt ve otomatik kontroller hazırdır. Session 2'nin tamamlandı ilan edilmesi için kullanıcının öznel playtest'i ve referans donanım performans kararı kalır. Görev, ekonomi ve Oturum 3 sistemleri eklenmedi.
