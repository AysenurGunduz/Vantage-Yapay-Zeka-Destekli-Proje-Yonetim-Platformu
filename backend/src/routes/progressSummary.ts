import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { generateAndSaveProjectSummary, PROGRESS_SUMMARY_PERIOD_DAYS } from "../jobs/runProgressSummaryJob.js";

export const projectProgressSummaryRouter = Router({ mergeParams: true });

projectProgressSummaryRouter.use(requireAuth);

async function getProjectMembership(projectId: string, userId: string) {
  const { data } = await supabase
    .from("project_members")
    .select("role_in_project")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

projectProgressSummaryRouter.get("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };

  const membership = await getProjectMembership(projectId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data, error } = await supabase
    .from("progress_summaries")
    .select("*")
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "No progress summary has been generated for this project yet" });
    return;
  }

  res.json(data);
});

projectProgressSummaryRouter.post("/generate", async (req, res) => {
  const { projectId } = req.params as { projectId: string };

  const membership = await getProjectMembership(projectId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PROGRESS_SUMMARY_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  try {
    const saved = await generateAndSaveProjectSummary(projectId, project.name as string, periodStart, periodEnd);
    if (!saved) {
      res.status(200).json({ summary: null });
      return;
    }
    res.status(201).json(saved);
  } catch {
    res.status(502).json({ error: "İlerleme özeti üretilemedi, tekrar dener misin?" });
  }
});
