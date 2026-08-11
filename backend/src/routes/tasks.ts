import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { interactiveAI } from "../ai/index.js";
import { calculateDelayRisk, calculateProjectVelocity, type RiskScoreResult } from "../services/riskScore.js";

export const projectTasksRouter = Router({ mergeParams: true });
export const taskRouter = Router();

projectTasksRouter.use(requireAuth);
taskRouter.use(requireAuth);

const LOGGED_FIELDS = ["status", "priority", "due_date", "assignee_id", "tags"] as const;

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  }
  return a === b;
}

export async function logActivity(
  taskId: string,
  userId: string,
  actionType: string,
  fromValue: unknown,
  toValue: unknown,
  note?: string | null,
) {
  const { error } = await supabase.from("task_activity_log").insert({
    task_id: taskId,
    user_id: userId,
    action_type: actionType,
    from_value: stringifyValue(fromValue),
    to_value: stringifyValue(toValue),
    note: note?.trim() || null,
  });

  if (error) {
    console.error("Failed to log task activity:", error.message);
  }
}

async function getProjectMembership(projectId: string, userId: string) {
  const { data } = await supabase
    .from("project_members")
    .select("role_in_project")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

projectTasksRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };

  const membership = await getProjectMembership(projectId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

projectTasksRouter.post("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const { title, description, priority, due_date, assignee_id, tags } = req.body as {
    title?: string;
    description?: string;
    priority?: string;
    due_date?: string;
    assignee_id?: string;
    tags?: string[];
  };

  if (!title || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const membership = await getProjectMembership(projectId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority ?? "medium",
      due_date: due_date ?? null,
      assignee_id: assignee_id ?? null,
      tags: tags ?? [],
      created_by: req.user!.id,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await logActivity(task.id, req.user!.id, "created", null, task.title);

  res.status(201).json(task);
});

export async function getTaskWithMembership(taskId: string, userId: string) {
  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();

  if (!task) {
    return { task: null, membership: null };
  }

  const membership = await getProjectMembership(task.project_id, userId);
  return { task, membership };
}

taskRouter.get("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  res.json(task);
});

const UPDATABLE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "assignee_id",
  "estimated_hours",
  "due_date",
  "order_index",
  "tags",
] as const;

taskRouter.patch("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { assignee_note: assigneeNote } = req.body as { assignee_note?: string };

  const updates: Record<string, unknown> = {};
  for (const field of UPDATABLE_FIELDS) {
    if (field in req.body) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }
  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  for (const field of LOGGED_FIELDS) {
    if (field in updates && !valuesEqual(updates[field], task[field])) {
      const note = field === "assignee_id" ? assigneeNote : undefined;
      await logActivity(taskId, req.user!.id, field, task[field], updates[field], note);
    }
  }

  res.json(updated);
});

taskRouter.get("/:taskId/activity", async (req, res) => {
  const { taskId } = req.params;
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data, error } = await supabase
    .from("task_activity_log")
    .select("id, action_type, from_value, to_value, note, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

const LEVEL_LABELS_TR: Record<RiskScoreResult["level"], string> = {
  low: "düşük",
  medium: "orta",
  high: "yüksek",
};

function describeFactor(value: number): string {
  if (value >= 66) return "yüksek";
  if (value >= 33) return "orta";
  if (value > 0) return "düşük";
  return "yok";
}

function describeEffortOverrun(estimatedHours: number, spentHours: number): string {
  const ratio = spentHours / estimatedHours;
  if (ratio <= 1) return "harcanan süre tahminin içinde kalmış";
  if (ratio <= 1.25) return "harcanan süre tahmini biraz aşmış";
  if (ratio <= 1.75) return "harcanan süre tahmini belirgin şekilde aşmış";
  return "harcanan süre tahmini ciddi ölçüde aşmış";
}

function buildRiskExplanationPrompt(
  taskTitle: string,
  risk: RiskScoreResult,
  effort: { estimatedHours: number; spentHours: number } | null,
): string {
  const effortLine = effort
    ? `\nEfor karşılaştırması: ${describeEffortOverrun(effort.estimatedHours, effort.spentHours)}. Bundan kısaca bahset.`
    : "";

  return `Sen bir proje yöneticisi asistanısın. "${taskTitle}" adlı görevin gecikme riski kural tabanlı bir motorla ${LEVEL_LABELS_TR[risk.level]} olarak hesaplandı. Buna katkıda bulunan etkenler: son tarihe yakınlık ${describeFactor(risk.factors.deadline)}, beklenen ilerlemeye göre gecikme ${describeFactor(risk.factors.progress)}, projenin geçmiş tamamlama hızına göre risk ${describeFactor(risk.factors.velocity)}, harcanan/tahmini süre oranına göre risk ${describeFactor(risk.factors.effort)}.${effortLine}
Kullanıcıya bu durumu 2-3 cümlelik kısa, doğal bir Türkçe açıklamayla anlat: görev neden bu kadar riskli (ya da değilse neden değil) ve varsa kısa bir öneri ver. Hiçbir sayı, yüzde ya da İngilizce kelime kullanma; sadece düz, sade Türkçe yaz.`;
}

taskRouter.post("/:taskId/risk-explanation", async (req, res) => {
  const { taskId } = req.params;
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: doneTasks, error: doneTasksError } = await supabase
    .from("tasks")
    .select("created_at, updated_at")
    .eq("project_id", task.project_id)
    .eq("status", "done");

  if (doneTasksError) {
    res.status(500).json({ error: doneTasksError.message });
    return;
  }

  const { data: timeEntries, error: timeEntriesError } = await supabase
    .from("task_time_entries")
    .select("minutes")
    .eq("task_id", taskId);

  if (timeEntriesError) {
    res.status(500).json({ error: timeEntriesError.message });
    return;
  }

  const spentHours = (timeEntries ?? []).reduce((sum: number, entry: { minutes: number }) => sum + entry.minutes, 0) / 60;
  const estimatedHours: number | null = task.estimated_hours;
  const hasEffortData = estimatedHours != null && (timeEntries ?? []).length > 0;

  const risk = calculateDelayRisk({
    status: task.status,
    dueDate: task.due_date,
    createdAt: task.created_at,
    projectAvgCompletionDays: calculateProjectVelocity(doneTasks ?? []),
    estimatedHours,
    spentHours: hasEffortData ? spentHours : null,
  });

  let explanation: string;
  try {
    explanation = await interactiveAI.generateText(
      buildRiskExplanationPrompt(
        task.title,
        risk,
        hasEffortData ? { estimatedHours: estimatedHours!, spentHours } : null,
      ),
    );
  } catch {
    res.status(502).json({ error: "Risk açıklaması üretilemedi, tekrar dener misin?" });
    return;
  }

  res.status(200).json({ score: risk.score, level: risk.level, factors: risk.factors, explanation });
});

taskRouter.delete("/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const canDelete =
    membership.role_in_project === "owner" ||
    membership.role_in_project === "admin" ||
    task.created_by === req.user!.id;

  if (!canDelete) {
    res.status(403).json({ error: "Only a project admin/owner or the task creator can delete this task" });
    return;
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
});
