# ORBITAL HUD / UI mimarisi

Tarih: 2026-09-08. Kapsam yalnız mevcut Oturum 1–4 sistemlerinin istemci sunumudur; oynanış, fizik, ekonomi ve savaş dengesi değiştirilmedi.

## Üç katman

Kalıcı uçuş HUD'ı uzay görünümünü açık bırakır: sol üstte authoritative state kullanan canlı 3B ECI yörünge haritası, sağda dar sayısal telemetri ve merkezde mevcut dünya göstergeleri bulunur. Alt soldaki OPS çekmecesi kapalı başlar; sözleşme, hedef, navigasyon ve var olan sistemlere kısa yolları gerektiğinde gösterir. Manevra, sözleşmeler, hangar/servis ve ateş kontrolü ortak tam ekran sistem yüzeyidir; yalnız biri açık kalır ve sağ üst `[X]`/Escape uçuşa döner.

Yörünge haritası snapshot konum/hızından mevcut osculating yörüngeyi çıkarır. Oyuncu işareti live ECI konumuyla hareket eder. Görev veya seçili temas hedefi; planner sonucu hedef yörüngesi ve transfer yolu üretir. Ayrı saat, fizik integrasyonu veya istemci otoritesi yoktur.

Sağ şerit FLIGHT (ALT, VEL, RAD, ACC), ORBIT (APO, PER, INC, PERIOD), SHIP (MASS, FUEL, ΔV, THR), ATTITUDE (PITCH, YAW, ROLL) gruplarını sabit tutar. Seçili hedefte RANGE, REL-V, CLOSE, LOCK; manevrada STATE, NEXT, BURN; savaşta LASER, HEAT, MISS, CM bağlamsal olarak eklenir.

## Odak ve geçiş

Bir sistem açılırken basılı uçuş girdileri bırakılır. `[X]` ve Escape sistemi kapatır, canvas'a odak verir ve doğrudan uçuşu etkinleştirir. OPS aç/kapa kalıcı bir örtü oluşturmaz. Bağlantı/imha bildirimleri sistem yüzeylerinin üzerinde görünür. Önceki kumanda kilidi, eski socket ve Space tekrar korumaları korunmuştur.

## Doğrulama

Hedefli testlerde harita işaretinin authoritative state ile hareketi, sabit/bağlamsal telemetri, OPS aç/kapa, dört tam ekran sistemin viewport'u kaplaması, görünür kapanış ve her kapanıştan sonra gerçek W girdisi doğrulandı. Son doğrulama sonuçları:

- `node scripts/check.mjs`: geçti.
- `node node_modules/vitest/vitest.mjs run`: 16 dosya, 85/85 test geçti (8,13 sn).
- `node scripts/build.mjs`: geçti; 157 modül, CSS 33,66 kB (gzip 8,33), JS 1.225,32 kB (gzip 347,29).
- Playwright `journey|authority`: 23/23 geçti (3,3 dk, tek worker, izole loopback test dünyası).
- Son yakıt telemetrisi düzeltmesi sonrası `low_fuel`: 1/1 geçti.
- Playwright görsel kanıt yolculuğu: 1/1 geçti ve dört final kare üretti.

Final görseller `artifacts/session-04/ui-architecture` altında normal HUD, açık OPS, manevra sistemi ve hedef/savaş HUD'ı olarak dört karede tutulur. 1920×1080, Chromium, WebGL2 yazılım test ortamında tek inceleme yapıldı. Uzay görünümü baskın kaldı; harita ve OPS uçuş yüzeyini kapatmadı; manevra sistemi viewport içine sığdı ve `[X]` görünür kaldı; hedef/savaş telemetrisi şeride taşmadan yerleşti. İlk karede yakıt kütlesi ile yüzdesinin dar alanda kötü satır bölünmesi engelleyici okunabilirlik kusuru sayılarak `FUEL` ve `FUEL%` alanlarına ayrıldı; ilgili final kareleri yenilenip yeniden incelendi.

## Kalan küçük işler

Mobil düzen, harita döndürme/zoom, son sanat cilası ve metin dilinin bütünüyle tek dile alınması kapsam dışıdır. Referans GPU ölçümü ile kullanıcının öznel okunabilirlik/oyun hissi kararı ayrıca kalır. Orbital istasyon/docking sistemi bu geçişte başlatılmadı.
