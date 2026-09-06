# Vertical slice kapsamı

Onay: 2026-09-06. Çalışma takvim haftalarına değil [altı büyük uygulama oturumuna](roadmap.md) ayrılır. Alt görevler yeni oturumlar değildir. Her oturum kod, entegrasyon, test, ekran görüntüsü incelemesi ve belgeyi birlikte teslim eder; sonunda doğrudan çalıştırılabilir oyun kalır.

## Final slice (O6 sonunda)

PC/Chrome/Edge, Dünya ve yakın yörünge, bir kalıcı test evreni, iki fraksiyon, 8–16 oyuncu mimarisi, lojistik ve savaş aracı. Yörünge transferi/planner/yakıt/delta-v; kargo/keşif/önleme; hedefleme/lazer/füze/savunma/modül hasarı; para/ikmal/tamir/yükseltme; hesap, kalıcı ilerleme, kopma/geri dönüş ve restart kurtarma. İki gerçek tarayıcı etkileşimi ve yeni oyuncunun açıklama almadan temel döngüyü tamamlaması final kabulüdür.

## Oturum 1 sınırı

Tek geliştirme gemisi, merkezî yerçekimi ve sabit kütleli itki. SI/ECI ortak sözleşmesi. Yerel Node komut otoritesi; React DOM + bağımsız Three.js; Dünya, atmosfer, yıldızlar, gün/gece ışığı, üçüncü şahıs kamera, okunur telemetri. İki isimli test sahnesi, deterministik reset, ekran görüntüsü ve ölçüm altyapısı. Bellek repository arayüzü vardır; kalıcılık iddiası yoktur.

**O1'de yok:** yakıt muhasebesi, manevra planner, görev, fraksiyon seçimi, para, hasar/silah, hesap, DB entegrasyonu, squad, gerçek oyuncu multiplayer'ı. Tarayıcıdaki tek pilot devri O5 reconnect özelliği değildir.

## Bütün slice dışında

Ay yüzeyi/kolonileri, Mars/dış gezegenler, solucan delikleri, evrenler arası geçiş, yüzlerce oyuncu, tam araç mühendisliği editörü, oyuncu devletleri, tam oyuncu üretimli ekonomi, madencilik/fabrika/karmaşık tedarik zincirleri, devasa içerik ve monetizasyon. Bu alanlar adına erken servis veya placeholder oyun akışı yapılmaz.

## Ortak kabul

Gereken komutlar gerçekten geçer; atlananlar ayrı raporlanır. Baseline güncelleme önce görsel inceleme gerektirir. İtki/yön/fare kontrolleri doğrudan test edilir; sadece ekran görüntüsü yeterli değildir. Grafik ölçümü GPU/backend/tarayıcı/viewport/süre içerir. Yazılım render'ı referans GPU sayılmaz. İnsan tarafından oyun hissi/görsel beğeni ve mevcut olmayan referans donanım kabulü doğrulanmadan işaretlenmez.

O1 → O2 giriş kapısı: çalışan yerel oyun, ortak otorite/fizik sınırları, geçen otomatik testler, gündüz/gece görsel incelemesi, yeniden üretilebilir ölçüm, güncel belgeler ve açık risk kaydı. İnsan öznel kabulü ve referans donanım sonucu ayrıca izlenir. O1'in tüm kabulü doğrulanmadıysa rapor **tam kabul bekliyor** der; sonraki oturumu kendiliğinden başlatmaz.
