export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface WorkStyleTaskInput {
  status: string;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  estimatedHours: number | null;
  spentHours: number | null;
  tags: string[];
}

export interface WorkStyleTraits {
  completedTaskCount: number;
  // 0-1 arası oran; teslim tarihi olan tamamlanmış görev yoksa null.
  onTimeRate: number | null;
  // Görev oluşturulmasından tamamlanmasına kadar geçen ortalama gün sayısı.
  avgCompletionDays: number | null;
  // spentHours / estimatedHours ortalaması; 1'in altı erken bitirme, üstü aşma anlamına gelir.
  effortAccuracy: number | null;
  // En sık çalışılan en fazla 3 etiket.
  topTags: string[];
  priorityMix: Record<TaskPriority, number>;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function calculateWorkStyleTraits(tasks: WorkStyleTaskInput[]): WorkStyleTraits {
  const completed = tasks.filter((t) => t.status === "done");

  const dueDatedCompleted = completed.filter((t) => t.dueDate !== null);
  const onTimeRate =
    dueDatedCompleted.length === 0
      ? null
      : dueDatedCompleted.filter((t) => new Date(t.updatedAt) <= new Date(t.dueDate!)).length / dueDatedCompleted.length;

  const completionDays = completed.map(
    (t) => (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  const avgCompletionDays = average(completionDays);

  const effortRatios = completed
    .filter((t) => t.estimatedHours != null && t.estimatedHours > 0 && t.spentHours != null)
    .map((t) => t.spentHours! / t.estimatedHours!);
  const effortAccuracy = average(effortRatios);

  const tagCounts = new Map<string, number>();
  for (const task of completed) {
    for (const tag of task.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  const priorityMix: Record<TaskPriority, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
  for (const task of completed) {
    priorityMix[task.priority] += 1;
  }

  return {
    completedTaskCount: completed.length,
    onTimeRate,
    avgCompletionDays,
    effortAccuracy,
    topTags,
    priorityMix,
  };
}
