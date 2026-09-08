# ORBITAL · Earth Operations

Tarayıcıda çalışan, bilimsel temelli bir yörünge oyunu. **Mevcut kapsam Oturum 4 hasar/kayıp/kurtarma:** Dünya yörüngesinde yerel otoriter sunucu, görev/ekonomi/hangar döngüsü, bölge kuralları, hedefleme, lazer, güdümlü füze, karşı tedbir, dört alt sistemli hasar, savaş botu, imha, enkaz/kayıp ve temel sigorta dönüşü bulunur. Kalıcı hesap ve çok oyunculu oyun henüz yoktur.

## Yerel çalıştırma

Windows 10/11, Node.js 24 LTS, pnpm 11.19.0 ve güncel Chrome/Edge gerekir. GPU hızlandırması açık olmalıdır. İlk kurulum paket indirmek için internet gerektirir; oyun varlıkları repository içindedir, çalışırken dış servis gerekmez.

```powershell
cd C:\Users\Murat\Desktop\Oyun
pnpm install --frozen-lockfile
pnpm dev
```

Tarayıcı: **http://127.0.0.1:5173**. Sunucu sağlık kontrolü: http://127.0.0.1:8787/health. Terminalde Ctrl+C ile durdur. `pnpm` kurulu değilse Node kurulumundan sonra `npm install --global pnpm@11.19.0` kullan. Portlar doluysa önce önceki oyun terminalini kapat; çalışan başka uygulamaları sonlandırma.

WebGPU tercih edilir. Kullanılamıyorsa Three.js WebGL2'ye geçer; alt sağ köşe gerçek backend'i gösterir. WebGL2'yi açıkça denemek için http://127.0.0.1:5173/?backend=webgl2 kullan. Yüksek performanslı GPU istenir; işletim sistemi son seçimi yapar.

**Kumandayı devral** düğmesine bas. W/S ileri/geri, A/D yanal, R/F dikey itki; oklar yön, Q/E yatış. Fareyi sürükle ve tekerlekle yaklaş/uzaklaş. C kamerayı toparlar, F3 ayrıntıları açar. Space girdileri bırakır; fiziksel hızı sıfırlamaz. Arayüze odaklanınca itki kesilir. Başka bir yerel sekme açılırsa tek geliştirme pilotu yeni sekmeye geçer. Yenileme ve gündüz/gece geçişi uçuşu sıfırlar; bu bir kayıt veya yeniden bağlanma sistemi değildir.

**Manevra bilgisayarı** hedef yörüngeyi seçer, sunucudan ekonomik/dengeli/hızlı seçenekleri ister ve seçilen planı otoriter sunucuda yürütür. Yanma veya coast sırasında panelden iptal edilebilir. `?scene=orbit_maneuver` oynanabilir plan akışını, `?scene=low_fuel` gerçek Δv/yakıt reddini açar.

**Görev kontrolü** iki başlangıç fraksiyonundan birini seçtirir; kargo, keşif ve silahsız önleme işlerini mevcut manevra bilgisayarına bağlar. `?scene=cargo_mission` hızlı ekonomi testi için teslim halkasında başlar. İki başlangıç kargo işinden sonra **Hangar ve servis** panelinden Raptor'a geçilebilir, yakıt/tamir/mühimmat tamamlanabilir ve ilk yükseltme kurulabilir. Bu geliştirme evreni bellek tabanlıdır; sunucu yeniden başlatılınca profil sıfırlanır.

**Ateş kontrolü** bölge ve görev yetkisini, seçilebilir teması, lazer enerji/ısı durumunu, füze mühimmatını, karşı tedbirleri, gelen tehdidi ve otoriter olay akışını gösterir. `?scene=intercept` Raptor ile kısa silahlı önleme akışını açar: görevi kabul et, hedefi tanımla, gelen füzeye karşı tedbir kullan, hedefi seç ve lazer/füzeyle etkisizleştir. NORMAL bölgede yalnız görev yetkili hedefe; CONTESTED bölgede uygun temaslara ateş edilir; SAFE bölgede silahlar sunucu tarafından reddedilir.

