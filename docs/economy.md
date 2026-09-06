# Ekonomi — O3/O4/O5 sözleşmesi

**O1'de ekonomi uygulanmadı.** Düşük oyuncu sayısında da çalışan NPC tabanı ilk sürümün gereğidir.

NPC görev üretir; yakıt, mühimmat, tamir ve temel gemi/modül satar; kargo ve keşif verisi alır. Taban fiyatlar ve erişilebilir temel ikmal ekonominin kilitlenmesini önler. Görev ödülü ve NPC alımı para kaynağı; yakıt/mühimmat/tamir/modül alımı ve kayıp yenilemesi para gideridir. İlk denge tablosu O3'te sürümlü shared tanımlarına konur; burada spekülatif fiyat tekrarı tutulmaz.

Oyuncular arası ticaret desteklenebilir ancak yüksek nüfus ekonomi için ön koşul olmaz. Tam oyuncu üretimi, madencilik, fabrikalar ve karmaşık tedarik zincirleri ertelenir; slice boyunca uygulanmaz.

O3 kabulü: tek oyuncu NPC'den görev alabilir, kargo/keşif/önleme görev akışını tamamlayabilir veya kaybedebilir, bir kez ödül alır, ikmal/tamir/yükseltme yapabilir. Tekrar gönderim, negatif miktar ve yetersiz bakiye denetlenir. O3 önleme görevi navigasyon hedefidir; silahlı çözüm O4'te eklenir. O4 temel sigorta ve kargo/modül kaybını ekler. Ücretsiz temel araç ve devredilemeyen ekipmanı satıp para basılamaz. O5 ödül/idempotency/transaction ve squad paylaşımı kalıcı sunucu üzerinde doğrulanır.

Riskler: kısa görevlerin yakıt giderini karşılamaması; ücretsiz araçlardan kaynak üretimi; sınırsız görev reset/ödül tekrarı; katkı paylaşımı istismarı. Testler son durum/bakiye/envanter değişimini doğrular; yalnızca ödül ekranını görmek başarı değildir.
