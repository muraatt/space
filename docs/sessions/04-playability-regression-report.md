# Oynanabilirlik regresyonu — 2026-09-07

Kapsam: mevcut Oturum 1–4 akışları; yeni oyun sistemi veya denge değişikliği yok.

## Engelleyici bulgular ve kök nedenler

- **BLOCKER — manevra reddinden sonra kumanda kilidi:** `execute()` iyimser kilidi hata yanıtında bırakılmıyordu. Ret, kopma ve yeni bağlantıda istek kilidi temizleniyor; kabul edilmiş etkin manevra kendi otoriter fazıyla manuel uçuşu kilitlemeye devam ediyor. Aynı planın tekrar reddinden sonra gerçek W girdisiyle regresyon doğrulaması eklendi.
- **BLOCKER — pencerelerin arkasındaki tıklamalar:** yardım/kaynak modalının katman sırası görev/hangar/savaş panellerinden düşüktü. Modal artık panellerin üzerinde; klavye odağı içeride tutuluyor, Escape ile uçuşa dönülüyor. 720p'de dört panelin her biri açıkken gerçek tıklamayla doğrulama eklendi.
- **BLOCKER — imha sonrası görünmeyen çıkış yolu:** canlı kullanıcı sekmesinde gövde %0 olmasına rağmen HUD `KUMANDA ETKİN` gösteriyordu; kurtarma kapalı panelin ve panel kaydırmasının arkasındaydı. İmha artık paneli açıyor, kurtarma kartı üstte, kalıcı bildirim ve ana eylem kurtarmaya götürüyor. Kapalı panelde imha → sigorta → gerçek itki testi eklendi.

## Küçük ve gerekli ciddi düzeltmeler

- Kumanda durumu gerçek bağlantı, odak, manevra ve imha durumunu ayırıyor. Uzay görünümüne tıklamak uçuşu etkinleştiriyor. Space sonrası basılı tuş tekrarı yeniden itki başlatmıyor.
- Kopuk socket'e komut göndermek artık sessizce sonsuz `hesaplanıyor` bırakmıyor. Kumandayı devral bağlantıyı yeniden kuruyor; eski socket olayları yeni bağlantının durumunu bozamıyor.
- Açık sekmeden kumandayı geri almak mevcut sunucu dünyasını koruyor. Bu yalnız yerel geliştirme pilotunun devridir; kalıcılık veya Oturum 5 reconnect sistemi değildir. Eski bağlantının geciken planner sonucu dünyayı değiştiremiyor.

## Doğrulama

- Hedefli kontroller: 12 itki/rotasyon girdisi, Space, kamera/fare, panel odak geçişi, 720p modal tıklamaları, tekrar manevra reddinden dönüş, sekme devri, bağlantı kopması, imha/yenilemeden gerçek uçuşa dönüş geçti.
- Keşif için yalnız izole ve token korumalı test reset uç noktasına 800 km başlangıç düzeni eklendi. Görev kabulü, beş saniyelik tarama ve ödül normal UI/sunucu yolunu kullanır. Uzun transferi bu kısa görev testi tekrar beklemez.
- Final statik/lint kontrolü ve production build geçti.
- Final tam birim/entegrasyon koşusu: 83/85 ilk denemede geçti; eşzamanlı derleme/tarayıcı yükünde iki planner süre testi sınırı aştı. Yalnız başarısız iki dosyanın ayrı doğrulama sonucu kapanışta eklenir.
- Final journey ve kısa canlı smoke sonuçları kapanışta eklenir.

Windows Playwright otomatik webServer temizliği önceki koşulardaki gibi assertion sonrasında takıldı. Final koşu aynı testleri, ayrı başlatılmış loopback test sunucusunda `artifacts/session-04/playability.config.ts` ile çalıştırır; oyun/test mimarisine yeni çatı eklenmedi.

## Ertelenenler

- Küçük metin/etiket tutarsızlıkları (eski Oturum numarası, bazı ham teknik hata kodları), dekoratif yerleşim ve silah geri bildirimi cilası bu geçişte ele alınmadı.
- Referans GPU kabulü ve insanın öznel savaş/uçuş hissi ayrı kalır. Yeni performans incelemesi yapılmadı.
