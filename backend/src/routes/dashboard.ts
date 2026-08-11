import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { calculateDelayRisk, calculateProjectVelocity } from "../services/riskScore.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const STATUSES = ["backlog", "todo", "in_progress", "review", "done"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const DUE_SOON_WINDOW_DAYS = 3;

function emptyStats() {
  return {
    totalTasks: 0,
    byStatus: Object.fromEntries(STATUSES.map((status) => [status, 0])),
    byPriority: Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])),
    overdueTasks: [],
    dueSoonTasks: [],
    byProject: [],
  };
}

dashboardRouter.get("/stats", async (req, res) => {
  const { data: memberships, error: membershipError } = await supabase
    .from("project_members")
    .select("project_id, projects(name)")
    .eq("user_id", req.user!.id);

  if (membershipError) {
    res.status(500).json({ error: membershipError.message });
    return;
  }

  if (memberships.length === 0) {
    res.json(emptyStats());
    return;
  }

  const projectNames = new Map(
    memberships.map((row) => [row.project_id, (row.projects as unknown as { name: string } | null)?.name ?? "İsimsiz proje"])
  );
  const projectIds = [...projectNames.keys()];

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, project_id")
    .in("project_id", projectIds);

  if (tasksError) {
    res.status(500).json({ error: tasksError.message });
    return;
  }

  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    (typeof STATUSES)[number],
    number
  >;
  const byPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])) as Record<
    (typeof PRIORITIES)[number],
    number
  >;
  const projectTaskCounts = new Map<string, number>();

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonCutoff = new Date();
  dueSoonCutoff.setDate(dueSoonCutoff.getDate() + DUE_SOON_WINDOW_DAYS);
  const dueSoonCutoffStr = dueSoonCutoff.toISOString().slice(0, 10);

  const overdueTasks = [];
  const dueSoonTasks = [];

  for (const task of tasks) {
    byStatus[task.status as (typeof STATUSES)[number]] += 1;
    byPriority[task.priority as (typeof PRIORITIES)[number]] += 1;
    projectTaskCounts.set(task.project_id, (projectTaskCounts.get(task.project_id) ?? 0) + 1);

    if (task.due_date && task.status !== "done") {
      if (task.due_date < today) {
        overdueTasks.push(task);
      } else if (task.due_date <= dueSoonCutoffStr) {
        dueSoonTasks.push(task);
      }
    }
  }

  overdueTasks.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));
  dueSoonTasks.sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1));

  const byProject = projectIds
    .map((projectId) => ({
      project_id: projectId,
      project_name: projectNames.get(projectId)!,
      count: projectTaskCounts.get(projectId) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalTasks: tasks.length,
    byStatus,
    byPriority,
    overdueTasks,
    dueSoonTasks,
    byProject,
  });
});

const ACTIVITY_LIMIT = 15;

dashboardRouter.get("/activity", async (req, res) => {
  const { data: memberships, error: membershipError } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", req.user!.id);

  if (membershipError) {
    res.status(500).json({ error: membershipError.message });
    return;
  }

  const projectIds = memberships.map((row) => row.project_id);

  if (projectIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title")
    .in("project_id", projectIds);

  if (tasksError) {
    res.status(500).json({ error: tasksError.message });
    return;
  }

  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const taskIds = [...taskTitles.keys()];

  if (taskIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: activity, error: activityError } = await supabase
    .from("task_activity_log")
    .select("id, task_id, action_type, from_value, to_value, note, created_at")
    .in("task_id", taskIds)
    .order("created_at", { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (activityError) {
    res.status(500).json({ error: activityError.message });
    return;
  }

  res.json(
    activity.map((entry) => ({
      ...entry,
      task_title: taskTitles.get(entry.task_id) ?? "Silinmiş görev",
    }))
  );
});

const RISK_LIST_LIMIT = 10;

dashboardRouter.get("/risk", async (req, res) => {
  const { projectId: projectIdFilter } = req.query as { projectId?: string };

  const { data: memberships, error: membershipError } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", req.user!.id);

  if (membershipError) {
    res.status(500).json({ error: membershipError.message });
    return;
  }

  const projectIds = memberships.map((row) => row.project_id);

  if (projectIds.length === 0) {
    res.json([]);
    return;
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, project_id, created_at, updated_at, estimated_hours")
    .in("project_id", projectIds);

  if (tasksError) {
    res.status(500).json({ error: tasksError.message });
    return;
  }

  const doneTasksByProject = new Map<string, { created_at: string; updated_at: string }[]>();
  for (const task of tasks) {
    if (task.status !== "done") continue;
    const list = doneTasksByProject.get(task.project_id) ?? [];
    list.push({ created_at: task.created_at, updated_at: task.updated_at });
    doneTasksByProject.set(task.project_id, list);
  }

  const velocityByProject = new Map<string, number | null>();
  for (const projectId of projectIds) {
    velocityByProject.set(projectId, calculateProjectVelocity(doneTasksByProject.get(projectId) ?? []));
  }

  const openTaskIds = tasks.filter((task) => task.status !== "done").map((task) => task.id);
  const spentMinutesByTask = new Map<string, number>();
  if (openTaskIds.length > 0) {
    const { data: timeEntries, error: timeEntriesError } = await supabase
      .from("task_time_entries")
      .select("task_id, minutes")
      .in("task_id", openTaskIds);

    if (timeEntriesError) {
      res.status(500).json({ error: timeEntriesError.message });
      return;
    }

    for (const entry of timeEntries) {
      spentMinutesByTask.set(entry.task_id, (spentMinutesByTask.get(entry.task_id) ?? 0) + entry.minutes);
    }
  }

  const risky = tasks
    .filter((task) => task.status !== "done")
    .filter((task) => !projectIdFilter || task.project_id === projectIdFilter)
    .map((task) => {
      const spentMinutes = spentMinutesByTask.get(task.id);
      const risk = calculateDelayRisk({
        status: task.status as (typeof STATUSES)[number],
        dueDate: task.due_date,
        createdAt: task.created_at,
        projectAvgCompletionDays: velocityByProject.get(task.project_id) ?? null,
        estimatedHours: task.estimated_hours,
        spentHours: spentMinutes !== undefined ? spentMinutes / 60 : null,
      });

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        project_id: task.project_id,
        risk_score: risk.score,
        risk_level: risk.level,
      };
    })
    .filter((task) => task.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, RISK_LIST_LIMIT);

  res.json(risky);
});
