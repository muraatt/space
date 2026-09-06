# Altı uygulama oturumu

Onaylanan sıra bağlayıcıdır. Bunlar altı büyük uygulama oturumudur; maddeler yeni oturum oluşturmaz. Her biri önce mevcut repo/belgeler/son raporu okur, kapsamı kısa doğrular, kod+entegrasyon+test+görsel kontrol+belgeyi birlikte bitirir ve çalışan oyun bırakır. Oturumlar takvim haftasına çevrilmez. Sonuçlar [raporlarda](sessions/01-report.md) tutulur.

## Oturum 1 — Çalışan görsel oyun temeli

Sıra: monorepo ve belgeler → shared/simulation/server otorite yolu → Dünya/atmosfer/yıldız/ışık ve düzenlenebilir gemi → bağımsız canvas + React HUD → gerçek kontrol/kamera → senaryolar/test/ölçüm → görsel düzeltme ve rapor.

Teslim: beş paket; AGENTS ve tasarım belgeleri; yerel komutlar; Dünya yörüngesinde Kestrel; üçüncü şahıs kamera; merkezî yerçekimi ve sabit kütleli basit itki; debug; `orbit_day`/`orbit_night`; otomatik görüntü/perf. İlk oturum yalnızca altyapıyla kapanmaz.

Kabul: iki sahne hatasız açılır, Dünya ufku/atmosfer/gemi gece silueti okunur, klavye ve fare gerçekten çalışır, kamera toparlanır, 1080p ve 720p HUD kullanılabilir, sunucu dışı transform yazımı yoktur. Testler: typecheck/lint, bağımsız analitik yörünge, itki/rotasyon/determinizm/koordinat, komut sınırı, wire ve gerçek kumanda journey, dört backend/sahne görseli. Ölçüm: backend/GPU/tarayıcı etiketli ilk CPU/GPU/ağ raporu; başlangıç çizim bütçesi en çok 150 call. İnsan hissi ve referans GPU sonucu ayrıca doğrulanır.

Risk: GPU seçimi/fallback, koordinat hassasiyeti, görsel kalite, başlangıç yükü, test süreçlerinin kapanması. Tamamlanma: çalışan yerel oyun + gerçekten geçen kontroller + incelenmiş görseller + açık eksik ve giriş kapısı raporu. Doğrulanmamış kabul geçer sayılmaz. Yakıt/planner/görev/ekonomi/silah/hesap/DB/multiplayer yoktur.

## Oturum 2 — Yörünge ve uzay uçuşu

Giriş: O1 teknik kapısı ve kalan kabul kayıtları okunmuş olmalı. Sıra: fizik sözleşmesini genişlet → kütle/yakıt/itki/Δv → manevra tahmini ve yürütme → süre/maliyet/risk arayüzü → hassas çizim ve soyut zaman damgalı transfer entegrasyonu → deterministik test/görsel inceleme.

Kabul: oyuncu hedef yörünge seçer, planın süre/yakıt/riskini görür ve yakıt harcayarak transfer yapar. Uzun transfer kaydı tekrar değerlendirilince aynı zamana aynı sonuç verir; global time-warp yoktur. `low_fuel` ve manevra sahnesi çalışır. Otomatik: roket denklemi, yakıt sınırı, birim/enerji hatası, propagator karşılaştırması, model geçiş sürekliliği, tekrar yürütülen burn'un iki kez tüketmemesi. Manuel: plan anlaşılır mı, yakın kumanda/plan geçişi sezgisel mi. Görsel: yörünge/işaretler kaymaz, maliyet/risk okunur. Performans: O1 yöntemiyle karşılaştırma, planner ana render'ı kilitlemez.

Risk: fizik doğruluğu/oynanış gerilimi, varış bekleme süresi, model geçişinde sıçrama. Tamamlanma: erişilebilir hedefe gerçek kontrollü transfer, deterministik kanıt ve güncel sözleşme; görev/para/kalıcılık eklenmez.

## Oturum 3 — Görev ve ekonomi döngüsü

Giriş: O2 transfer/yakıt doğrulaması. Sıra: iki fraksiyon/profil başlangıcı → NPC görev ve ödül sözleşmesi → kargo/keşif/önleme akışı → para/itibar ve ikmal/tamir → hangar, lojistik/savaş araçları, temel yükseltme → bütün döngü doğrulaması.

Kabul: görev al/tamamla/başarısız ol; para kazan, yakıt/mühimmat/tamir al, gemiyi geliştir. NPC tabanı tek oyuncuyla işler. İki araç düzenlenebilir kaynak taşır. `cargo_mission` oynanır. Önleme navigasyon/görev akışıdır; ateşli çözüm O4. Test: ödül tekilliği, negatif/yetersiz kaynak reddi, kargo kapasitesi, görev aşamaları, fraksiyon profili ve ikmal. Manuel: 20–40 dakikalık döngü ve gider/gelir hissi. Görsel: hangar/araçlar/görev akışı tutarlı. Performans: sahne ve UI geçişlerinde kalıcı bellek artışı izlenir.

