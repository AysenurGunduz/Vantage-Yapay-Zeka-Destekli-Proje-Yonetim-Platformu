// Demo/sunum için sentetik görev geçmişi oluşturur, böylece çalışma tarzı
// analizini gerçek bir haftalar süren kullanım beklemeden gösterebiliriz.
// Çalıştırmak için (backend/ dizininden): npx tsx src/scripts/seedWorkStyleDemo.ts [email]
import "dotenv/config";
import { supabase } from "../lib/supabaseClient.js";
import { slugify } from "../lib/slug.js";

const DEMO_EMAIL = process.argv[2] ?? "demo-work-style@vantage.dev";
const DEMO_PASSWORD = "DemoPass123!";
const ORG_NAME = "Work Style Demo Org";
const PROJECT_NAME = "Work Style Demo Project";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function findOrCreateDemoUser(): Promise<string> {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (!error && created.user) return created.user.id;

  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === DEMO_EMAIL);
  if (!existing) throw new Error(`Could not create or find demo user ${DEMO_EMAIL}: ${error?.message}`);
  return existing.id;
}

async function findOrCreateDemoProject(userId: string): Promise<string> {
  const { data: existingMembership } = await supabase
    .from("organization_members")
    .select("organization_id, organizations(name)")
    .eq("user_id", userId);

  const existingOrgId = existingMembership?.find(
    (row) => (row.organizations as unknown as { name: string } | null)?.name === ORG_NAME,
  )?.organization_id;

  let orgId = existingOrgId;
  if (!orgId) {
    const slug = `${slugify(ORG_NAME)}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: org, error } = await supabase
      .from("organizations")
      .insert({ name: ORG_NAME, slug, owner_id: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    orgId = org.id;

    await supabase.from("organization_members").insert({ organization_id: orgId, user_id: userId, role: "owner" });
  }

  const { data: existingProject } = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", orgId)
    .eq("name", PROJECT_NAME)
    .maybeSingle();

  if (existingProject) return existingProject.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ organization_id: orgId, name: PROJECT_NAME, created_by: userId })
    .select("id")
    .single();
  if (projectError) throw new Error(projectError.message);

  await supabase.from("project_members").insert({ project_id: project.id, user_id: userId, role_in_project: "owner" });

  return project.id;
}

type SyntheticTask = {
  title: string;
  status: "done" | "in_progress" | "todo";
  priority: "low" | "medium" | "high" | "urgent";
  tags: string[];
  estimatedHours: number | null;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  dueDaysAgo: number | null; // null = no due date
};

// Karakter: çoğunlukla backend/API işleriyle uğraşan, önceliği yüksek işleri
// üstlenen, çoğunlukla zamanında ama bazen geciken, orta hızda tamamlayan biri.
// Not: "on time" = updatedAt <= due_date (gün olarak). daysAgo(n) = şimdi - n gün,
// yani daha büyük n = daha eski an. Zamanında olması için updatedDaysAgo,
// dueDaysAgo'dan en az 1-2 gün büyük olmalı (yani tamamlama, vadeden daha eskiye
// denk gelmeli); tam tersi durumda gecikmiş sayılır. Saat farkı belirsizliğine
// karşı aralarda en az 2 günlük pay bırakıyoruz.
const SYNTHETIC_TASKS: SyntheticTask[] = [
  { title: "Kimlik doğrulama API'sini yaz", status: "done", priority: "high", tags: ["backend", "api"], estimatedHours: 6, createdDaysAgo: 40, updatedDaysAgo: 37, dueDaysAgo: 35 },
  { title: "Ödeme webhook entegrasyonu", status: "done", priority: "urgent", tags: ["backend", "api"], estimatedHours: 8, createdDaysAgo: 36, updatedDaysAgo: 33, dueDaysAgo: 31 },
  { title: "Kullanıcı profil endpoint'i", status: "done", priority: "medium", tags: ["backend"], estimatedHours: 3, createdDaysAgo: 33, updatedDaysAgo: 29, dueDaysAgo: 27 },
  { title: "Rate limiting middleware'i", status: "done", priority: "high", tags: ["backend", "api"], estimatedHours: 4, createdDaysAgo: 29, updatedDaysAgo: 24, dueDaysAgo: 26 }, // geç
  { title: "Bildirim servisini kur", status: "done", priority: "medium", tags: ["backend"], estimatedHours: 5, createdDaysAgo: 25, updatedDaysAgo: 21, dueDaysAgo: 19 },
  { title: "Veritabanı indeks optimizasyonu", status: "done", priority: "low", tags: ["backend", "database"], estimatedHours: 2, createdDaysAgo: 21, updatedDaysAgo: 19, dueDaysAgo: null },
  { title: "Dosya yükleme API'si", status: "done", priority: "high", tags: ["backend", "api"], estimatedHours: 5, createdDaysAgo: 19, updatedDaysAgo: 14, dueDaysAgo: 16 }, // geç
  { title: "Arama endpoint'ini hızlandır", status: "done", priority: "urgent", tags: ["backend", "api"], estimatedHours: 6, createdDaysAgo: 14, updatedDaysAgo: 11, dueDaysAgo: 9 },
  { title: "E-posta şablonlarını güncelle", status: "done", priority: "low", tags: ["backend"], estimatedHours: 2, createdDaysAgo: 11, updatedDaysAgo: 9, dueDaysAgo: 7 },
  { title: "Yetkilendirme rollerini genişlet", status: "done", priority: "medium", tags: ["backend", "api"], estimatedHours: 4, createdDaysAgo: 9, updatedDaysAgo: 6, dueDaysAgo: 4 },
  { title: "Loglama altyapısını iyileştir", status: "done", priority: "medium", tags: ["backend"], estimatedHours: 3, createdDaysAgo: 6, updatedDaysAgo: 3, dueDaysAgo: 1 },
  { title: "İkinci faktör doğrulama", status: "in_progress", priority: "high", tags: ["backend", "api"], estimatedHours: 6, createdDaysAgo: 4, updatedDaysAgo: 4, dueDaysAgo: -3 },
  { title: "API dokümantasyonunu yaz", status: "todo", priority: "low", tags: ["backend"], estimatedHours: 3, createdDaysAgo: 2, updatedDaysAgo: 2, dueDaysAgo: -10 },
];

async function main() {
  const userId = await findOrCreateDemoUser();
  const projectId = await findOrCreateDemoProject(userId);

  const rows = SYNTHETIC_TASKS.map((t) => ({
    project_id: projectId,
    title: t.title,
    status: t.status,
    priority: t.priority,
    tags: t.tags,
    estimated_hours: t.estimatedHours,
    assignee_id: userId,
    created_by: userId,
    due_date: t.dueDaysAgo === null ? null : daysAgo(t.dueDaysAgo).slice(0, 10),
    created_at: daysAgo(t.createdDaysAgo),
    updated_at: daysAgo(t.updatedDaysAgo),
  }));

  const { data: inserted, error } = await supabase.from("tasks").insert(rows).select("id");
  if (error) throw new Error(error.message);

  console.log(`${inserted.length} sentetik görev oluşturuldu, kullanıcı: ${DEMO_EMAIL} (${userId})`);
  console.log(`Analiz üretmek için: POST /api/users/${userId}/work-style/generate`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
