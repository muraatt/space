# Test ve kanıt düzeni

Komutlar [README](../README.md)'de, gerçek sonuçlar [oturum raporunda](sessions/01-report.md). Planlanan kontrol, çalıştırılmış test veya insan onayı değildir.

## O1 otomatik test katmanları

- `pnpm check`: TypeScript strict ve ESLint. `simulation` bağımlılıkları saf kalır.
- `pnpm test:unit`: bağımsız analitik dairesel yörüngeyle RK4; bir saniyelik itki; açısal hız/quaternion normu; aynı komut dizisinin tekrarı; büyük ECI'de santimetre fark; baz/rotasyon; runtime protokol; dispatcher ownership, eski/tekrarlı sıra ve input timeout.
- `pnpm test:integration`: server dispatcher davranışları. HTTP/WS gerçek süreç sınırı ayrıca Playwright authority testlerindedir.
- `pnpm test:e2e`: ayrı 8788 authority + 5174 Vite; test credential, sahte alan/foreign owner reddi, yerel pilot devri; gerçek W/ok/fare/kamera/UI; fokus kaybında nötr girdi; salt okunur debug; kısa ekran/sahne değişimi; dört gün/gece×backend görsel testi.
- `pnpm test:visual`: sabit seed ve paused world; WebGPU ve WebGL2 için gündüz/gece, beklenen backend, çizim bütçesi, gerçek shader/canvas ve pageerror kontrolü. Sadece değişken bağlantı/RTT alanı görüntüde maskelenir.

`window.__ORBITAL__` kopya state, metrik, kamera ve frame sürelerini okur; input/teleport/reset/setState içermez. Journey'ler gerçek keyboard/mouse olaylarını kullanır. Senaryo kurulumu yalnızca ayrı test sunucusunun token isteyen HTTP reset ucudur. Normal servisin test URL'leri 404 döndürmelidir. TEST_MODE yoksa header bilinse dahi erişim olmaz. Test servisi public host'a bağlanmayı reddeder.

Görsel baseline yolu `packages/test-tools/tests/baselines/win32`. Yeni görüntü önce mevcut referansla karşılaştırılır. Beklenen art değişiminde hata alınması kabulün geçtiği anlamına gelmez. Actual/expected/diff incelenir, gerekçesi kaydedilir, ancak sonra `pnpm test:visual --update-snapshots` kullanılır. Ardından güncelleme kapalı tam test tekrar geçmelidir. İlk hatalı atmosfer ve HUD görüntüleri onaylanmış sanat hedefi sayılmaz.

## Ölçüm yöntemi

`pnpm build` ardından dev servisi kapalıyken `pnpm perf`. Script production Vite preview ve normal (TEST_MODE=0) Node sunucusunu açar; tek Chrome/Edge bağlanır. Başlangıç shader/doku yükü 60 saniye ısınmada dışlanır. 300 saniye frame aralığı örneklenir; 30 saniyede bir ilerleme raporlanır. Bütün ham frame süreleri ve örnek metrikler saklanır. Ortalama FPS = 1000 / ortalama frame ms; p50/p95/p99 sıralı frame aralıklarıdır. Bu ölçü GPU timestamp'i veya oyuncunun monitöründeki gecikme değildir: browser requestAnimationFrame aralığıdır. Sunucu tick metriği saf adım maliyetini, backlog ise zamanlayıcı birikimini gösterir; ikisi karıştırılmaz.

Raporda gerçek backend/adaptör, tarayıcı sürümü/headless, OS/CPU/RAM, viewport, DPR, süre, draw call, üçgen, RTT ve server p95/p99 bulunur. WebGPU adapterInfo cihaz adını gizleyebilir; driver/donanım envanteri ayrıca hardware.json'dadır. Tercih edilen GPU ile seçilen GPU aynı kabul edilmez. Intel UHD ölçümü RTX/GTX hedef kabulü değildir. SwiftShader/WARP/software sonucu ayrı etiketlenir.

O1 ilk ölçüm ve <=150 draw bütçesi gerekir. Final slice referans hedefleri roadmap'te. Kısa screenshot smoke FPS değerleri ısınma içerir, performans kabulünde kullanılmaz. Test sırasında başka oyun sekmesi/performans koşusu açma. Bellek/kalite/LOD, 8–16 istemci yükü, ağ kaybı/jitter ve kalıcı restore O5–6'da ölçülür. O1 `test:load` bilerek uygulanmamış hata kodu döndürür.

## Doğrudan görsel/manuel kontrol

1. Normal `pnpm dev` ile Chrome'da ilk sahneyi aç: Dünya ufku, atmosferin bant oluşturmaması, gövde/itki yönü, metin ve bağlantı.
2. Kumandayı devral; W/S ve yönler, fare sürükleme/tekerlek, C, F3, Escape ve arayüze odak davranışını dene.
3. Gündüz/gece değiştir; gece gövde ve seyir ışıklarını, shader/texture kaybı ve clipping'i incele.
4. 1920×1080 ve 1280×720 görüntülerini incele; aksiyonlar footer altında kalmasın.
5. Konsol/pageerror, sağlık ve test uçlarının kapalı durumunu kontrol et.
6. Murat ayrı olarak oyun hissi, okunurluk ve görsel yön için insan kabulü verir. Ajanın UI işletmesi ve görüntü incelemesi bu öznel onayın yerine yazılmaz.

## Kanıt dizini

`artifacts/session-01`: art-direction.png; day/night backend PNG'leri; unit-results.json; e2e-results.json; hardware.json; performance-*.json/PNG ve ham frame JSON; manual-review.md; test-results.json. Üretilmiş iz/temporary çıktı `.gitignore` ile ayrılır. Başarısız denemelerin nedeni raporda tutulur; son geçer sonuç önceki başarısızlığı gizlemez.
