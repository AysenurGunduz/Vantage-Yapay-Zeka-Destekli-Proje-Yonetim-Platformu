import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { backgroundAI } from "../ai/index.js";
import { calculateWorkStyleTraits, type WorkStyleTaskInput, type WorkStyleTraits, type TaskPriority } from "../services/workStyle.js";

export const userWorkStyleRouter = Router({ mergeParams: true });

userWorkStyleRouter.use(requireAuth);

async function shareOrganization(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return true;

  const [{ data: orgsA }, { data: orgsB }] = await Promise.all([
    supabase.from("organization_members").select("organization_id").eq("user_id", userIdA),
    supabase.from("organization_members").select("organization_id").eq("user_id", userIdB),
  ]);

  const orgIdsA = new Set((orgsA ?? []).map((row) => row.organization_id as string));
  return (orgsB ?? []).some((row) => orgIdsA.has(row.organization_id as string));
}

function describeOnTimeRate(rate: number | null): string {
  if (rate === null) return "veri yok";
  if (rate >= 0.8) return "çoğunlukla zamanında teslim ediyor";
  if (rate >= 0.5) return "bazen gecikiyor";
  return "sık sık gecikmeli teslim ediyor";
}

function describeCompletionSpeed(days: number | null): string {
  if (days === null) return "veri yok";
  if (days <= 2) return "hızlı tamamlıyor";
  if (days <= 5) return "orta hızda tamamlıyor";
  return "yavaş tamamlıyor";
}

function describeEffortAccuracy(ratio: number | null): string {
  if (ratio === null) return "veri yok";
  if (ratio <= 0.85) return "tahmininden erken bitiriyor";
  if (ratio <= 1.15) return "efor tahminlerini genelde tutturuyor";
  return "efor tahminlerini sıkça aşıyor";
}

const PRIORITY_LABELS_TR: Record<TaskPriority, string> = {
  low: "düşük",
  medium: "orta",
  high: "yüksek",
  urgent: "acil",
};

function dominantPriority(priorityMix: Record<TaskPriority, number>): string | null {
  const entries = Object.entries(priorityMix) as [TaskPriority, number][];
  const [topPriority, topCount] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  return topCount > 0 ? PRIORITY_LABELS_TR[topPriority] : null;
}

function buildWorkStyleAnalysisPrompt(traits: WorkStyleTraits): string {
  const priority = dominantPriority(traits.priorityMix);
  const tagsLine =
    traits.topTags.length > 0
      ? `En sık çalıştığı konular: ${traits.topTags.join(", ")}.`
      : "Belirgin bir konu yoğunlaşması yok.";

  return `Sen bir proje yöneticisi asistanısın. Bir ekip üyesinin tamamladığı ${traits.completedTaskCount} göreve dayanan şu gözlemlere bakarak, bu kişinin çalışma tarzını 2-3 cümlelik doğal bir Türkçe paragrafla anlat:
- Teslim tarihine uyma eğilimi: ${describeOnTimeRate(traits.onTimeRate)}
- Görev tamamlama hızı: ${describeCompletionSpeed(traits.avgCompletionDays)}
- Efor tahmini isabeti: ${describeEffortAccuracy(traits.effortAccuracy)}
- En sık üstlendiği öncelik seviyesi: ${priority ?? "belirgin değil"}
${tagsLine}

Kurallar:
- Sadece yukarıda verilen gözlemlere dayan; burada verilmeyen hiçbir şeyi uydurma ya da varsayma.
- Hiçbir sayı ya da yüzde kullanma, sadece düz ve sade Türkçe yaz.
- Bir giriş cümlesiyle başlama, doğrudan değerlendirmeyle başla.
- Türkçe dışında hiçbir kelime kullanma.`;
}

export async function fetchTaskInputs(userId: string): Promise<WorkStyleTaskInput[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("status, priority, due_date, created_at, updated_at, estimated_hours, tags")
    .eq("assignee_id", userId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    estimatedHours: row.estimated_hours,
    // Görev başına harcanan süre kaydı şu an ana daldaki şemada yok; ileride
    // eklenirse burada doldurulacak, o zamana kadar efor isabeti hesaplanamıyor.
    spentHours: null,
    tags: row.tags ?? [],
  }));
}

userWorkStyleRouter.get("/", async (req, res) => {
  const { userId } = req.params as { userId: string };

  const allowed = await shareOrganization(req.user!.id, userId);
  if (!allowed) {
    res.status(403).json({ error: "You don't share an organization with this user" });
    return;
  }

  const { data, error } = await supabase
    .from("work_style_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "No work-style profile has been generated for this user yet" });
    return;
  }

  res.json(data);
});

userWorkStyleRouter.post("/generate", async (req, res) => {
  const { userId } = req.params as { userId: string };

  const allowed = await shareOrganization(req.user!.id, userId);
  if (!allowed) {
    res.status(403).json({ error: "You don't share an organization with this user" });
    return;
  }

  let taskInputs: WorkStyleTaskInput[];
  try {
    taskInputs = await fetchTaskInputs(userId);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not load task history" });
    return;
  }

  const traits = calculateWorkStyleTraits(taskInputs);

  if (traits.completedTaskCount === 0) {
    res.status(200).json({ traits, summary: null });
    return;
  }

  let summary: string;
  try {
    summary = await backgroundAI.generateText(buildWorkStyleAnalysisPrompt(traits));
  } catch {
    res.status(502).json({ error: "Çalışma tarzı analizi üretilemedi, tekrar dener misin?" });
    return;
  }

  const { data: saved, error } = await supabase
    .from("work_style_profiles")
    .insert({
      user_id: userId,
      traits,
      summary,
      model_used: "background",
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(saved);
});