Risk: görevlerin tekrarlı hissettirmesi, gelir gider kilitlenmesi, iki araç üretim yükü. Tamamlanma: uçuş→görev→ödül→yükseltme çalışır; hesap/DB/squad ve karmaşık üretim eklenmez.

## Oturum 4 — Savaş ve araç kaybı

Giriş: O3 görev ve ekonomi döngüsü. Sıra: hedefleme → lazer/füze/savunma → modül hasarı/bot → imha/enkaz/kayıp → sigorta ve dönüş → güvenli/çekişmeli bölge → ses/efekt/geri bildirim ve test.

Kabul: botla savaş, hasar al, gemiyi kaybet, kargo/modül kaybını gör ve temel sigortayla dön; hesap ilerlemesi silinmez. `intercept`/`missile_hit`. Test: hit/hasar yetkisi, modül devre dışı, karşı tedbir, imha tekilliği, kayıp/sigorta istismarı, güvenli sınır atışı/kaçışı. Manuel: nişan ve hasar anlaşılır mı, kayıp önemli ama devam edilebilir mi. Görsel: okunur hedefler, kontrollü efekt ve gece silueti. Performans: efekt yoğun anında frame p95 ve draw bütçesi ölçülür.

Risk: haksız görünür isabet, okunmaz efekt, ücretsiz araçtan para üretimi. Tamamlanma: bot savaşı→imha→sigorta gerçek akışı ve açık bölge kuralları; polis/diplomasi ve gerçek oyuncu multiplayer'ı eklenmez.

## Oturum 5 — Multiplayer ve kalıcı evren

Giriş: O4 otoriter savaş/kayıp. Sıra: hesap/protokol ownership → 8–16 oyuncu sunucusu → PostgreSQL/migration/transaction → dört kişilik squad/ortak görev → çıkış/combat tag/kopma/geri dönüş → restart restore → iki gerçek tarayıcı + yapay istemci → düşük maliyetli staging reçetesi.

Kabul: iki gerçek tarayıcı birbirini görür, görev paylaşır veya savaşır; gemi/para/envanter/görev kaydı korunur; restart evreni geri getirir. `two_player_combat`, `disconnect_reconnect`, `server_restart_restore`. Test: sahte ownership/state, ödül/idempotency, kopma/120 saniye/5 dakika combat kuralları, model zamanı, migration/restore, 8 ve 16 bot, latency/loss/jitter. Manuel: iki insan/istemciyle görev ve savaş. Görsel: interpolasyon ve kullanıcı bağlantı bildirimi tutarlı. Performans: server tick, snapshot/ağ, frame ve reconnect ölçümleri; yazılım render ayrı etiketlenir.

Risk: yarış koşulları, duplicate ödül, zaman damgası kayması, güvenlik ve işletme maliyeti. Tamamlanma: önce yerel multiplayer + kalıcı restore; ardından staging kurulabilir yöntem ve maliyet notu. Ücretli servis otomatik açılmaz; klan/ittifak yoktur.

## Oturum 6 — Gerçek oyun kalitesi ve kapalı alfa

Giriş: O5 çok oyunculu kalıcı döngü. Sıra: tutarlı art direction ve gemi/Dünya/atmosfer/materyal geçişi → görev kontrolü UI → ses/müzik → onboarding/ilk görev → kalite/LOD/resolution scaling/efekt seçenekleri → optimizasyon → görsel/yük/kötü ağ/temiz kurulum → kritik hata ve kapalı alfa.

Kabul: yeni oyuncu açıklama almadan girer, fraksiyon seçer, görev/uçuş/savaş/para döngüsünü tamamlar ve ilerlemesi kalır. Test: bütün journey regresyonları, görsel baseline, 8–16 yük ve kötü ağ, temiz kurulum/dağıtım ve restore. Manuel: yeni insan onboarding ve iki oyuncu test listesi. Görsel: tutarlı profesyonel sonuç, okunur siluet/UI/efekt, lisanslı düzenlenebilir varlıklar. Hedef: GTX1660/RTX2060 sınıfı 1080p orta 60 FPS; minimum GTX1060/8 GB 1080p düşük oynanabilirlik. Referans donanım olmadan bu kabul verilmez.

Risk: polish kapsamının büyümesi, ilk kullanıcı sürtünmesi, düşük GPU performansı. Tamamlanma: kritik hata kapalı, kurulum/staging yöntemi doğrulanmış, ölçümler ve insan test sonuçları kaydedilmiş kapalı alfa. MMO vizyonu özellikleri eklenmez.
