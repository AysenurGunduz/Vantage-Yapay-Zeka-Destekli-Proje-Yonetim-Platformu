import type { TaskPriority, WorkStyleTraits } from "./workStyle.js";

export interface AssignmentCandidate {
  userId: string;
  traits: WorkStyleTraits;
}

export interface TaskRequirements {
  priority: TaskPriority;
  dueDate: string | null;
  tags: string[];
}

export interface AssignmentSuggestion {
  userId: string;
  score: number;
  reasons: string[];
}

const TAG_WEIGHT = 40;
const RELIABILITY_WEIGHT = 35;
const SPEED_WEIGHT = 25;

// Uzak bir son tarihte tamamlama hızı ayırt edici değil, bu yüzden hız puanı
// sadece son tarih bu kadar gün ya da daha az kaldıysa devreye girer.
const SPEED_RELEVANT_WINDOW_DAYS = 14;

function tagFitScore(taskTags: string[], topTags: string[]): { score: number; reason: string | null } {
  if (taskTags.length === 0) {
    return { score: TAG_WEIGHT / 2, reason: null };
  }

  const normalizedTaskTags = taskTags.map((tag) => tag.toLowerCase());
  const normalizedTopTags = topTags.map((tag) => tag.toLowerCase());
  const overlap = normalizedTaskTags.filter((tag) => normalizedTopTags.includes(tag));

  if (overlap.length === 0) {
    return { score: 0, reason: null };
  }

  const score = (overlap.length / normalizedTaskTags.length) * TAG_WEIGHT;
  return { score, reason: `bu konularda deneyimli: ${overlap.join(", ")}` };
}

function reliabilityScore(onTimeRate: number | null, priority: TaskPriority): { score: number; reason: string | null } {
  if (onTimeRate === null) {
    return { score: RELIABILITY_WEIGHT / 2, reason: null };
  }

  const score = onTimeRate * RELIABILITY_WEIGHT;
  const isUrgent = priority === "high" || priority === "urgent";

  if (isUrgent && onTimeRate >= 0.8) {
    return { score, reason: "yüksek öncelikli görevlerde zamanında teslim geçmişi güçlü" };
  }
  if (isUrgent && onTimeRate < 0.5) {
    return { score, reason: "geçmişte gecikme eğilimi var, bu öncelikli görev yakından takip gerektirebilir" };
  }
  return { score, reason: null };
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function speedScore(
  avgCompletionDays: number | null,
  dueDate: string | null,
  referenceDate: Date,
): { score: number; reason: string | null } {
  if (avgCompletionDays === null || !dueDate) {
    return { score: SPEED_WEIGHT / 2, reason: null };
  }

  const daysUntilDue = Math.max(1, Math.ceil(daysBetween(referenceDate, new Date(dueDate))));
  if (daysUntilDue > SPEED_RELEVANT_WINDOW_DAYS) {
    return { score: SPEED_WEIGHT / 2, reason: null };
  }

  const ratio = Math.min(2, avgCompletionDays / daysUntilDue);
  const score = Math.max(0, SPEED_WEIGHT * (1 - ratio / 2));

  if (avgCompletionDays <= daysUntilDue) {
    return { score, reason: "bu son tarihe rahatlıkla yetişebilecek bir tamamlama hızına sahip" };
  }
  if (ratio >= 1.5) {
    return { score, reason: "geçmiş tamamlama hızına göre bu son tarih zorlayıcı olabilir" };
  }
  return { score, reason: null };
}

export function suggestAssignees(
  requirements: TaskRequirements,
  candidates: AssignmentCandidate[],
  referenceDate: Date = new Date(),
): AssignmentSuggestion[] {
  return candidates
    .map((candidate) => {
      const tag = tagFitScore(requirements.tags, candidate.traits.topTags);
      const reliability = reliabilityScore(candidate.traits.onTimeRate, requirements.priority);
      const speed = speedScore(candidate.traits.avgCompletionDays, requirements.dueDate, referenceDate);

      const reasons = [tag.reason, reliability.reason, speed.reason].filter((reason): reason is string => reason !== null);
      const score = Math.round(tag.score + reliability.score + speed.score);

      return { userId: candidate.userId, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
