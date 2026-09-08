# Arayüz sözleşmesi

## Üç katmanlı uçuş arayüzü

Normal oyunun birincil yüzeyi Three.js uzay görünümüdür. Kalıcı uçuş HUD'ı sol üstte canlı 3B ECI yörünge haritasını, sağda dar sayısal telemetri şeridini, merkezde mevcut dünya/hedef işaretlerini ve altta yalnız kumanda durumunu taşır. Sol alttaki OPS çekmecesi varsayılan olarak kapalıdır; etkin sözleşme, hedef, navigasyon ve hızlı sistem erişimini kısa operasyon değerleriyle açar.

Yörünge haritası ikinci bir simülasyon çalıştırmaz. Mevcut yörüngeyi sunucu snapshot'ındaki ECI konum/hızdan osculating yol olarak çıkarır; oyuncu işareti aynı authoritative konumla hareket eder. Görev, seçili temas veya manevra planı varsa hedef yörüngesi/işareti ve planlanan transfer yolu eklenir.

Sağ şeridin sabit bölümleri FLIGHT, ORBIT, SHIP ve ATTITUDE'dur. ALT/VEL/RAD/ACC; APO/PER/INC/PERIOD; MASS/FUEL/ΔV/THR ve quaternion'dan türetilen PITCH/YAW/ROLL gösterilir. Seçili hedefte RANGE/REL-V/CLOSE/LOCK, etkin manevrada STATE/NEXT/BURN, savaş bağlamında LASER/HEAT/MISS/CM eklenir. Uydurulmuş değer kullanılmaz; türevler mevcut SI/ECI snapshot'ından hesaplanır.

Manevra, görev/sözleşme, hangar/servis ve ateş kontrolü tek bir tam ekran sistem kalıbı kullanır. Aynı anda biri açıktır; sağ üstteki görünür `[X]` veya Escape normal uçuş HUD'ına döner. Sistem kapanınca canvas odağı ve klavye kumandası hemen geri verilir.

## Ateş kontrolü

Tam ekran **ATEŞ KONTROLÜ** sistemi bölge kuralını ve combat tag durumunu, taktik teması, menzil/görüş/izin bilgisini, lazer enerji-ısı-cooldown değerlerini, füze stoğunu ve aktif füze sayısını, karşı tedbir yüklerini ve araç gövdesini gösterir. Gelen füze ayrı yüksek görünürlüklü uyarıdır. Hedef seçilmeden silah düğmeleri etkinleşmez; sunucu retleri makine kodundan Türkçe geri bildirime çevrilir. Son otoriter olaylar panel akışında listelenir. Sistem kapandığında seçili hedefin temel değerleri sağ telemetri şeridinde kalır.

ENGINE, FUEL, POWER ve WEAPON kondisyon kartları sonucu kısa metinle açıklar. İmha halinde silah/kontrol kilitlenir ve aynı panel kargo, mühimmat, yükseltme kaybı ile muafiyeti gösterir. **SİGORTA / YEDEK ARAÇ TALEP ET** sunucu sonucunu bekler; teslimden sonra **HANGARA DÖN** normal oynanabilir hangarı açar.

React DOM erişilebilir etkileşimleri ve seyrek telemetri güncellemelerini yönetir; Three.js bağımsız requestAnimationFrame döngüsünü ve canvas'ı yönetir. Her render karesinde React state yazılmaz. Sunucudan gelen otoriter state metriklerin kaynağıdır.

O1'in kalıcı büyük sol rayı bu mimari geçişte kaldırıldı. Üstte kimlik/bağlantı ve kompakt sistem erişimi; sol üstte yörünge, sağda telemetri ve sol altta OPS bulunur. Dünya ve uzay görüşü ekranın baskın yüzeyidir. Türkçe metinler Segoe UI, sayılar Consolas ile yerel fontlardan gelir.

Başlangıçta gözlem modu, görünür **Kumandayı devral** düğmesi vardır. Canvas odaklı gerçek klavye girişi çalışır. Arayüz butonuna odak değişimi, pencere blur ve görünmez sekme girdiyi bırakır. W/S, A/D, R/F; oklar, Q/E; Space; fare sürükleme/tekerlek; C ve F3 için oyun içi rehber vardır. Escape modalı kapatır. Klavye focus çerçevesi ve düğme isimleri görünür/erişilebilirdir.

O1'de gösterilmeyen yakıt/görev/para verileri için sahte sayılar veya çalışmayan menüler eklenmez. Debug'da backend, draw/üçgen, FPS/frame p95, sunucu tick ve komut reddi okunur. Bağlantı hatası ve başka sekmeye pilot devri açık mesajdır. Gün/gece seçimi uçuş reset uyarısı taşır. İlerleme kalıcı değildir bilgisi görünür.

O2 manevra paneli üç sınırlı hedef sunar ve yalnızca sunucudan gelen adayları gösterir. Kartlarda ETA, transfer süresi, toplam Δv, yakıt tüketimi ve varış rezervi bulunur. Seçim istemci tercihidir; yürütme sonucu değildir. Yürüt/iptal komutları plan ve execution kimliği taşır. Snapshot'taki otoriter durum kalkış yanması, coast, varış yanması, tamamlanma, iptal veya hatayı gösterir. Alt HUD gerçek yakıt kütlesi/yüzdesi, mevcut Δv ve seçili planın tüketim/rezervini gösterir. Düşük yakıt uyarısı tank yüzdesinden değil adayın yapılabilirliği ve beklenen kalan Δv'den gelir.

