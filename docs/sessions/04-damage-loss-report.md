# Oturum 4 — Hasar / kayıp / kurtarma pass raporu

Tarih: 2026-09-07. Durum: **DAMAGE / LOSS / RECOVERY UYGULANDI; NİHAİ İNSAN PLAYTEST'İ VE KABUL İÇİN HAZIR.**

## Hasar ve bot

ENGINE, FUEL, POWER ve WEAPON yüzde kondisyonu sunucu state'inde tutulur. Hasar dağılımı deterministik ve sunucu taraflıdır. ENGINE itkiyi %35 taban ile kondisyon arasında ölçekler; FUEL her isabette güvenli ve sonlu yakıt kaybı üretir; POWER enerji dolumunu ve tavanını düşürür; WEAPON hasarı verimi azaltır ve %25 altında lazer/füzeyi kapatır. Kütle ve kondisyon değerleri sıfırın altına düşmez.

R-17 botu PATROL/ATTACK/REPOSITION/DESTROYED durumlarını kullanır. Yetkili temasta hedef alır, enerji/mühimmat/cooldown tüketerek lazer ve füze ateşler, küçük deterministik yeniden konumlanma yapar ve imha sonrası durur.

## İmha, kayıp ve kurtarma

Sıfır gövde yalnız sunucuda imha üretir. Kontrol, manevra ve silahlar kapanır; gelen aktif füzeler güvenle sonlandırılır; etkin görev ödülsüz FAILED olur. Tek enkaz kaydı kaybedilen görev/normal kargoyu, mühimmatı ve yükseltme kimliklerini gelecek salvage uyumu için saklar.

Sigorta talebi yalnız transaction id taşır. Sunucu kaybedilen aracı, kapsamı, 600 kredilik Raptor muafiyetini ve replacement içeriğini belirler. Bakiye yeterliyse yükseltmesiz/boş Raptor; yetersizse ücretsiz temel Kestrel verilir. Aynı veya farklı ikinci talep ikinci araç/ücret üretemez. Yeni araç tam gövde/alt sistem, başlangıç yakıtı, sıfır kargo/mühimmat ve oynanabilir hangar durumu ile döner.

## Doğrulama

- Final statik/type/lint kontrolü geçti.
- Hasar, bot, imha, kayıp, sigorta, görev ve protokol hedef testleri: 4 dosya, 36/36 geçti.
- Tam unit/integration regresyonu: 15 dosya, 81/81 geçti.
- `intercept` kazanma journey'si geçti: gerçek UI ile hedef tanımlama, karşı tedbir, dört doğrulanmış lazer isabeti, iki simüle füze, hedef imhası ve tek ödül.
- `intercept` kayıp journey'si geçti: bot hasarı, görev başarısızlığı, imha, 600 kredi claim ve oynanabilir Raptor hangarına dönüş.
- `missile_hit` journey'si geçti: füze isabeti, görünür modül kaybı, imha ve recovery.
- Production build geçti: 154 modül; CSS 24,41 kB (gzip 6,30 kB), JS 1.216,28 kB (gzip 344,53 kB). Final `git diff --check` hatasız tamamlandı.

## Görsel ve performans

Chrome/WebGL2, Intel UHD Graphics, 1920×1080, DPR 1 üzerinde en fazla üç görüntü alındı ve son kez incelendi: `damaged-ship-hud.png`, `destruction-loss.png`, `insurance-replacement.png`. Modül sonuçları, gövde sıfırı, kayıp özeti, claim ve teslim sonucu okunuyor; engelleyici kusur yok.

283 karelik kısa örnekte 15 draw call, 54.454 üçgen, frame p95 49,0 ms ölçüldü. Sunucu tick p95 1,57 ms, p99 3,20 ms oldu. Bu Intel UHD kısa örneği hedef GTX 1660/RTX 2060 kabul ölçümü değildir.

## Kalan kabul

Genel salvage oynanışı, gelişmiş AI, filo savaşı ve Session 5 sistemleri kapsam dışı bırakıldı. Kalan Oturum 4 işleri insan combat-feel playtest'i, denge ayarı, gerekirse geri bildirim düzeltmesi, hedef GPU doğrulaması ve kullanıcı kabulüdür. Otomatik/teknik kapsam açısından engelleyici açık yoktur.
