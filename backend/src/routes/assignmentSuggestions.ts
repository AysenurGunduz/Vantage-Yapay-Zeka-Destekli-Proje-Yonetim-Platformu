import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getTaskWithMembership } from "./tasks.js";
import { fetchTaskInputs } from "./workStyle.js";
import { calculateWorkStyleTraits } from "../services/workStyle.js";
import { suggestAssignees, type AssignmentCandidate } from "../services/assignmentSuggestion.js";

export const assignmentSuggestionsRouter = Router({ mergeParams: true });

assignmentSuggestionsRouter.use(requireAuth);

const MAX_SUGGESTIONS = 3;

assignmentSuggestionsRouter.get("/", async (req, res) => {
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

  const { data: members, error: membersError } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", task.project_id);

  if (membersError) {
    res.status(500).json({ error: membersError.message });
    return;
  }

  const candidateMembers = (members ?? []).filter((member) => member.user_id !== task.assignee_id);

  try {
    const candidates: AssignmentCandidate[] = await Promise.all(
      candidateMembers.map(async (member) => {
        const inputs = await fetchTaskInputs(member.user_id);
        return { userId: member.user_id, traits: calculateWorkStyleTraits(inputs) };
      }),
    );

    const suggestions = suggestAssignees(
      { priority: task.priority, dueDate: task.due_date, tags: task.tags ?? [] },
      candidates,
    ).slice(0, MAX_SUGGESTIONS);

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not compute assignment suggestions" });
  }
});
