# ADR 0003 — İlk günden otorite, kalıcılık O5'te

Durum: kabul, O1. Client-only transform simülasyonu hızlı bir demo verse de multiplayer'da baştan yazım gerektireceği için seçilmedi. Yerel Node komut yolunu, sabit fizik saatini ve snapshot'ı şimdiden yönetir. Tek pilot lease ve memory repository yalnızca geliştirme kapsamıdır.

PostgreSQL, O5'te transactional ekonomi ve restart restore için seçilen kalıcı sistemdir. SQLite ilk gün daha az kurulum gerektirse de O5 eşzamanlı ödül/envanter işlemleri ve staging'de PostgreSQL geçişi ek iş yaratır. O1 memory adaptörü DB gibi davranan sahte kalıcılık sağlamaz; repository sınırı korunarak O5 transaction sözleşmesi eklenecektir. Docker rezerv profili çalıştırılmadı; O1–4 native Node gerektirir.

Global time-warp seçilmez. Uzun yolculuklar O2'de sürümlü zaman damgalı görev/transfer kaydı, yakın uçuş sabit adımlı fizik olur; O5 bu kayıtları kalıcılaştırır. O1'e placeholder hesap veya görev tabloları eklenmez.
