# Fizik sözleşmesi

Uygulama sahipleri: [birimler](../packages/shared/src/units.ts), [konfigürasyon](../packages/shared/src/config.ts), [durum](../packages/shared/src/state.ts), [saf step](../packages/simulation/src/step.ts). Bu belge ayar tablosu değildir.

Kanonik uzunluk metre, zaman saniye, kütle kg, kuvvet N, açılar radyan; JS number/Float64 aritmetiği. ECI merkez Dünya; +Y kuzey, XZ ekvator düzlemi. Sağ elli araç çerçevesi +X sağ, +Y üst, −Z ileri. Quaternion xyzw araç → ECI dönüşümüdür; açısal hız gövde eksenlerindedir.

O1 translasyon modeli a = −μr/|r|³ + R(q)F/m. Sabit adımlı RK4 merkezî yerçekimi ve adım boyunca sabit itkiyle ilerler. Başlangıç v = sqrt(μ/r) dairesel yörünge bağımsız analitik testle karşılaştırılır. Açısal komutlar sınırlı hedef hızdır; açısal ivme sınırlayıcı ve normalize quaternion kullanılır. Tuş bırakınca dönmenin sönmesi uçuş kontrolcüsüdür; sürükleme kuvveti değildir. Translasyon sürüklemesi/hız sıfırlama yoktur.

Sunucu biriktiricisi sabit dt kullanır, render süresi fizik dt'si olmaz. Saf simülasyona tick, durum, komut ve gerekiyorsa seed dışarıdan gelir. Duvar saati, rastgele global kaynak, dosya/ağ/Three.js/React içe aktarma yoktur. Determinizm aynı JS çalışma ortamında komut dizisinin tekrarıdır; platformlar arasında bit düzeyinde garanti iddia edilmez.

Çizimde önce ECI'den gemi konumu double hassasiyette çıkarılır, sonra anlık yörünge bazına dönüştürülür. Yakın pass metreyle gemiyi, uzak pass kilometreyle Dünya ve yıldızları çizer. İki kamera bakışı eşlenir; arada derinlik temizlenir. ECI fizik konumunu kamera hareketi değiştirmez. Bu sayede milyonlarca metrede santimetrelik bağıl fark GPU Float32'ye aktarılmadan korunur. O1 anlık otoriter snapshot'ları çizer; O5 ağ interpolasyon/prediction ekleme yeri render katmanıdır.

## Sınırlamalar ve sonraki sözleşme

O1 küresel tek merkez yaklaşımıdır: J2, atmosfer sürüklemesi, n-cisim, temas/yeniden giriş ve ısıl/radyasyon sistemleri yoktur. Dünya doku fazı ve ışık sahneleri sanatsal sabittir; gerçek takvim efemerisi değildir. O1'de gezegene çarpma oyunu tanımlı değildir; test alanı yakın dairesel yörüngedir. Çok uzun süreli aşağı itkiyle yüzeye yaklaşma desteklenmiş görev sayılmaz.

O2 foundation pass: kütle `dry + modules + cargo + ammunition + propellant` bileşenlerinden oluşur. Henüz oynanış sistemi bulunmayan modül/kargo/mühimmat başlangıçta sıfırdır; bunları dolduracak O3/O4 sistemleri bu geçişte üretilmez. Snapshot'taki `massKg` bu bileşenlerin sunucu tarafından türetilmiş toplamıdır; uyuşmazlık, negatif veya sonlu olmayan bileşen fizik adımından önce reddedilir.

Kimyasal itki sabit özgül itkiyle `ṁ = |F|/(Isp·g0)` kullanır. Mevcut sayısal değerlerin tek kaynağı `shared/src/config.ts` dosyasıdır. Eksen kuvvetleri gövde çerçevesinde birleşir, güncel quaternion ile ECI'ye çevrilir ve gerçek kütleyle ivmeye dönüşür. Son kısmi mikro-adımda mevcut yakıtın sağlayabildiği itki oranı kullanılarak doğru impuls korunur; yakıt sıfırlandığında sonraki adım itkisizdir. Yanma komutu bittiğinde tüketim aynı fixed-step yolunda biter. Anlık Δv enjeksiyonu yapılmaz. Mevcut Δv `Isp·g0·ln(m_wet/m_dry-and-payload)` formülüyle simulation katmanında hesaplanır.

Güçsüz coast için universal-variable Kepler propagator ECI konum/hız alır ve yeni ECI konum/hız döndürür. Aktif itki/yakın operasyon mevcut RK4 fixed-step yolunda kalır. Foundation kabul toleransları: 6 saatlik standart iki-cisim coast için bağıl özgül enerji ve açısal momentum sapması ≤1e-6; standart 10 dakikalık coast'ta Kepler ile bağımsız 60 Hz RK4 konumu arasındaki fark ≤10 m. Gerçek sonuçlar `docs/sessions/02-foundation-report.md` içindedir.

