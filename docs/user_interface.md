# Arayüz sözleşmesi

React DOM erişilebilir etkileşimleri ve seyrek telemetri güncellemelerini yönetir; Three.js bağımsız requestAnimationFrame döngüsünü ve canvas'ı yönetir. Her render karesinde React state yazılmaz. Sunucudan gelen otoriter state metriklerin kaynağıdır.

O1 düzeni: üstte kimlik ve bağlantı, solda araç/yörünge ve sahne seçimi, ortada geniş uçuş görüşü, sağda radyal hız/kamera/debug, altta itki/açısal hız/fizik adımı ve grafik yolu. Dünya açısal boyutu görünür; UI gemi kontrolünü kapatmaz. Türkçe metinler Segoe UI, sayılar Consolas ile yerel fontlardan gelir.

Başlangıçta gözlem modu, görünür **Kumandayı devral** düğmesi vardır. Canvas odaklı gerçek klavye girişi çalışır. Arayüz butonuna odak değişimi, pencere blur ve görünmez sekme girdiyi bırakır. W/S, A/D, R/F; oklar, Q/E; Space; fare sürükleme/tekerlek; C ve F3 için oyun içi rehber vardır. Escape modalı kapatır. Klavye focus çerçevesi ve düğme isimleri görünür/erişilebilirdir.

O1'de gösterilmeyen yakıt/görev/para verileri için sahte sayılar veya çalışmayan menüler eklenmez. Debug'da backend, draw/üçgen, FPS/frame p95, sunucu tick ve komut reddi okunur. Bağlantı hatası ve başka sekmeye pilot devri açık mesajdır. Gün/gece seçimi uçuş reset uyarısı taşır. İlerleme kalıcı değildir bilgisi görünür.

O2 manevra paneli üç sınırlı hedef sunar ve yalnızca sunucudan gelen adayları gösterir. Kartlarda ETA, transfer süresi, toplam Δv, yakıt tüketimi ve varış rezervi bulunur. Seçim istemci tercihidir; yürütme sonucu değildir. Yürüt/iptal komutları plan ve execution kimliği taşır. Snapshot'taki otoriter durum kalkış yanması, coast, varış yanması, tamamlanma, iptal veya hatayı gösterir. Alt HUD gerçek yakıt kütlesi/yüzdesi, mevcut Δv ve seçili planın tüketim/rezervini gösterir. Düşük yakıt uyarısı tank yüzdesinden değil adayın yapılabilirliği ve beklenen kalan Δv'den gelir.

Plan paneli açıkken Three.js far pass mevcut yörüngeyi mavi-gri, hedef yörüngeyi kehribar, seçili transferi açık kehribar çizgiyle gösterir; iki nokta ilk yanma ve varışı işaretler. Geometri React render döngüsünde üretilmez ve ECI noktaları her frame kamera-bağıl kilometre koordinatlarına çevrilir.

O3 görev kontrolü mevcut sol aksiyondan açılır. Profil fraksiyonu ad, sembol ve hizmet merkezi etiketiyle; kredi ve itibar otoriter snapshot değerleriyle gösterilir. Görev kartı tip, hedef, planner kaynaklı ETA, kütle ve kabul anında sabitlenen ödülü taşır. Etkin kart kargoyu, hedef menzilini veya tarama ilerlemesini gösterir ve hedefi mevcut manevra bilgisayarına aktarır. Teslim, tarama ve terk etme düğmeleri yalnızca istek yollarıdır; sonuç snapshot'tan okunur.

O3 hangar paneli aynı sol aksiyon alanından açılır ve görev paneliyle birbirini kapatır. İki sahip olunan araç kartı aktif aracı, rolü, kuru kütleyi, ana itkiyi, kullanılabilir Δv'yi, kargo kapasitesini ve genel dayanıklılığı karşılaştırır. Raptor seçimi uçuş görünümündeki ad/çağrı kodu ile gemi siluetini günceller. Servis satırları mevcut/tamamlanmış yakıt, kondisyon ve mühimmatla otoriter fiyatı gösterir. Dört sabit modül kartı fiyat, etki, uyumluluk, slot ve kurulu durumunu taşır; bakiye sunucu onayıyla anında güncellenir. Panel 1920×1080 içinde kaydırılabilir; sol eylem rayı alt HUD sınırında kaydırılır.

Viewport kabulü: 1920×1080 ve 1280×720; kısa desktop'ta sol aksiyonlar footer'a taşmaz. Mobil oyun desteği bu slice'ın hedefi değildir. O2 manevra süre/yakıt/risk arayüzü; O3 fraksiyon, profil, hangar ve görev akışı; O4 hedef/hasar/kayıp/güvenli bölge bildirimi; O5 squad ve bağlantı durumu; O6 onboarding, ses ve grafik kalite seçenekleri. Onboarding final kabulünde yeni insan oyuncunun rehber almadan döngüyü bitirmesi ölçülür.
