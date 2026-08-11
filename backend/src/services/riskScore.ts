export type RiskTaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type RiskLevel = "low" | "medium" | "high";

export interface RiskScoreInput {
  status: RiskTaskStatus;
  dueDate: string | null;
  createdAt: string;
  projectAvgCompletionDays: number | null;
  estimatedHours?: number | null;
  spentHours?: number | null;
  now?: Date;
}

export interface RiskScoreResult {
  score: number;
  level: RiskLevel;
  factors: {
    deadline: number;
    progress: number;
    velocity: number;
    effort: number;
  };
}

const PROGRESS_BY_STATUS: Record<RiskTaskStatus, number> = {
  backlog: 0,
  todo: 15,
  in_progress: 50,
  review: 80,
  done: 100,
};

// Deadline yakınlığı en doğrudan sinyal olduğu için en yüksek ağırlığı alıyor;
// ilerleme yüzdesi (beklenen ilerlemeye göre gecikme) ikinci, geçmiş hız üçüncü sırada.
const DEADLINE_WEIGHT = 0.4;
const PROGRESS_WEIGHT = 0.35;
const VELOCITY_WEIGHT = 0.25;

// Harcanan süre / tahmini süre verisi olduğunda devreye giren bonus ağırlık.
// Veri yoksa toplam ağırlık 1.0'da kalır (eski davranış birebir korunur);
// veri varsa payda büyür ve efor faktörü orantılı olarak skora karışır.
const EFFORT_WEIGHT = 0.3;

// Son tarihe 14 gün ve altı kalan görevler için deadline riski 0'dan 100'e doğrusal artar.
const DEADLINE_RAMP_DAYS = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 66) return "high";
  if (score >= 33) return "medium";
  return "low";
}

export function calculateDelayRisk(input: RiskScoreInput): RiskScoreResult {
  if (input.status === "done") {
    return { score: 0, level: "low", factors: { deadline: 0, progress: 0, velocity: 0, effort: 0 } };
  }

  const now = input.now ?? new Date();
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const createdAt = new Date(input.createdAt);
  const daysRemaining = dueDate ? daysBetween(now, dueDate) : null;

  let deadline = 0;
  if (daysRemaining !== null) {
    deadline =
      daysRemaining < 0
        ? clamp(60 + Math.abs(daysRemaining) * 5, 0, 100)
        : clamp(100 - (daysRemaining / DEADLINE_RAMP_DAYS) * 100, 0, 100);
  }

  const actualProgress = PROGRESS_BY_STATUS[input.status];
  let progress: number;
  if (dueDate) {
    const totalWindow = daysBetween(createdAt, dueDate);
    if (totalWindow > 0) {
      const elapsedRatio = clamp(daysBetween(createdAt, now) / totalWindow, 0, 1.5);
      const expectedProgress = clamp(elapsedRatio * 100, 0, 100);
      progress = clamp(expectedProgress - actualProgress, 0, 100);
    } else {
      progress = clamp(100 - actualProgress, 0, 100);
    }
  } else {
    // Son tarih yoksa sinyal daha zayıf: sadece düşük ilerlemeye hafif bir risk ekle.
    progress = clamp((100 - actualProgress) * 0.5, 0, 100);
  }

  let velocity = 0;
  if (input.projectAvgCompletionDays !== null && daysRemaining !== null) {
    const remaining = Math.max(daysRemaining, 0.5);
    const ratio = input.projectAvgCompletionDays / remaining;
    velocity = clamp((ratio - 1) * 100, 0, 100);
  }

  // Harcanan süre tahmini aşmışsa (ratio > 1) risk artar; veri yoksa bu
  // faktör tamamen devre dışı kalır (ağırlığı toplama katılmaz).
  let effort = 0;
  let effortWeight = 0;
  if (input.estimatedHours != null && input.estimatedHours > 0 && input.spentHours != null) {
    const ratio = input.spentHours / input.estimatedHours;
    effort = clamp((ratio - 1) * 100, 0, 100);
    effortWeight = EFFORT_WEIGHT;
  }

  const totalWeight = DEADLINE_WEIGHT + PROGRESS_WEIGHT + VELOCITY_WEIGHT + effortWeight;
  const rawScore =
    deadline * DEADLINE_WEIGHT + progress * PROGRESS_WEIGHT + velocity * VELOCITY_WEIGHT + effort * effortWeight;
  const score = clamp(Math.round(rawScore / totalWeight), 0, 100);

  return {
    score,
    level: scoreToLevel(score),
    factors: {
      deadline: Math.round(deadline),
      progress: Math.round(progress),
      velocity: Math.round(velocity),
      effort: Math.round(effort),
    },
  };
}

export function calculateProjectVelocity(
  doneTasks: { created_at: string; updated_at: string }[],
): number | null {
  if (doneTasks.length === 0) {
    return null;
  }

  const totalDays = doneTasks.reduce(
    (sum, task) => sum + Math.max(daysBetween(new Date(task.created_at), new Date(task.updated_at)), 0),
    0,
  );

  return totalDays / doneTasks.length;
}
