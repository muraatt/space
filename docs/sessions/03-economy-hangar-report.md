# Oturum 3 — Ekonomi / hangar pass raporu

Tarih: 2026-09-07. Durum: **ECONOMY / HANGAR PASS UYGULANDI; NİHAİ İNSAN PLAYTEST'İ VE KABUL BEKLİYOR.**

## Oynanabilir döngü

Oyuncu iki başlangıç kargo işini tamamlayarak 2.800 kredi kazanabilir, hangarı açabilir, Kestrel ve Raptor'u karşılaştırıp aktif aracını değiştirebilir, yakıt/onarım/mühimmat hizmeti alabilir ve ilk sabit yükseltmesini kurabilir. Ardından görev kontrolüne dönüp keşif veya silahsız önleme görevi kabul edebilir. Tüm bakiye, envanter, araç seçimi, kapasite ve görev sonucu sunucu snapshot'ından gelir; akış debug aracı gerektirmez.

## Araçlar ve yükseltmeler

Kestrel lojistik rolünde 6.000 kg kuru kütle, 2.000 kg yakıt, 24 kN ana itki ve 1.200 kg kargo kapasitesine sahiptir. Raptor devriye rolünde 5.200 kg kuru kütle, 1.600 kg yakıt, 34 kN ana itki, 250 kg kargo ve 120 kg mühimmat rezervi taşır. Raptor ayrı çağrı kodu ve daha dar/uzun renderer varyantıyla tanınır; bu geçiş silah veya savaş sistemi eklemez.

Tam dört yükseltme vardır: Genişletilmiş Yakıt Hücresi (+400 kg), Yüksek Debili Enjektör (+%15 ana/yan itki), Modüler Kargo Rafı (+500 kg, yalnız Kestrel) ve Keşif Sensör Dizisi (%35 daha kısa tarama). Sabit slotlar, araç uyumluluğu, tekil kurulum ve fiyat sunucuda doğrulanır. Manevra adayları ve HUD, aktif aracın/yükseltmenin gerçek itki, Isp, kütle ve yakıt kapasitesini kullanır.

## Hizmetler ve işlem güvenliği

Yakıt hizmeti mevcut Session 2 propellant modelini kg cinsinden doldurur ve Δv'yi değiştirir. Onarım, Session 4 hasarı gelene kadar genel kondisyon yüzdesini kullanır. Mühimmat Raptor'a bağlı tek rezervdir; ateş etme sistemi yoktur. İşlemler yalnız servis yörünge bantlarında ve etkin görev/manevra yokken kabul edilir.

İstemci fiyat, bakiye veya sonuç gönderemez. Sunucu pozitif miktar, kapasite, uyumluluk, slot ve yeterli kredi denetimlerini ücret yazmadan önce tamamlar. İşlem kimliği başarılı sonuçla birlikte kaydedilir; tekrar gönderim ikinci ücret veya ikinci teslim üretmez. Bakiye tam sayıdır ve negatif olamaz.

## Önleme temeli ve denge

`INTERCEPT` görevi listede görünür, kabul edilir, 400 km röle hedefine mevcut planner ile ulaşmayı ve sunucu tarafında kimlik doğrulamayı ister. Ödül 1.250 kredi/+7 itibardır ve yalnız bir kez verilir. Silah, düşman AI, hasar, imha ve savaş ödülü eklenmedi.

Yakıt 0,35 kredi/kg, onarım 10 kredi/yüzde ve mühimmat 2 kredi/kg'dır. Temsili rutin servis paketi 335 krediyle 1.400 kredilik kargo brütünün %23,9'udur. En ucuz anlamlı yükseltme 4.700 kredidir; 2.500 başlangıç bakiyesiyle bir görev sonrası erişilemez, iki kargo görevi sonrası erişilir. Değerler `CONFIG` ve sabit hangar tanımlarında sürümlüdür.

## Doğrulama

- `node scripts/check.mjs`: geçti.
- Hedefli protokol/mission/economy testleri: 4 dosya, 28/28 geçti.
- Tam unit/integration regresyonu: 12 dosya, 61/61 geçti.
- Production build: 150 modül, geçti; ana JS gzip 339,76 kB.
- Hangar/economy gerçek UI journey: 1/1 geçti; iki görev, 5.300 kredi, Raptor seçimi, üç hizmet, sensör kurulumu, 35 kredi bakiye ve önleme hedefinin planner'a aktarımı doğrulandı.
- Final görsel test: 1/1 geçti. En fazla üç kanıt üretildi ve bir kez incelendi: `artifacts/session-03/hangar.png`, `services-upgrades.png`, `raptor-interception.png`. Chrome/WebGL2, 1920×1080, DPR 1. Engelleyici görsel hata görülmedi.
- Journey sırasında 1920×1080 alt HUD'un hangar düğmesini örttüğü bulundu; sol eylem rayı footer sınırında kaydırılabilir yapıldı ve journey geçti.
- Windows Playwright `webServer` kapanışı assertion sonucu sonrasında beklemede kalıyor; test sunucuları elle kapatıldı. Assertion sonuçları geçmiştir, harness cleanup açığı sürer.

## Bilinen sınırlar ve giriş kapısı

Onarım yalnız genel kondisyon, mühimmat yalnız stok temeli, ilerleme ise bellek tabanlıdır. Uzun süreli ekonomi hissi, kullanıcıya göre ilk yükseltme temposu ve normal 400 km başlangıcından tam görev-servis-dönüş döngüsü insan playtest'iyle henüz onaylanmadı. Referans GTX 1660/RTX 2060 GPU ölçümü bu pass'te yapılmadı.

Kod ve otomasyon kapsamında Session 3 ekonomi/hangar geçişini engelleyen açık hata yoktur. Nihai Session 3 kabulünün giriş koşulu karşılandı: görevden para kazanma, iki araç, üç hizmet, dört gerçek etkili yükseltme, silahsız önleme, otoriter işlem güvenliği, regresyon ve görsel kanıt hazırdır. Kalan işler ekonomi ayarı, nihai manuel playtest ve kullanıcı kabulüdür.
