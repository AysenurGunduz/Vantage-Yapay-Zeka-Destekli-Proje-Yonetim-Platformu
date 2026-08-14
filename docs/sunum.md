# Vantage — Sunum Taslağı

20 günlük geliştirme sürecinin sonunda yapılacak kapanış sunumunun taslağı. Her başlık bir slayt.

---

## 1. Başlık

- Vantage
- Yapay Zeka Destekli Proje Yönetim Platformu
- 20 günlük geliştirme süreci

## 2. Problem

- Proje yönetimi çoğu zaman manuel iş yükü demek
- Görev bölmek, riskleri takip etmek, doğru kişiye atamak, ilerlemeyi özetlemek zaman alıyor
- Bu işlerin bir kısmı otomatikleştirilebilir — ama güvenilir bir şekilde

## 3. Vantage nedir

- Kanban tabanlı bir proje/görev yönetim platformu
- Üzerine kurulu bir yapay zeka katmanı
- İki katman birbirinden bağımsız, biri diğerini bloklamıyor

## 4. Çekirdek özellikler

- Organizasyon / proje / görev hiyerarşisi, rol tabanlı ekip üyeliği
- Kanban panosu, sürükle-bırak, canlı senkronizasyon
- Zaman takibi, görev bağımlılıkları, etiket/öncelik/deadline
- Dashboard: durum istatistikleri, geciken görev takibi

## 5. Yapay zeka katmanı

- Otomatik görev bölme (onay adımıyla)
- Kural tabanlı gecikme riski skoru + doğal dil açıklaması
- Çalışma tarzı analizi ve atama önerisi
- Otomatik ilerleme özetleri

## 6. Temel prensip

- Sayı ve kararlar her zaman kural tabanlı kodla hesaplanır
- Yapay zekanın rolü, bu sonucu doğal dille açıklamakla sınırlı
- Neden: tutarlılık ve açıklanabilirlik, tahmine dayalı güven değil

## 7. Mimari

- Frontend: React + Vite
- Backend: Node.js + Express
- Veritabanı / Auth / Realtime: Supabase
- Yapay zeka: yerel çalışan Ollama, sağlayıcıdan bağımsız soyutlama arkasında

## 8. Neden local LLM

- Veri gizliliği — hiçbir veri üçüncü tarafa gitmiyor
- Sıfır API maliyeti
- Donanım kısıtına göre iki katmanlı model stratejisi (hızlı/küçük + nitelikli/büyük)

## 9. Kalite ve test

- Backend birim testleri (Vitest)
- Uçtan uca testler (Playwright) — kritik akışlar
- Çok açılı kod incelemesiyle bulunan gerçek hataların düzeltilmesi

## 10. Canlı deployment

- Frontend: Vercel
- Backend: Render
- Yerel yapay zeka modeli, güvenli bir tünelle canlı ortama açık
- Demo linki: vantage-proje.vercel.app

## 11. Canlı demo

- Uygulama canlı ortamda baştan sona gösterilir

## 12. Süreçte öğrenilenler

- Git/GitHub disiplinini gerçek bir ekip akışı gibi uygulamak
- Yapay zekaya ne kadar yetki verileceğine karar vermek
- İlk gerçek merge conflict deneyimi ve sistemli çözüm yaklaşımı

## 13. Sonraki adımlar

- Sabit adresli bir tünel/domain ile daha kalıcı bir canlı ortam
- Daha geniş test kapsamı
- Ek yapay zeka özellikleri için aynı "kural + açıklama" deseninin sürdürülmesi

## 14. Teşekkürler

- Sorular
