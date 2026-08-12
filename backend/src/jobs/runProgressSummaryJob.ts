import { supabase } from "../lib/supabaseClient.js";
import { backgroundAI } from "../ai/index.js";
import { collectProjectProgressData, buildProgressSummaryPrompt, type TaskProgressRow } from "../services/progressSummary.js";

export const PROGRESS_SUMMARY_PERIOD_DAYS = 7;

export interface SavedProgressSummary {
  id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  summary: string;
  model_used: string | null;
  generated_at: string;
}

export async function generateAndSaveProjectSummary(
  projectId: string,
  projectName: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<SavedProgressSummary | null> {
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("status, title, due_date, updated_at")
    .eq("project_id", projectId);

  if (tasksError) throw new Error(tasksError.message);

  const rows = (tasks ?? []) as TaskProgressRow[];
  if (rows.length === 0) return null;

  const data = collectProjectProgressData(projectId, projectName, rows, periodStart, periodEnd);
  const summary = await backgroundAI.generateText(buildProgressSummaryPrompt(data));

  const { data: saved, error: saveError } = await supabase
    .from("progress_summaries")
    .insert({
      project_id: projectId,
      period_start: data.periodStart,
      period_end: data.periodEnd,
      summary,
      model_used: "background",
    })
    .select()
    .single();

  if (saveError) throw new Error(saveError.message);
  return saved;
}

export async function runProgressSummaryJob(): Promise<void> {
  const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name");

  if (projectsError) {
    console.error("Progress summary job: could not load projects:", projectsError.message);
    return;
  }

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - PROGRESS_SUMMARY_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  for (const project of projects ?? []) {
    try {
      await generateAndSaveProjectSummary(project.id, project.name, periodStart, periodEnd);
    } catch (err) {
      console.error(`Progress summary job: failed for project ${project.id}:`, err instanceof Error ? err.message : err);
    }
  }
}
