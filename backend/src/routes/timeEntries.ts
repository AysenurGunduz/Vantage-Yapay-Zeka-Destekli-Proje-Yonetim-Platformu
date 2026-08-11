import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getTaskWithMembership, logActivity } from "./tasks.js";

export const taskTimeEntriesRouter = Router({ mergeParams: true });

taskTimeEntriesRouter.use(requireAuth);

taskTimeEntriesRouter.get("/", async (req, res) => {
  const { taskId } = req.params as { taskId: string };
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
    .from("task_time_entries")
    .select("id, user_id, minutes, note, logged_at")
    .eq("task_id", taskId)
    .order("logged_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const totalMinutes = data.reduce((sum: number, entry: { minutes: number }) => sum + entry.minutes, 0);

  res.json({ entries: data, totalMinutes, estimatedHours: task.estimated_hours });
});

taskTimeEntriesRouter.post("/", async (req, res) => {
  const { taskId } = req.params as { taskId: string };
  const { minutes, note } = req.body as { minutes?: number; note?: string };

  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) {
    res.status(400).json({ error: "minutes must be a positive number" });
    return;
  }

  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: entry, error } = await supabase
    .from("task_time_entries")
    .insert({
      task_id: taskId,
      user_id: req.user!.id,
      minutes: Math.round(minutes),
      note: note?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await logActivity(taskId, req.user!.id, "time_logged", null, `${Math.round(minutes)} dk`, note);

  res.status(201).json(entry);
});
