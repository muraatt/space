# Oturum 4 — Savaş temeli pass raporu

Tarih: 2026-09-07. Durum: **COMBAT FOUNDATION UYGULANDI; DAMAGE/LOSS PASS İÇİN HAZIR.**

## Oynanabilir savaş akışı

`intercept` sahnesi mühimmatlı Raptor ile başlar. Oyuncu fraksiyon seçer, önleme görevini alır, hedefi tanımlar, görev kaynaklı ateş yetkisini görür, gelen füzeye karşı tedbir kullanır, R-17 temasını seçer ve lazer veya güdümlü füzeyle 40 otoriter hasara ulaşır. Görev bir kez tamamlanır ve ödül bir kez yazılır. Hedef, lazer hattı ve aktif füzeler mevcut camera-relative renderer katmanında gösterilir.

## Kurallar ve otorite

SAFE silah kullanımını reddeder. NORMAL yalnız tanımlanmış etkin önleme hedefini kabul eder. CONTESTED uygun temasa izin verir. Ateş sonrası combat tag beş dakika sürer ve SAFE alana girmek etiketi temizlemez. Hedef seçimi; self, bilinmeyen, uygunsuz veya yok edilmiş hedefleri reddeder.

Lazer menzil, görüş hattı, 32 derecelik atış yayı, cooldown, enerji ve ısı denetiminden geçer. Kabul/red, enerji, ısı, isabet ve hasar ayrı otoriter olaylardır. Güdümlü füze mühimmat tüketir, cooldown uygular ve sunucuda sınırlı ivmeli bir varlık olarak yaşar; hedefe doğru deterministik ilerler, swept collision/proximity fuse ile bir kez hasar verir veya süresi dolunca kaybolur. Karşı tedbir yük ve cooldown tüketir, menzildeki en yakın gelen aktif füzeyi deterministik biçimde saptırır.

İstemci hasar veya isabet gönderemez. Tüm savaş komutları benzersiz command id ile tekilleştirilir; hasar olayları ayrıca damage id ile tekilleştirilir. Client yalnız intent gönderir ve snapshot/ack sonucunu gösterir.

## Doğrulama

- `node scripts/check.mjs`: geçti.
- Hedefli shared/simulation/server testleri: 5 dosya, 35/35 geçti.
- Gerçek UI `intercept` journey: 1/1 geçti; gelen füze, karşı tedbir, hedef seçimi, oyuncu füzesi, füze isabeti, lazer ve tekil 1.250 kredi ödül doğrulandı.
- Final görsel test: 1/1 geçti. Chrome/WebGL2, 1920×1080, DPR 1. `incoming-countermeasure.png`, `target-laser.png`, `intercept-combat.png` bir kez incelendi; hedef göstergesi, lazer hattı, gelen tehdit ve görev ilerlemesi görünür, engelleyici kusur yok.
- Tam unit/integration regresyonu: 14 dosya, 73/73 geçti.
- Production build: 154 modül, geçti; ana JS gzip 343,70 kB.

## Performans

Kısa görsel kanıt örneği Chrome 1920×1080 DPR 1, WebGL2 ve Intel UHD Graphics üzerinde alındı: 19 draw call, 54.854 üçgen, 108 kare, frame p95 41,8 ms; aynı örnekte bir aktif füze vardı. Sunucu tick p95 1,15 ms, p99 1,45 ms ölçüldü. Intel UHD sonucu hedef GTX 1660/RTX 2060 referans ölçümü değildir ve kısa örnek kalıcı 60 FPS kabulü vermez. Panel React güncellemeleri snapshot ritmiyle sınırlıdır; render katmanı temas/füze nesnelerini yeniden kullanır.

## Bilinen sınırlar ve giriş kapısı

Bu pass genel gövde değerini ve hasar olayını taşır fakat gövdeyi 1'in altında tutarak imhayı özellikle engeller. Modül hasarı, gemi imhası, enkaz/kargo/modül kaybı, savaş botu davranışı, sigorta/yenileme, `missile_hit` sahnesi ve son efekt/ses geri bildirimi uygulanmamıştır. NORMAL görev hedefi scriptli tek bir füze saldırısı yapar; genel savaş AI değildir. İnsan nişan hissi ve hedef GPU performansı doğrulanmamıştır.

Damage/loss pass giriş koşulu karşılandı: otoriter bölge/izin kuralları, hedefleme, iki silah, simüle füze, savunma, combat tag, silahlı önleme, güven sınırı testleri, gerçek UI journey ve incelenmiş görsel kanıt hazırdır.
