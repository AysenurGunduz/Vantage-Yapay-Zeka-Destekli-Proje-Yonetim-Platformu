import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { interactiveAI } from "../ai/index.js";

export const projectSprintSummaryRouter = Router({ mergeParams: true });

projectSprintSummaryRouter.use(requireAuth);

const SPRINT_WINDOW_DAYS = 7;

async function getProjectMembership(projectId: string, userId: string) {
  const { data } = await supabase
    .from("project_members")
    .select("role_in_project")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

function buildSprintSummaryPrompt(projectName: string, taskTitles: string[]): string {
  const list = taskTitles.map((title) => `- ${title}`).join("\n");
  return `Sen bir proje yöneticisi asistanısın. Aşağıda "${projectName}" projesinde son ${SPRINT_WINDOW_DAYS} günde tamamlanan görevlerin listesi var. Bunlardan, müşteriye ya da ekibe gönderilebilecek kısa ve profesyonel bir sprint özeti / release notes metni yaz.

Kurallar:
- Doğrudan maddelerle başla; herhangi bir başlık, giriş cümlesi ya da kapanış cümlesi ekleme.
- Türkçe yaz, madde işaretleri kullanabilirsin.
- Aşağıdaki listede tam olarak ${taskTitles.length} görev var. Çıktında da tam olarak ${taskTitles.length} madde olsun; listede olmayan hiçbir görevden bahsetme, ekleme ya da içerik uydurma.

Tamamlanan görevler:
${list}`;
}

projectSprintSummaryRouter.post("/", async (req, res) => {
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

  const since = new Date(Date.now() - SPRINT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: completedTasks, error } = await supabase
    .from("tasks")
    .select("title")
    .eq("project_id", projectId)
    .eq("status", "done")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!completedTasks || completedTasks.length === 0) {
    res.status(200).json({ summary: null, taskCount: 0, periodDays: SPRINT_WINDOW_DAYS });
    return;
  }

  const taskTitles = completedTasks.map((task) => task.title as string);

  let summary: string;
  try {
    summary = await interactiveAI.generateText(buildSprintSummaryPrompt(project.name as string, taskTitles));
  } catch {
    res.status(502).json({ error: "Sprint özeti üretilemedi, tekrar dener misin?" });
    return;
  }

  res.status(200).json({ summary, taskCount: taskTitles.length, periodDays: SPRINT_WINDOW_DAYS });
});