Kalan O2: manevra tahmini ve risk göstergeleri, analitik coast ile yakın fixed-step mod arasında oyun akışı/geçişi, zaman damgalı transfer kaydı ve `low_fuel`/manevra sahneleri. Geçişte konum/hız/kütle/enerji sürekliliği test edilir. Zaman damgalı başlangıç, plan sürümü, burn ve varış durumları saklanabilir veri olur. Global time-warp yoktur; çevrimdışı ilerleme sunucu zamanıyla hesaplanır.

O2 planner pass aynı düzlemde dairesel yörünge değişimi ve kısa phasing problemleriyle sınırlıdır. Dairesel hedefte `phaseAheadRad`, planlama anında geminin yarıçap vektöründen hareket yönünde ölçülür. Yakın-rendezvous state hedefi aynı düzlem/yön ve dairesele yakın hız şartlarını sağlamalıdır. Ekonomik aday en düşük toplam Δv'yi, hızlı aday en kısa ETA'yı, dengeli aday geçerli ve anlamlı biçimde ayrı bir ara çözümü temsil eder; aynı çözümler farklı etiketlerle çoğaltılmaz.

Her aday iki impuls varsayımında bırakılmaz: kalkış yönlendirmesi, mevcut `propulsionStep` ve RK4 yoluyla `1/60 s` mikro-adımlarda gerçek kuvvet/kütle/yakıtla yürütülür; coast universal-variable Kepler ile ilerler; varış yanması hedef dairesel hıza yönelerek yine finite-burn yolundan geçer. Kabul edilen adayda hedef konum ve yarıçap hatası ≤10 km, hız hatası ≤5 m/s'dir. Yakıt/Δv sınırını veya bu varış toleransını aşan çözüm yürütülebilir aday olarak dönmez. Planlama isteği istemci durumunu yazmaz; sunucu immutable gemi snapshot'ını yeniden kullanılan worker'a gönderir, böylece çözücü ana 60 Hz tick döngüsünü bloke etmez. Sözleşme ve ölçümler `packages/shared/src/maneuver.ts` ile `docs/sessions/02-maneuver-planner-report.md` içindedir.

O2 yürütmede sunucu, worker sonucunu bağlantıya ait plan kimliğiyle saklar; istemci yalnızca bu kimlik ve aday tipini geri gönderir. Plan bir kez tüketilir ve ikinci yürütme `DUPLICATE_EXECUTION` olarak reddedilir. Yanmalarda otopilot gövde `−Z` eksenini planın prograde/retrograde/hedef-hız yönüne çevirir ve normal `step` yolunu kullanır. Coast başlangıç ECI state/kütlesi, mutlak sunucu zaman damgası ve sonraki olay zamanıyla ankrajlanır; snapshot anı `propagateKepler(anchor, elapsed)` ile doğrudan yeniden kurulur. Böylece uzun coast 60 Hz'de tek tek simüle edilmez. İptal, coast'u iptal zamanına kadar örnekler; tamamlanmış yakıt tüketimini geri almaz ve sonraki yanmayı başlatmaz.

## İstasyon rendezvous ve docking sözleşmesi

AEGIS tek nötr servis istasyonudur; 450 km dairesel ekvator yörüngesinde gemiyle aynı iki-cisim integratörü/Kepler propagator sözleşmesini kullanır. İstasyon, yönelim ve Alpha portunun yerel capture noktası/eksenleri otoriter world state içindedir. İstemci yalnız istasyon kimliğini seçer. Sunucu portu o anki ECI konumuna çözer ve mevcut yakın-rendezvous planlayıcısına hedef state verir. Uzun coast atlamasında istasyon da aynı mutlak zamana propagate edilir; tamamlanan çözümün bağıl 200 m yaklaşma ofseti güncel port state'ine yeniden uygulanır.

Son yaklaşma normal fixed-step itki ve quaternion yön kontrolünü kullanır. Ölçümler çift hassasiyetli ECI farkından üretilir: port menzili, istasyon bağıl hızı, kapanma hızı, port eksenindeki mesafe, yanal/dikey hata, gövde `−Z` ileri hizası ve roll. Capture isteği ancak doğru yaklaşma yarı uzayında, 3,5 m capture yarıçapında, en fazla 1 m/s bağıl ve 0,8 m/s kapanma hızında, 2,5 m yanal hata, 12° ileri eksen ve 15° roll sınırlarında kabul edilir. 5 m/s ve üstü capture alanı teması mevcut hasar sözleşmesine otoriter darbe olarak bağlanır.

`DOCKED` durumunda gemi yeniden yaratılmaz; her step'te port transformuna bağlanır, hızı istasyon hızı olur, açısal hız ve kontrol komutları sıfırlanır. Sunucu uçuş ve silah komutlarını reddeder. Yakıt/tamir/mühimmat/hangar/yükseltme işlemleri hem doğru istasyon kimliğini hem sunulan servisi hem `DOCKED` durumunu doğrular ve mevcut idempotent ekonomi işlemini kullanır. Undock gemiyi port ekseninde 14 m uzağa, 0,5 m/s güvenli ayrılma hızıyla bırakır ve doğrudan uçuşu geri açar.

O4 füze/çarpışma ve modül hasarı; O5 otoriter lag işleme. İstemci hiçbir aşamada konum, hız, hasar veya yakıt sonucunun otoritesi olmaz.
