export interface ProjectProgressData {
  projectId: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  totalTasks: number;
  completedInPeriod: string[];
  inProgressCount: number;
  overdueCount: number;
  completionRatePercent: number;
}

export function buildProgressSummaryPrompt(data: ProjectProgressData): string {
  const list =
    data.completedInPeriod.length > 0
      ? data.completedInPeriod.map((title) => `- ${title}`).join("\n")
      : "(bu dönemde tamamlanan görev yok)";

  return `Sen bir proje yöneticisi asistanısın. "${data.projectName}" projesi için ${data.periodStart} - ${data.periodEnd} tarihleri arasını kapsayan bir ilerleme özeti yaz.

Kesin veriler (sadece bunlara dayan, başka hiçbir şey uydurma):
- Toplam görev sayısı: ${data.totalTasks}
- Bu dönemde tamamlanan görev sayısı: ${data.completedInPeriod.length}
- Şu anda devam eden görev sayısı: ${data.inProgressCount}
- Süresi geçmiş görev sayısı: ${data.overdueCount}
- Genel tamamlanma oranı: yüzde ${data.completionRatePercent}

Bu dönemde tamamlanan görevler:
${list}

Kurallar:
- 3-4 cümlelik doğal bir Türkçe paragraf yaz, madde işareti kullanma.
- Ekibi bilgilendirmeyi amaçlayan, profesyonel ama sade bir üslup kullan.
- Yukarıda verilmeyen hiçbir sayı ya da görev adı ekleme.
- Bir giriş cümlesiyle başlama, doğrudan özetle başla.`;
}

export interface TaskProgressRow {
  status: string;
  title: string;
  due_date: string | null;
  updated_at: string;
}

export function collectProjectProgressData(
  projectId: string,
  projectName: string,
  tasks: TaskProgressRow[],
  periodStart: Date,
  periodEnd: Date,
): ProjectProgressData {
  const totalTasks = tasks.length;
  const today = periodEnd.toISOString().slice(0, 10);

  const completedInPeriod = tasks
    .filter((t) => t.status === "done" && new Date(t.updated_at) >= periodStart && new Date(t.updated_at) <= periodEnd)
    .map((t) => t.title);

  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;
  const overdueCount = tasks.filter((t) => t.status !== "done" && t.due_date !== null && t.due_date < today).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const completionRatePercent = totalTasks === 0 ? 0 : Math.round((doneCount / totalTasks) * 100);

  return {
    projectId,
    projectName,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    totalTasks,
    completedInPeriod,
    inProgressCount,
    overdueCount,
    completionRatePercent,
  };
}
