# Fizik sözleşmesi

Uygulama sahipleri: [birimler](../packages/shared/src/units.ts), [konfigürasyon](../packages/shared/src/config.ts), [durum](../packages/shared/src/state.ts), [saf step](../packages/simulation/src/step.ts). Bu belge ayar tablosu değildir.

Kanonik uzunluk metre, zaman saniye, kütle kg, kuvvet N, açılar radyan; JS number/Float64 aritmetiği. ECI merkez Dünya; +Y kuzey, XZ ekvator düzlemi. Sağ elli araç çerçevesi +X sağ, +Y üst, −Z ileri. Quaternion xyzw araç → ECI dönüşümüdür; açısal hız gövde eksenlerindedir.

O1 translasyon modeli a = −μr/|r|³ + R(q)F/m. Sabit adımlı RK4 merkezî yerçekimi ve adım boyunca sabit itkiyle ilerler. Başlangıç v = sqrt(μ/r) dairesel yörünge bağımsız analitik testle karşılaştırılır. Açısal komutlar sınırlı hedef hızdır; açısal ivme sınırlayıcı ve normalize quaternion kullanılır. Tuş bırakınca dönmenin sönmesi uçuş kontrolcüsüdür; sürükleme kuvveti değildir. Translasyon sürüklemesi/hız sıfırlama yoktur.

Sunucu biriktiricisi sabit dt kullanır, render süresi fizik dt'si olmaz. Saf simülasyona tick, durum, komut ve gerekiyorsa seed dışarıdan gelir. Duvar saati, rastgele global kaynak, dosya/ağ/Three.js/React içe aktarma yoktur. Determinizm aynı JS çalışma ortamında komut dizisinin tekrarıdır; platformlar arasında bit düzeyinde garanti iddia edilmez.

Çizimde önce ECI'den gemi konumu double hassasiyette çıkarılır, sonra anlık yörünge bazına dönüştürülür. Yakın pass metreyle gemiyi, uzak pass kilometreyle Dünya ve yıldızları çizer. İki kamera bakışı eşlenir; arada derinlik temizlenir. ECI fizik konumunu kamera hareketi değiştirmez. Bu sayede milyonlarca metrede santimetrelik bağıl fark GPU Float32'ye aktarılmadan korunur. O1 anlık otoriter snapshot'ları çizer; O5 ağ interpolasyon/prediction ekleme yeri render katmanıdır.

## Sınırlamalar ve sonraki sözleşme

O1 küresel tek merkez yaklaşımıdır: J2, atmosfer sürüklemesi, n-cisim, temas/yeniden giriş ve ısıl/radyasyon sistemleri yoktur. Dünya doku fazı ve ışık sahneleri sanatsal sabittir; gerçek takvim efemerisi değildir. O1'de gezegene çarpma oyunu tanımlı değildir; test alanı yakın dairesel yörüngedir. Çok uzun süreli aşağı itkiyle yüzeye yaklaşma desteklenmiş görev sayılmaz.

O2: kuru/yakıt/kargo kütlesi, kimyasal Isp ve roket denklemiyle Δv, yakıt tüketimi, manevra tahmini ve risk göstergeleri. Analitik/kepler transfer propagasyonu ile yakın sabit adımlı mod arasında açık dönüşüm. Geçişte konum/hız/kütle/enerji sürekliliği test edilir. Zaman damgalı başlangıç, plan sürümü, burn ve varış durumları saklanabilir veri olur. Global time-warp yoktur; çevrimdışı ilerleme sunucu zamanıyla hesaplanır. O2 tolerans bütçesi planner ve propagator uygulanırken bu sözleşmeye eklenir; O1 değerleri değiştirilerek doğrulanmış gibi sunulmaz.

O4 füze/çarpışma ve modül hasarı; O5 otoriter lag işleme. İstemci hiçbir aşamada konum, hız, hasar veya yakıt sonucunun otoritesi olmaz.