Hasar ENGINE itkisini, FUEL eldeki yakıtı, POWER lazer dolumunu ve enerji tavanını, WEAPON ise silah verimini/çalışabilirliğini düşürür. Sıfır gövde gemiyi tek seferde imha eder; görev başarısız olur, kargo/mühimmat/yükseltmeler enkaz kaydına geçer. Ateş kontrolündeki sigorta düğmesi Raptor için 600 kredi muafiyetle aynı aracı, bakiye yetmezse ücretsiz temel Kestrel'i verir. `?scene=missile_hit` gelen füze, görünür modül hasarı, imha ve kurtarmayı otomatik gösteren kısa test sahnesidir.

## Doğrulama

```powershell
pnpm check
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
pnpm test:visual
```

Testler kurulu Chrome'u kullanır. Playwright ayrı, yalnızca loopback'e bağlı 5174/8788 test dünyasını otomatik başlatıp kapatır. Normal dünyada reset/test HTTP uçları kapalıdır. Görsel referanslar Windows/Chrome için saklanır; farklı tarayıcı/GPU sürümü fark üretirse görüntüyü incelemeden yenileme.

Performans ölçümü için `pnpm dev` kapalı olmalı; script üretim önizlemesini kendi başlatır:

```powershell
pnpm build
pnpm perf
$env:PERF_BACKEND='webgl2'
pnpm perf
Remove-Item Env:PERF_BACKEND
```

Varsayılan her koşu: Chrome, 1920×1080, DPR 1, 60 saniye ısınma + 300 saniye örnekleme. `PERF_BROWSER=msedge` Edge'i seçer. `PERF_SECONDS` ve `PERF_WARMUP` kısa smoke denemeleri içindir; bunları tam performans kabulü olarak raporlama. Çıktılar `artifacts/session-01` altında. Ölçüm sırasında başka bir oyun sekmesi açma: tek pilotu devralır ve örneklemeyi bozar.

## Repository ve kesin kaynaklar

| Alan                  | Sahiplik                                                         |
| --------------------- | ---------------------------------------------------------------- |
| `packages/shared`     | Sürüm, runtime komut şemaları, SI birimleri, konfigürasyon       |
| `packages/simulation` | Saf TS durum geçişi; Three.js, ağ ve duvar saati yok             |
| `packages/server`     | Komut doğrulama, otoriter fizik saati, snapshot, bellek adaptörü |
| `packages/client`     | React DOM arayüzü, bağımsız Three.js renderer, girdi toplama     |
| `packages/test-tools` | Senaryolar, gerçek kumanda yolculukları, görsel/perf kanıtı      |

Önce [AGENTS](AGENTS.md), [yol haritası](docs/roadmap.md), [vertical slice](docs/vertical_slice.md) ve [son oturum raporu](docs/sessions/04-damage-loss-report.md) okunur. Sayısal çalışma değerlerinin tek kaynağı [config](packages/shared/src/config.ts); belgelerdeki gelecek kuralları uygulanmış özellik sayılmaz.

[Vizyon](docs/vision.md) · [oyun tasarımı](docs/game_design.md) · [fizik sözleşmesi](docs/physics_contract.md) · [multiplayer](docs/multiplayer_architecture.md) · [ekonomi](docs/economy.md) · [art bible](docs/art_bible.md) · [arayüz](docs/user_interface.md) · [test](docs/testing.md) · [riskler](docs/risk_register.md) · [ADR](docs/decisions/0001-stack-and-boundaries.md).

PostgreSQL/Docker, Oturum 5'in kalıcılık hedefidir. `compose.yaml` yalnızca ileride kullanılacak profile ait rezervdir; ilk dört oturumun çalışması Docker'a bağlı değildir. `pnpm test:load` henüz uygulanmadığını bildirerek başarısız çıkar; geçer test gibi davranmaz.

Kaynak ve lisans kayıtları [asset manifest](assets/manifest.json) ve `assets/licenses` altında; oyun içindeki **Kaynaklar** düğmesinde atıflar vardır. Kullanıcıya ait proje kodu için henüz genel açık kaynak lisansı seçilmedi. Üçüncü taraf varlıkların kendi koşulları geçerlidir.
