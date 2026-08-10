import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getTaskWithMembership, logActivity } from "./tasks.js";

export const taskCommentsRouter = Router({ mergeParams: true });

taskCommentsRouter.use(requireAuth);

taskCommentsRouter.get("/", async (req, res) => {
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
    .from("task_comments")
    .select("id, task_id, user_id, content, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

taskCommentsRouter.post("/", async (req, res) => {
  const { taskId } = req.params as { taskId: string };
  const { content } = req.body as { content?: string };

  if (!content || !content.trim()) {
    res.status(400).json({ error: "content is required" });
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

  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, user_id: req.user!.id, content: content.trim() })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  await logActivity(taskId, req.user!.id, "commented", null, content.trim().slice(0, 80));

  res.status(201).json(comment);
});

taskCommentsRouter.delete("/:commentId", async (req, res) => {
  const { taskId, commentId } = req.params as { taskId: string; commentId: string };
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: comment } = await supabase
    .from("task_comments")
    .select("id, user_id")
    .eq("id", commentId)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }

  const canDelete =
    comment.user_id === req.user!.id || membership.role_in_project === "owner" || membership.role_in_project === "admin";

  if (!canDelete) {
    res.status(403).json({ error: "Only the comment's author or a project admin/owner can delete it" });
    return;
  }

  const { error } = await supabase.from("task_comments").delete().eq("id", commentId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
});
