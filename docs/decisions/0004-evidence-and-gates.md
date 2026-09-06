# ADR 0004 — İncelenmiş kanıt ve kabul kapısı

Durum: kabul, O1. Ekran görüntüsünün oluşması, testin yazılması veya kısa FPS sayısı tek başına kabul değildir. Komutlar gerçekten çalıştırılır; girişler keyboard/mouse ile, güven sınırı HTTP/WS üzerinden doğrulanır. Debug yalnızca okur. Reset ayrı token'lı loopback test dünyasıyla sınırlıdır.

Baselinelar sadece actual/expected görseller incelendikten sonra değişir. Referans yenileme ardından değişiklik yapmadan compare koşusu geçmelidir. Donanım/browser/backend/viewport/ısınma/süre etiketlenir; software sonuç referans GPU diye sunulmaz. Ajan UI ve görsel incelemesi, Murat'ın öznel oyun hissi kabulünü üretmez. Eksik veri veya insan onayı raporda unverified kalır; sonraki oturum kendiliğinden başlatılmaz.
