# Ekonomi — O3/O4/O5 sözleşmesi

**O1'de ekonomi uygulanmadı.** Düşük oyuncu sayısında da çalışan NPC tabanı ilk sürümün gereğidir.

NPC görev üretir; yakıt, mühimmat, tamir ve temel gemi/modül satar; kargo ve keşif verisi alır. Taban fiyatlar ve erişilebilir temel ikmal ekonominin kilitlenmesini önler. Görev ödülü ve NPC alımı para kaynağı; yakıt/mühimmat/tamir/modül alımı ve kayıp yenilemesi para gideridir. İlk denge tablosu O3'te sürümlü shared tanımlarına konur; burada spekülatif fiyat tekrarı tutulmaz.

Oyuncular arası ticaret desteklenebilir ancak yüksek nüfus ekonomi için ön koşul olmaz. Tam oyuncu üretimi, madencilik, fabrikalar ve karmaşık tedarik zincirleri ertelenir; slice boyunca uygulanmaz.

O3 kabulü: tek oyuncu NPC'den görev alabilir, kargo/keşif/önleme görev akışını tamamlayabilir veya kaybedebilir, bir kez ödül alır, ikmal/tamir/yükseltme yapabilir. Tekrar gönderim, negatif miktar ve yetersiz bakiye denetlenir. O3 önleme görevi navigasyon hedefidir; silahlı çözüm O4'te eklenir. O4 temel sigorta ve kargo/modül kaybını ekler. Ücretsiz temel araç ve devredilemeyen ekipmanı satıp para basılamaz. O5 ödül/idempotency/transaction ve squad paylaşımı kalıcı sunucu üzerinde doğrulanır.

Riskler: kısa görevlerin yakıt giderini karşılamaması; ücretsiz araçlardan kaynak üretimi; sınırsız görev reset/ödül tekrarı; katkı paylaşımı istismarı. Testler son durum/bakiye/envanter değişimini doğrular; yalnızca ödül ekranını görmek başarı değildir.

## O3 uygulanan ekonomi ve hangar temeli

Yerel geliştirme profili 2.500 tam sayı krediyle başlar. Kargo görevi 1.400 kredi/+8 itibar ve 320 kg görev kargosu; keşif 1.050/+6, silahsız önleme 1.250/+7 verir. İki başlangıç kargo teklifi ilk yükseltmeye 2–3 başarılı görev içinde erişilmesini sağlar.

Yakıt 0,35 kredi/kg, genel kondisyon onarımı 10 kredi/yüzde puanı ve gelecekteki silah tüketimine ayrılmış mühimmat 2 kredi/kg'dır. Temsili 500 kg yakıt + 8 puan onarım + 40 kg mühimmat toplamı 335 kredi, 1.400 kredilik sıradan kargo gelirinin yaklaşık %24'üdür. Dört sabit yükseltme 4.700–6.000 kredi aralığındadır: sensör tarama süresi, kargo kapasitesi, itki ve yakıt kapasitesini gerçek sistem değerleri üzerinden değiştirir.

Fiyat, uyumluluk, slot, miktar, kapasite ve bakiye sunucuda doğrulanır. İstemci yalnız ürün/hizmet ve miktar niyetini gönderir; her işlem kararlı bir istek kimliğiyle en fazla bir kez uygulanır. Başarılı işlemin ücret ve envanter etkisi tek otoriter geçiştir. Bellek adaptörü Session 5 PostgreSQL sınırına uygun kimlikleri saklar, ancak süreçler arası kalıcılık sağlamaz.

Onarım bu aşamada yalnız genel kondisyon yüzdesidir; modül hasarı veya savaş sonucu üretimi O4 kapsamındadır. Mühimmat yalnız Raptor rezervidir; silah veya ateş etme yoktur. Rakamların yürütülebilir tek kaynağı `packages/shared/src/config.ts`, gemi ve yükseltme tanımlarının kaynağı `packages/shared/src/hangar.ts` dosyasıdır.
