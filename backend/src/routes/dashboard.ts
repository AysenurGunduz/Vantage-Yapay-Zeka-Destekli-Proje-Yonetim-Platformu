import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";

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

dashboardRouter.get("/my-tasks", async (req, res) => {
  const { data: memberships, error: membershipError } = await supabase
    .from("project_members")
    .select("project_id, projects(name)")
    .eq("user_id", req.user!.id);

  if (membershipError) {
    res.status(500).json({ error: membershipError.message });
    return;
  }

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const projectNames = new Map(
    memberships.map((row) => [row.project_id, (row.projects as unknown as { name: string } | null)?.name ?? "İsimsiz proje"])
  );
  const projectIds = [...projectNames.keys()];

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, project_id, tags")
    .eq("assignee_id", req.user!.id)
    .in("project_id", projectIds)
    .neq("status", "done");

  if (tasksError) {
    res.status(500).json({ error: tasksError.message });
    return;
  }

  const myTasks = tasks
    .map((task) => ({ ...task, project_name: projectNames.get(task.project_id) ?? "İsimsiz proje" }))
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    });

  res.json(myTasks);
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
