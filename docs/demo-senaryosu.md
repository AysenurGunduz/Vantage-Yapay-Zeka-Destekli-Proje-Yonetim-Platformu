# Vantage — Demo Senaryosu

Bu doküman, Vantage'ın canlı bir sunumda baştan sona nasıl gösterileceğini adım adım anlatır. Toplam süre yaklaşık 12-15 dakika. Senaryo, tüm günlük PR'ların ana dala (main) alındığı varsayımıyla yazıldı.

## Hazırlık (demo başlamadan önce)

- İki tarayıcı penceresi aç. Biri ekip sahibi hesabıyla, diğeri davet edilecek ikinci bir hesapla giriş yapmış olsun.
- Yerel Ollama çalışıyor olsun, tüneli (`cloudflared`) başlat, Render'daki `OLLAMA_HOST` güncel olsun.
- Önceden boş bir organizasyon ve proje hazırlama — bunları demo sırasında canlı oluşturacağız.
- Canlı demo linki: https://vantage-proje.vercel.app

## 1. Giriş — Landing sayfası (1 dk)

Landing sayfasını göster. Ürünün ne olduğunu tek cümleyle özetle: proje yönetimi + yapay zeka katmanı. "Neden Vantage?" bölümündeki üç maddeye kısaca değin.

## 2. Kayıt ve organizasyon oluşturma (2 dk)

- "Kayıt ol" ile yeni bir hesap aç.
- Kullanım amacı sorusunu doldur (onboarding).
- Workspace ekranında yeni bir organizasyon oluştur.
- Yeni bir proje oluştur.

## 3. Yapay zeka ile görev bölme (2 dk)

- Proje açıklamasına bir cümle yaz (örn. "Kullanıcıların profil fotoğrafı yükleyip düzenleyebileceği bir ekran istiyoruz").
- "AI ile Öner" butonuna bas, üretilen görev listesini göster.
- Bir görevi düzenle, birini reddet, geri kalanını onayla.
- Vurgulanacak nokta: hiçbir öneri onay almadan gerçek göreve dönüşmüyor.

## 4. Kanban panosu ve canlı senkron (2 dk)

- Onaylanan görevleri Kanban panosunda göster.
- Bir görevi sürükleyip durum değiştir.
- İkinci tarayıcı penceresini aynı projede aç, değişikliğin anında yansıdığını göster.
- Bir görevi aç: öncelik, son tarih, etiket, atama, zaman takibi (kronometre veya manuel giriş), görev bağımlılığı alanlarını göster.

## 5. Gecikme riski skoru (1.5 dk)

- Dashboard'a geç, riskli görevler bölümünü göster.
- "Neden riskli, AI'a sor" butonuna bas, yapay zekanın ürettiği doğal dil açıklamayı oku.
- Vurgulanacak nokta: risk puanı kural tabanlı hesaplanıyor, yapay zeka sadece anlatıyor.

## 6. Ekip daveti (1.5 dk)

- Ekip Üyeleri sayfasından ikinci hesabın e-postasına davet gönder.
- İkinci tarayıcı penceresinde giriş yapılmış hesaba geç, bekleyen daveti panoda gör, tek tıkla kabul et.
- (Eğer e-posta servisi bağlıysa) gelen kutusuna düşen daveti göster.

## 7. Çalışma tarzı analizi ve atama önerisi (2 dk)

- İkinci kullanıcının profilinde öz-değerlendirme anketini doldur.
- Bir görev için "Önerilen Atamalar" panelini aç, önerilen kişiyi ve gerekçesini göster.
- Öneriyi kabul et, görevin atandığını göster.

## 8. Otomatik ilerleme özeti (1 dk)

- Bildirim zilini aç, üretilmiş bir ilerleme özetini göster.
- Aynı özetin dashboard'daki bölümde de göründüğünü göster.

## 9. Kapanış (1 dk)

- Test kapsamına kısaca değin: backend birim testleri, Playwright uçtan uca testler.
- Canlı demo linkini ve GitHub reposunu tekrar göster.
- Sorulara geç.

## Yedek plan

Yapay zeka çağrılarından biri yavaş kalırsa (özellikle arka plan modeli), önceden üretilmiş bir örnek ekran görüntüsüne geç ve süreci sözlü anlat. Tünel bir sebeple erişilemez olursa, yerel ortamda göstermeye geç.
