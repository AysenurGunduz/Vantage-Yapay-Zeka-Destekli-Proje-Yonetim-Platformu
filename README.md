<p align="center"><img src="./docs/logo.png" width="280" alt="Vantage logo" /></p>

<h1 align="center">Vantage</h1>
<p align="center"><strong>Yapay Zeka Destekli Proje Yönetim Platformu</strong></p>

<p align="center">
  <img alt="Frontend" src="https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?style=flat-square&logo=react&logoColor=white">
  <img alt="Backend" src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?style=flat-square&logo=node.js&logoColor=white">
  <img alt="Database" src="https://img.shields.io/badge/Database-Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white">
  <img alt="AI" src="https://img.shields.io/badge/AI-Local%20LLM%20(Ollama)-1E293B?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/Durum-Tamamland%C4%B1-22C55E?style=flat-square">
</p>

Vantage, ekiplerin proje ve görev süreçlerini planlayıp Kanban panosu üzerinden takip edebildiği; buna ek olarak yapay zeka desteğiyle proje açıklamasından otomatik görev üretimi, öncelik/gecikme riski analizi, ekip üyesi çalışma tarzı analizi ve otomatik ilerleme özetleri sunan modüler bir web platformudur.

**Canlı demo:** [vantage-proje.vercel.app](https://vantage-proje.vercel.app) — yapay zeka özellikleri, yerel çalışan modeli dışarı açan tünel aktif olduğu sürece kullanılabilir.

> Detaylı teknik plan ve 20 günlük takvim için: [implementation_plan.md](./implementation_plan.md)

---

## Neden Vantage?

- **Tek platformda hem planlama hem yürütme** — organizasyon/proje/görev hiyerarşisi, Kanban, deadline ve atama; klasik bir proje yönetimi aracının sunduğu her şey
- **Yapay zeka gerçek bir asistan gibi çalışır** — proje açıklamasını görevlere böler, gecikme riskini önceden haber verir, ekip üyesinin çalışma tarzına göre atama önerir
- **Modüler ve genişletilebilir** — AI katmanı çekirdek platformdan tamamen ayrık; sağlayıcı değişse (local LLM → cloud API) bile geri kalan sistem etkilenmez

## Özellikler

**Çekirdek proje yönetimi**
- Organizasyon / proje / görev hiyerarşisi, rol tabanlı ekip üyeliği
- Kanban panosu üzerinde sürükle-bırak ile durum takibi (canlı senkronizasyon)
- Görevlere atama, öncelik, deadline, etiket, görevler arası bağımlılık
- Manuel veya kronometreyle süre takibi, tahmini/harcanan süre karşılaştırması
- Proje dashboard'u: durum istatistikleri, geciken görev takibi, aktivite geçmişi
- E-posta ile gönderilen ekip davetleri, davet edilen kullanıcının kendi hesabında bekleyen daveti görüp tek tıkla kabul edebilmesi

**Yapay zeka katmanı**
- **Otomatik görev bölme:** Doğal dilde yazılan proje/özellik açıklaması, önerilen görev listesine dönüştürülür (inceleyip düzenleyerek onaylanır)
- **Önceliklendirme & gecikme riski:** Kural tabanlı risk skoru + LLM tarafından üretilen doğal dil açıklaması
- **Çalışma tarzı analizi:** Ekip üyelerinin görev geçmişine dayalı kişiye özel profil çıkarımı, isteğe bağlı öz-değerlendirmeyle desteklenir
- **Atama önerisi:** Bir görev için, çalışma tarzı profiline göre en uygun ekip üyelerini kural tabanlı skorla önerir
- **Otomatik ilerleme özetleri:** Belirli aralıklarla proje durumunun özetlenip bildirim olarak sunulması

Her durumda ortak prensip aynı: sayısal skor ve kararlar kural tabanlı mantıkla hesaplanır, yapay zeka yalnızca sonucu doğal dille açıklar.

## Kullanıcı Akışı

Aşağıdaki akış, bir kullanıcının Vantage üzerinde bir projeyi baştan sona nasıl yürüttüğünü ve yapay zekânın bu sürece hangi noktalarda dahil olduğunu gösterir.

```mermaid
flowchart TD
    A[Giriş yap] --> B[Organizasyon oluştur / katıl]
    B --> C[Yeni proje oluştur]
    C --> D[Proje açıklamasını yaz]
    D --> E{{AI açıklamayı analiz eder}}
    E --> F{{AI görevleri otomatik oluşturur}}
    F --> G[Kullanıcı görevleri düzenler ve onaylar]
    G --> H[Görevler Kanban panosuna eklenir]
    H --> I[Takım üyelerine atanır]
    I --> J{{AI gecikme riskini analiz eder}}
    I --> K{{AI çalışma tarzını analiz eder}}
    J --> L{{AI otomatik ilerleme özeti oluşturur}}
    K --> L
    L --> M[Proje tamamlanır]

    classDef ai fill:#1E293B,stroke:#1E293B,color:#ffffff;
    class E,F,J,K,L ai;
```

Koyu renkli adımlar (altıgen şekiller), yapay zekânın sürece dahil olduğu noktaları temsil eder — geri kalanı kullanıcının doğrudan yönettiği adımlardır.

## Mimari

```mermaid
flowchart LR
    FE["React + Vite\n(Frontend)"] -->|REST API| BE["Node.js + Express\n(Backend)"]
    BE --> DB[("Supabase\nPostgres · Auth · Realtime")]
    BE --> AI["Ollama\n(Local LLM)"]
    DB -.->|canlı güncellemeler| FE
```

Frontend ve backend birbirinden bağımsız iki uygulama; backend hem Supabase ile hem de local LLM ile konuşan tek katman. AI sağlayıcısı `AIProvider` arayüzü arkasında soyutlandığı için Ollama'nın yerine ileride başka bir sağlayıcı geçebilir.

## Neden Ollama?

Vantage'ın yapay zeka katmanı, bulut tabanlı bir API yerine bilinçli olarak local bir LLM'in (Ollama) üzerine kuruldu. Bu tercih yalnızca "internet olmadan da çalışsın" kolaylığından değil, bir dizi teknik ve stratejik gerekçeden geliyor:

- **Veri gizliliği:** Proje açıklamaları, görev geçmişi ve çalışma tarzı verileri hiçbir zaman üçüncü taraf bir servise gönderilmez, tamamen yerelde kalır
- **Sıfır API maliyeti:** Model çağrısı başına ücretlendirme yok; geliştirme ve test sürecinde sınırsız deneme yapılabilir
- **İnternet bağımsızlığı:** Model bir kez indirildikten sonra tamamen çevrimdışı çalışabilir
- **Hızlı iterasyon:** Prompt ve model değişiklikleri anında test edilebilir; dış servis gecikmesi veya rate limit derdi yok
- **Sağlayıcıdan bağımsız mimari:** AI katmanı `AIProvider` arayüzü arkasında soyutlandığı için Ollama nihai bir karar değil, bilinçli bir başlangıç noktası — ileride OpenAI, Gemini veya başka bir sağlayıcıya geçmek tek bir dosya değişikliğiyle mümkün
- **Kolay yerel test:** Ekstra kurulum veya API anahtarı gerekmeden, geliştirme ortamında uçtan uca test edilebilir

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React, TypeScript, Vite, TailwindCSS, shadcn/ui, dnd-kit, Recharts |
| Backend | Node.js, Express, TypeScript |
| Veritabanı / Auth / Realtime | Supabase (Postgres) |
| Yapay zeka | Local LLM ([Ollama](https://ollama.com)) — sağlayıcıdan bağımsız `AIProvider` soyutlaması ile |
| E-posta | [Resend](https://resend.com) — davet e-postaları için |
| Test | Vitest (backend birim testleri), Playwright (uçtan uca testler) |
| Deployment | Vercel (frontend), Render (backend), Cloudflare Tunnel (yerel Ollama'yı dışarı açmak için) |

## Proje Yapısı

```
vantage/
├── frontend/     # React + Vite istemci uygulaması
├── backend/      # Express API + AI orkestrasyonu
├── e2e/          # Playwright uçtan uca testleri
├── docs/         # ERD, logo ve ek dokümantasyon
└── implementation_plan.md
```

## Yol Haritası

20 iş günü, 4 haftalık faz halinde ilerliyor. Gün gün detaylar için [implementation_plan.md](./implementation_plan.md).

| Hafta | Odak |
|-------|------|
| 1 | Temel altyapı — auth, proje/görev CRUD, Kanban panosu |
| 2 | Çekirdek proje yönetimi özelliklerinin tamamlanması — roller, dashboard, realtime senkron |
| 3 | AI katmanı — local LLM entegrasyonu, otomatik görev bölme, gecikme riski skoru |
| 4 | İleri AI özellikleri — çalışma tarzı analizi, otomatik ilerleme özetleri, teslim |

## Kurulum

Gereksinimler: Node.js 20+, bir [Supabase](https://supabase.com) projesi, [Ollama](https://ollama.com) yüklü bir makine.

1. **Supabase şemasını uygula** — `backend/src/db/schema.sql` dosyasının içeriğini Supabase projenin SQL Editor'ünde çalıştır.

2. **Ollama'yı hazırla** — kullanılacak modelleri indir:
   ```bash
   ollama pull qwen2.5:3b-instruct-q4_K_M
   ollama pull qwen2.5:7b-instruct-q4_K_M
   ```

3. **Backend'i kur ve çalıştır:**
   ```bash
   cd backend
   npm install
   cp .env.example .env   # Supabase URL/anahtarlarını ve Ollama ayarlarını doldur
   npm run dev             # http://localhost:4000
   ```

4. **Frontend'i kur ve çalıştır:**
   ```bash
   cd frontend
   npm install
   cp .env.example .env    # aynı Supabase URL/anon key + backend adresini doldur
   npm run dev              # http://localhost:5173
   ```

5. **Testleri çalıştır (isteğe bağlı):**
   ```bash
   cd backend && npm test           # birim testleri (Vitest)
   npx playwright test               # uçtan uca testler (repo kökünden, önce npm install)
   ```

## Geliştirme Durumu

20 günlük staj takvimi tamamlandı. Güncel ilerleme ve gün gün plan için [implementation_plan.md](./implementation_plan.md) dosyasına bakınız.

## Lisans

Bu depo [LICENSE](./LICENSE) dosyasında belirtilen lisans altındadır.
