# Oyun kuralları

## Uygulanan savaş temeli

Oturum 4 ilk geçişinde SAFE bölgeler ateşi reddeder, NORMAL bölgeler yalnız etkin önleme görevinin tanımlanmış hedefine izin verir, CONTESTED bölgeler uygun temaslara serbest ateş sağlar. Sunucu hedef uygunluğu, görüş hattı, menzil, atış yayı, cooldown, lazer enerjisi/ısısı ve mühimmatı doğrular. Lazer anlık otoriter isabet; füze ise sınırlı ivme, ömür ve swept collision kullanan sunucu varlığıdır. Karşı tedbir yalnız menzildeki en yakın aktif gelen füzeyi saptırır ve yük/cooldown tüketir. Sayısal değerlerin kaynağı `packages/shared/src/config.ts` dosyasıdır.

Önleme görevi hedef tanımlanınca NORMAL bölge ateş yetkisi verir. Görev, hedef gövdesi sıfıra ulaşıp sunucu tekil imha olayını ürettiğinde bir kez tamamlanır. ENGINE, FUEL, POWER ve WEAPON hasarı sırasıyla itkiyi, eldeki yakıtı, lazer enerji dolumunu/tavanını ve silah verimini değiştirir. Oyuncu imhası etkin görevi başarısız yapar; yük ve sigortasız yükseltmeler enkaza yazılır. Raptor 600 kredi muafiyetle yenilenir; bakiye yetmezse oynanabilir temel Kestrel ücretsiz sağlanır.

Bu belge kullanıcının nihai tasarım kararlarını tutar. **Oturum 1'de yalnızca sabit kütleli geminin doğrudan itki/yön kontrolü uygulanmıştır.** Aşağıdaki diğer sistemler kendi oturumlarında uygulanacak sözleşmelerdir.

## Uçuş — O1/O2

Transferlerde manevra bilgisayarı, yakın operasyonda doğrudan itki ve yön kontrolü kullanılır. Kimyasal itki mevcut/yakın gelecek düzeyindedir. Işınlanma, oyuncu başına/global time-warp veya sınırsız yakıtı final ekonomi kuralı yapan bir kestirme kullanılmaz. O1'in yakıtsız sabit kütleli geliştirme aracı yalnızca uçuş temelidir; O2 kütle/yakıt ve manevra planını ekler.

## PvP — O4, oyuncular arası uygulama O5

İstasyon ve başlangıç merkezleri çevresinde silah kullanımı engellenir. Normal bölgelerde karşılıklı PvP onayı veya görevin çatışma yetkisi gerekir. Açık işaretli çekişmeli bölgelerde serbest PvP vardır; girişten önce risk uyarısı gösterilir. Yetki, atış anında ve hedef/hasar çözümünde sunucuda denetlenir. Güvenli bölgeden ateş etme ve savaş sırasında güvenliğe geçerek hasarı anında silme istismarları engellenir; sınır durumu tek tick'te sunucuda kararlaştırılır. Karmaşık polis, suç ve diplomatik yaptırımlar slice dışıdır.

## Araç kaybı — O4

Kargo ve tüketilmiş yakıt/mühimmat kaybolur. Sigortasız bazı yükseltmeler kaybedilebilir veya enkaza düşebilir. Tamir/yenileme parasal sonuç doğurur. Temel başlangıç aracı sigorta ile geri verilir; hesap seviyesi, itibar, açılan teknoloji ve görev geçmişi silinmez. Sigorta tek aktif temel araç, devredilemeyen/satılamayan temel modüller ve tekrarlı talep denetimiyle para üretme aracı olamaz. Sayısal bedeller O3–4 denge konfigürasyonuna eklenir, O1'de para kodu yoktur.

## Çıkış/bağlantı — O5

Güvenli istasyona yanaşan gemi kaydedilir ve dünyadan kaldırılır. Uzayda normal çıkış gemiyi 120 saniye bırakır. Son 60 saniyede saldırmış/hasar almış oyuncu combat tag taşır; gemisi 5 dakika kalır. İstemsiz kopmada savunmacı otomatik mod yeni saldırı başlatmaz. Devam eden transfer ve manevra sunucu görev durumu olarak saklanır. Yeniden bağlantı mevcut gemi/göreve döner. Süre dolarken güncellenen combat tag ve eşzamanlı bağlantı olayları atomik durum geçişleri olmalıdır. Saatlerce tam gemi fiziği yerine zaman damgalı soyut transfer kullanılabilir; savaşı soyut duruma geçirerek kaçış sağlanmaz.

## Birlikte oynama — O3/O5

İki ana fraksiyondan başlangıç seçimi O3'te gelir. En çok dört kişilik geçici squad; ortak görev, hedef, konum ve hedefleme bilgisi paylaşımı O5 kapsamıdır. Ödül görev kabulünde belirlenen paylaşım veya katkı kuralıyla, bir kez dağıtılır. Kalıcı klan, şirket, ittifak ve oyuncu devleti ilk sürümde yoktur.
