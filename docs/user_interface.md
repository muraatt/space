# Arayüz sözleşmesi

React DOM erişilebilir etkileşimleri ve seyrek telemetri güncellemelerini yönetir; Three.js bağımsız requestAnimationFrame döngüsünü ve canvas'ı yönetir. Her render karesinde React state yazılmaz. Sunucudan gelen otoriter state metriklerin kaynağıdır.

O1 düzeni: üstte kimlik ve bağlantı, solda araç/yörünge ve sahne seçimi, ortada geniş uçuş görüşü, sağda radyal hız/kamera/debug, altta itki/açısal hız/fizik adımı ve grafik yolu. Dünya açısal boyutu görünür; UI gemi kontrolünü kapatmaz. Türkçe metinler Segoe UI, sayılar Consolas ile yerel fontlardan gelir.

Başlangıçta gözlem modu, görünür **Kumandayı devral** düğmesi vardır. Canvas odaklı gerçek klavye girişi çalışır. Arayüz butonuna odak değişimi, pencere blur ve görünmez sekme girdiyi bırakır. W/S, A/D, R/F; oklar, Q/E; Space; fare sürükleme/tekerlek; C ve F3 için oyun içi rehber vardır. Escape modalı kapatır. Klavye focus çerçevesi ve düğme isimleri görünür/erişilebilirdir.

O1'de gösterilmeyen yakıt/görev/para verileri için sahte sayılar veya çalışmayan menüler eklenmez. Debug'da backend, draw/üçgen, FPS/frame p95, sunucu tick ve komut reddi okunur. Bağlantı hatası ve başka sekmeye pilot devri açık mesajdır. Gün/gece seçimi uçuş reset uyarısı taşır. İlerleme kalıcı değildir bilgisi görünür.

Viewport kabulü: 1920×1080 ve 1280×720; kısa desktop'ta sol aksiyonlar footer'a taşmaz. Mobil oyun desteği bu slice'ın hedefi değildir. O2 manevra süre/yakıt/risk arayüzü; O3 fraksiyon, profil, hangar ve görev akışı; O4 hedef/hasar/kayıp/güvenli bölge bildirimi; O5 squad ve bağlantı durumu; O6 onboarding, ses ve grafik kalite seçenekleri. Onboarding final kabulünde yeni insan oyuncunun rehber almadan döngüyü bitirmesi ölçülür.
