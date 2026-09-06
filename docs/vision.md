# Vizyon ve belge sahipliği

ORBITAL, Dünya çevresindeki sınırlı erişilebilir yörünge hedeflerinde lojistik, keşif ve çatışmayı birleştiren kalıcı uzay operasyonları oyunudur. Yakın gelecek kimyasal itkisinin sınırları içerik mesafesini belirler. Oyuncu denklemlerle değil, süre/yakıt/risk kararlarıyla uğraşır. İlk vertical slice iki fraksiyon ve 8–16 oyuncu hedefindedir; her sunucu bağımsız evren olur.

Temel döngü: fraksiyon ve araç → görev → hedef ve manevra seçimi → uçuş/yakın operasyon → teslimat veya çatışma → para/itibar → ikmal ve geliştirme. İlk ulaşılabilir hedefler 20–40 dakikalık oyuncu oturumlarına sığar; uzun transferler sonraki oyuncu oturumlarına yayılır. Bu oyuncu oturumu, altı büyük **geliştirme oturumundan** farklıdır.

Eğlenceyi doğrulayacak üç varsayım: manevra bilgisayarının anlaşılır bir risk/ödül kararı oluşturması (O2), aynı uçuş mekaniğinin kargo görevinde de anlam taşıması (O3), önemli ama geri döndürülebilir gemi kaybının oyuncuyu devam etmeye teşvik etmesi (O4–6). Oturum 1 bu varsayımların doğrulandığını iddia etmez.

Uzun vadeli Ay/Mars, şirketler, ülkeler, diplomasi, üretim zincirleri ve evren geçişleri yalnızca vizyondur. İlk slice'a içerik veya servis olarak eklenmez. Sabit haftalık iş gücü varsayılmaz; uygulamayı Astra, tasarım/oyun hissi/görsel seçim ve insan playtestini Murat yürütür. Web backend ve Blender uzmanlığı Murat'tan beklenmez.

## Kaynak düzeni

| Belge / kod                | Kesin karar alanı                                           |
| -------------------------- | ----------------------------------------------------------- |
| vision                     | Kimlik, oyuncu vaadi, uzun vadeli sınır                     |
| vertical_slice / roadmap   | Kapsam, bağımlılık, altı oturum ve kabul kapıları           |
| game_design                | Kontrol, PvP, kayıp, çıkış ve birlikte oynama kuralları     |
| economy                    | NPC tabanı, para kaynakları/giderleri ve istismar sınırları |
| physics_contract           | Birimler, referans çerçeveleri, zaman ve doğruluk           |
| multiplayer_architecture   | Otorite, protokol, kalıcılık ve güven sınırı                |
| art_bible / user_interface | Görsel üretim ve etkileşim sözleşmesi                       |
| testing / sessions         | Doğrulama yöntemi / gerçekten çalıştırılan kanıt            |
| decisions                  | Alternatifler ve karar gerekçeleri                          |
| shared/src/config.ts       | Uygulanmış sürümlü sayısal ayarlar                          |
| shared/src/protocol.ts     | Uygulanmış runtime mesaj doğrulaması                        |
| assets/manifest.json       | Varlık kaynağı, lisansı ve dosya özeti                      |

Belgeler kod ayarlarını kopyalayıp ikinci bir ayar deposu oluşturmaz. Gelecek özellikler açıkça oturum numarasıyla etiketlenir. Test raporu planlanan test ile çalıştırılan testi ayrı tutar.
