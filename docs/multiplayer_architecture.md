# Multiplayer ve kalıcılık mimarisi

## Savaş güven sınırı

İstemci yalnız hedef seç/bırak, lazer ateşle, füze fırlat ve karşı tedbir kullan niyeti gönderir. Komutlarda benzersiz kimlik bulunur; istemci hit, hasar, fiyat veya sonuç gönderemez. Sunucu bölge/görev yetkisini, hedefi, menzil/görüş/atış yayını, kaynakları ve cooldown'u doğrular; hasarı ve görev ilerlemesini tekil hasar kimlikleriyle uygular. Snapshot temas, füze, kaynak, gövde, combat tag ve olay akışının otoriter kopyasını taşır.

İmha, enkaz içeriği, görev sonucu ve sigorta hesabı da aynı sınırın içindedir. Recovery komutu yalnız transaction id taşır; fiyat, replacement türü ve içerik alanları strict şema tarafından reddedilir. Sunucu claim'i tekilleştirir, kayıp aracı sahiplikten çıkarır ve yeni aktif gemi kimliğini atomik snapshot ile yayınlar.

## O1 — uygulanan temel

Girdi → [strict runtime şema](../packages/shared/src/protocol.ts) → [ownership/sequence doğrulaması](../packages/server/src/commands/dispatch.ts) → saf simulation → sunucu snapshot → renderer/DOM. Client yalnızca eksen niyetleri ve ping gönderir. Konum, hız, para veya hasar alanı kabul edilmez. Mesaj boyutu, komut sıklığı ve yavaş istemci backlog'u sınırlıdır. JSON hatası süreç düşürmez. Güncel sayılar shared/config'tedir.

Sunucu yalnızca localhost/127.0.0.1'e bağlanır. WS origin listesi yerel geliştirme/önizleme/test portlarıdır; /socket dışındaki upgrade reddedilir. Tek geliştirme pilotu vardır. Yeni sekme eskisini özel kapanma koduyla çıkarır; eski socket komutu artık çalışmaz ve nötr kontrol uygulanır. Bu lease geliştirme kolaylığıdır; kimlik doğrulama veya reconnect değildir.

Sunucu son girdinin süresini ölçer; eski komutu nötrleştirir. Bellek repository snapshot kopyalarını saklar. Server restart ilerlemeyi kaybeder. O1 HTTP `/__test/*` yalnızca açık TEST_MODE, ayrı token ve loopback ortamında çalışır; normal servis 404 döndürür. Browser debug arayüzü sadece kopya okur; reset/teleport/setState metodu yoktur.

## O5 — bağlayıcı uygulama hedefi

Node authoritative dünya 8–16 eşzamanlı oyuncuyu barındırır. Client taşınabilir snapshot/intent protokolünü korur. Actor başına sequence, rate limit, hesabın gemi yetkisi, kötü paket reddi ve kontrollü delta snapshot uygulanır. Gemi transform'ları client'tan yazılamaz. Yakındaki varlıkların snapshot interpolasyonu ve tahmin/uzlaştırma sunucuyu değiştirmez. Hassas ekonomik/hasar sonuçları sunucu mantığında kalır. Uzak/staging iletişimi TLS/WSS olur.

PostgreSQL: universe, player, ship, inventory, mission ve squad kayıtları; sürümlü şema/migrasyon. Repository ve transaction sınırı kalıcılığı renderer'dan ayırır. Para+envanter+görev ödülü aynı transaction/idempotency anahtarıyla bir kez yazılır. Burn/transfer kaydı başlangıç zamanı ve fizik/model sürümü taşır. Snapshot sonrası restartta tutarlı duruma dönülür; yalnızca diske en son yazıldı diye çoğaltılmış ödül üretilmez. Şema, migration ve restore testleri O5 içinde yazılır; O1'e boş DB çağrıları eklenmez.

Çıkış, combat tag, kopma, yeniden bağlanma ve squad davranışlarının kesin kaynağı [oyun tasarımı](game_design.md). İstemsiz kopmayı kötüye kullanmak normal çıkıştan daha güvenli olmamalıdır. Yeniden bağlanma server zamanını veya yürüyen görev aşamasını geri almaz. Son geçerli state ve transfer kayıtlarıyla restart testi zorunludur.

İlk dört geliştirme oturumu yerelde; O5 önce iki gerçek tarayıcı + yapay istemcilerle yerel multiplayer/kayıt/restore tamamlanır. Ardından küçük tek sunucu VM + Node + PostgreSQL + TLS reverse proxy için staging reçetesi hazırlanır. Ücretli sunucu açmak bu oturumun kapsamı değildir. Sağlık kontrolü, yedekleme/geri yükleme, environment secret'ları ve log redaksiyonu O5; kapalı alfa temiz kurulum/deploy doğrulaması O6. Yatay ölçek/Kubernetes/MMO mikroservisleri gerekmez.
