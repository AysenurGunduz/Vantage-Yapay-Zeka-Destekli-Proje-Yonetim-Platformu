import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getTaskWithMembership, logActivity } from "./tasks.js";

export const taskDependenciesRouter = Router({ mergeParams: true });

taskDependenciesRouter.use(requireAuth);

const DEPENDENCY_TYPES = ["blocked_by", "relates_to", "duplicates"] as const;
type DependencyType = (typeof DEPENDENCY_TYPES)[number];

type RelatedTask = { id: string; title: string; status: string };

taskDependenciesRouter.get("/", async (req, res) => {
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

  const [outgoingRes, incomingRes] = await Promise.all([
    supabase.from("task_dependencies").select("id, dependency_type, depends_on_task_id").eq("task_id", taskId),
    supabase.from("task_dependencies").select("id, dependency_type, task_id").eq("depends_on_task_id", taskId),
  ]);

  if (outgoingRes.error) {
    res.status(500).json({ error: outgoingRes.error.message });
    return;
  }
  if (incomingRes.error) {
    res.status(500).json({ error: incomingRes.error.message });
    return;
  }

  const outgoing = outgoingRes.data as { id: string; dependency_type: DependencyType; depends_on_task_id: string }[];
  const incoming = incomingRes.data as { id: string; dependency_type: DependencyType; task_id: string }[];

  const relatedTaskIds = [
    ...new Set([...outgoing.map((row) => row.depends_on_task_id), ...incoming.map((row) => row.task_id)]),
  ];

  let relatedTasksById = new Map<string, RelatedTask>();
  if (relatedTaskIds.length > 0) {
    const { data: relatedTasks, error: relatedError } = await supabase
      .from("tasks")
      .select("id, title, status")
      .in("id", relatedTaskIds);

    if (relatedError) {
      res.status(500).json({ error: relatedError.message });
      return;
    }
    relatedTasksById = new Map((relatedTasks as RelatedTask[]).map((t) => [t.id, t]));
  }

  const dependencies = [
    ...outgoing.map((row) => ({
      id: row.id,
      direction: "outgoing" as const,
      dependency_type: row.dependency_type,
      related_task: relatedTasksById.get(row.depends_on_task_id) ?? null,
    })),
    ...incoming.map((row) => ({
      id: row.id,
      direction: "incoming" as const,
      dependency_type: row.dependency_type,
      related_task: relatedTasksById.get(row.task_id) ?? null,
    })),
  ];

  res.json(dependencies);
});

taskDependenciesRouter.post("/", async (req, res) => {
  const { taskId } = req.params as { taskId: string };
  const { dependency_type: dependencyType, related_task_id: relatedTaskId } = req.body as {
    dependency_type?: string;
    related_task_id?: string;
  };

  if (!dependencyType || !DEPENDENCY_TYPES.includes(dependencyType as DependencyType)) {
    res.status(400).json({ error: `dependency_type must be one of: ${DEPENDENCY_TYPES.join(", ")}` });
    return;
  }
  if (!relatedTaskId) {
    res.status(400).json({ error: "related_task_id is required" });
    return;
  }
  if (relatedTaskId === taskId) {
    res.status(400).json({ error: "A task cannot depend on itself" });
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

  const { data: relatedTask } = await supabase
    .from("tasks")
    .select("id, project_id, title, status")
    .eq("id", relatedTaskId)
    .maybeSingle();

  if (!relatedTask || relatedTask.project_id !== task.project_id) {
    res.status(400).json({ error: "related_task_id must belong to the same project" });
    return;
  }

  const { data: created, error } = await supabase
    .from("task_dependencies")
    .insert({
      task_id: taskId,
      depends_on_task_id: relatedTaskId,
      dependency_type: dependencyType,
      created_by: req.user!.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "This dependency already exists" });
      return;
    }
    res.status(500).json({ error: error.message });
    return;
  }

  await logActivity(taskId, req.user!.id, "dependency_added", null, `${dependencyType}: ${relatedTask.title}`);

  res.status(201).json({
    id: created.id,
    direction: "outgoing" as const,
    dependency_type: created.dependency_type,
    related_task: { id: relatedTask.id, title: relatedTask.title, status: relatedTask.status },
  });
});

taskDependenciesRouter.delete("/:dependencyId", async (req, res) => {
  const { taskId, dependencyId } = req.params as { taskId: string; dependencyId: string };
  const { task, membership } = await getTaskWithMembership(taskId, req.user!.id);

  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: dependency } = await supabase
    .from("task_dependencies")
    .select("id, task_id, depends_on_task_id")
    .eq("id", dependencyId)
    .maybeSingle();

  if (!dependency || (dependency.task_id !== taskId && dependency.depends_on_task_id !== taskId)) {
    res.status(404).json({ error: "Dependency not found" });
    return;
  }

  const { error } = await supabase.from("task_dependencies").delete().eq("id", dependencyId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
});