Plan paneli açıkken Three.js far pass mevcut yörüngeyi mavi-gri, hedef yörüngeyi kehribar, seçili transferi açık kehribar çizgiyle gösterir; iki nokta ilk yanma ve varışı işaretler. Geometri React render döngüsünde üretilmez ve ECI noktaları her frame kamera-bağıl kilometre koordinatlarına çevrilir.

O3 görev kontrolü **CONTRACTS/GÖREV KONTROLÜ** tam ekran sisteminde açılır. Profil fraksiyonu ad, sembol ve hizmet merkezi etiketiyle; kredi ve itibar otoriter snapshot değerleriyle gösterilir. Görev kartı tip, hedef, planner kaynaklı ETA, kütle ve kabul anında sabitlenen ödülü taşır. Etkin görev sistem kapatılınca OPS'te kısa özet olur. Teslim, tarama ve terk etme düğmeleri yalnızca istek yollarıdır; sonuç snapshot'tan okunur.

O3 hangar tam ekran sistem olarak açılır ve diğer ana sistemleri kapatır. İki sahip olunan araç kartı aktif aracı, rolü, kuru kütleyi, ana itkiyi, kullanılabilir Δv'yi, kargo kapasitesini ve genel dayanıklılığı karşılaştırır. Raptor seçimi uçuş görünümündeki ad/çağrı kodu ile gemi siluetini günceller. Servis satırları mevcut/tamamlanmış yakıt, kondisyon ve mühimmatla otoriter fiyatı gösterir. Dört sabit modül kartı fiyat, etki, uyumluluk, slot ve kurulu durumunu taşır; bakiye sunucu onayıyla anında güncellenir. Sistem 1920×1080 içinde kaydırılabilir ve `[X]` her zaman görünürdür.

## AEGIS istasyon ve docking arayüzü

AEGIS haritada kendi otoriter ECI konumu ve osculating yörüngesiyle sürekli görünür. İstasyon seçildiğinde manevra bilgisayarına gerçek `STATION_RENDEZVOUS` hedefi gider; istemci hedef konumu üretmez. Rendezvous tamamlandıktan sonra sağ şeritte DOCKING bölümü menzil, bağıl hız, kapanma, yanal/dikey hata, ileri hizası ve yaw/pitch/roll hatalarını gösterir. Merkezdeki küçük kılavuz yalnız seçili istasyonda görünür ve `RENDEZVOUS REQUIRED`, `FOLLOW APPROACH AXIS`, `REDUCE RELATIVE SPEED`, `ALIGN ATTITUDE`, `CAPTURE READY` veya `CAPTURED` sonucunu otoriter snapshot'tan okur. Dünya görünümündeki port halkaları ve yaklaşma ekseni aynı kamera-bağıl çizim yolunu kullanır.

OPS çekmecesi istasyon seçimi, capture isteği, dock sonrası servis erişimi ve undock için tek kısa işlem alanıdır. `DOCKED` durumunda uçuş girdisi gönderilmez; hangar başlığı AEGIS servis bağlamını ve durum satırı `AEGIS / DOCKED` bilgisini gösterir. İstasyon dışındayken hangar incelenebilir fakat yakıt, tamir, mühimmat, araç değiştirme ve yükseltme işlemleri kapalıdır. Her ret kullanıcıya açık bir neden olarak gösterilir.

## Bounty sandbox arayüzü

AEGIS'e docked iken aynı Görev Kontrolü ekranı üç canlı bounty kartını gösterir. Kartlar hedef adı, SCOUT/FIGHTER/HEAVY sınıfı, LOW/MEDIUM/HIGH tehdit, irtifa, otoriter planner ETA/Δv/yakıt ve sabit ödülü kısa satırlarda verir. Kabul dock durumuna bağlıdır. Uçuş HUD'ındaki OPS etkin hedefi, menzili, sınıfı, tehdidi, ödülü ve acquisition durumunu taşır; harita hedefin gerçek ECI yörüngesini gösterir.

Görev ekranındaki `HEDEFİ MANEVRAYA AKTAR` yalnız stabil entity kimliğini gönderir; sunucu anlık hedef durumunu çözer. Acquisition sonrasında Ateş Kontrolü doğru hedefi ve yetkiyi gösterir. Tamamlanma kartı ödül, tüketilen yakıt/mühimmat, hasar, otoriter servis fiyatlarından operasyon maliyeti ve net sonucu sunar. `AEGIS'İ HEDEFLE` istasyonu seçer; transfer veya docking başlatmaz.

Viewport kabulü: 1920×1080 ve 1280×720; kısa desktop'ta sol aksiyonlar footer'a taşmaz. Mobil oyun desteği bu slice'ın hedefi değildir. O2 manevra süre/yakıt/risk arayüzü; O3 fraksiyon, profil, hangar ve görev akışı; O4 hedef/hasar/kayıp/güvenli bölge bildirimi; O5 squad ve bağlantı durumu; O6 onboarding, ses ve grafik kalite seçenekleri. Onboarding final kabulünde yeni insan oyuncunun rehber almadan döngüyü bitirmesi ölçülür.
