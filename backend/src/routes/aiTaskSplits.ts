import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { interactiveAI } from "../ai/index.js";
import { taskSplitSchema, type TaskSplitPayload } from "../ai/schemas.js";
import { parseAIResponse, AISchemaError } from "../ai/parseAIResponse.js";
import { logActivity } from "./tasks.js";

export const projectAITaskSplitsRouter = Router({ mergeParams: true });
export const aiTaskSplitRouter = Router();

projectAITaskSplitsRouter.use(requireAuth);
aiTaskSplitRouter.use(requireAuth);

function buildTaskSplitPrompt(description: string): string {
  return `Sen bir proje yönetimi asistanısın. Aşağıdaki görev/proje açıklamasını, gerçekten uygulanabilir 2 ile 6 arasında alt göreve böl.

Kurallar:
- Her başlık kısa (en fazla 8-10 kelime), Türkçe, eylem fiiliyle başlayan net bir iş tanımı olsun ve doğrudan yukarıdaki açıklamaya özgü olsun.
- Örnek bir şablon başlık uydurup onu aynen kullanma; her başlık bu açıklamadan türemiş olmalı.
- Açıklama belirsiz olsa bile elinden geldiğince makul alt görevler üret; "açıklama yetersiz" gibi bir şey yazma.
- Mümkünse her alt görev için gerçekçi bir tahmini süre (saat, sayı) ekle; emin değilsen o alanı hiç ekleme.
- Türkçe dışında hiçbir kelime kullanma.

Açıklama: "${description}"

SADECE şu JSON şemasına uyan, tek satırlık bir çıktı ver — başka açıklama, markdown ya da kod bloğu ekleme:
{"subtasks": [{"title": "string", "estimated_hours": number}]}`;
}

// Model şemaya uymayan bir JSON üretirse, aynı isteği tekrar göndermek yerine
// hatanın ne olduğunu modele söyleyip bir kez daha deneriz. Ağ/timeout gibi
// geçici hatalarda ise bunun faydası yok, direkt yukarı fırlatılır.
async function generateTaskSplitSuggestion(description: string): Promise<TaskSplitPayload> {
  const prompt = buildTaskSplitPrompt(description);

  try {
    const raw = await interactiveAI.generateJSON<unknown>(prompt);
    return parseAIResponse(taskSplitSchema, raw);
  } catch (err) {
    if (!(err instanceof AISchemaError)) {
      throw err;
    }

    console.warn("AI task split response failed schema validation, retrying once with a correction prompt:", err.message);
    const correctionPrompt = `${prompt}\n\nÖnceki cevabın bu şemaya uymadı: ${err.message}\nLütfen SADECE düzeltilmiş, şemaya tam uyan JSON'ı ver.`;
    const raw = await interactiveAI.generateJSON<unknown>(correctionPrompt);
    return parseAIResponse(taskSplitSchema, raw);
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

projectAITaskSplitsRouter.post("/", async (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const { description } = req.body as { description?: string };

  if (!description || !description.trim()) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  const membership = await getProjectMembership(projectId, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  let suggestion: TaskSplitPayload;
  try {
    suggestion = await generateTaskSplitSuggestion(description.trim());
  } catch (err) {
    console.error("AI task split validation failed:", err);
    res.status(502).json({ error: "AI görev önerisi üretilemedi, tekrar dener misin?" });
    return;
  }

  const { data: record, error } = await supabase
    .from("ai_task_suggestions")
    .insert({
      project_id: projectId,
      source_description: description.trim(),
      suggested_tasks: suggestion,
      status: "pending",
      created_by: req.user!.id,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(record);
});

aiTaskSplitRouter.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { status, suggested_tasks: editedTasks } = req.body as {
    status?: "accepted" | "rejected";
    suggested_tasks?: unknown;
  };

  if (status !== "accepted" && status !== "rejected") {
    res.status(400).json({ error: "status must be 'accepted' or 'rejected'" });
    return;
  }

  const { data: suggestionRow } = await supabase
    .from("ai_task_suggestions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!suggestionRow) {
    res.status(404).json({ error: "Suggestion not found" });
    return;
  }

  const membership = await getProjectMembership(suggestionRow.project_id, req.user!.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this project" });
    return;
  }

  if (suggestionRow.status !== "pending") {
    res.status(400).json({ error: "This suggestion was already resolved" });
    return;
  }

  let finalTasks = suggestionRow.suggested_tasks as TaskSplitPayload;
  if (status === "accepted" && editedTasks !== undefined) {
    try {
      finalTasks = parseAIResponse(taskSplitSchema, editedTasks);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "suggested_tasks does not match the expected schema" });
      return;
    }
  }

  if (status === "accepted") {
    const rowsToInsert = finalTasks.subtasks.map((subtask) => ({
      project_id: suggestionRow.project_id,
      title: subtask.title.trim(),
      estimated_hours: subtask.estimated_hours ?? null,
      ai_generated: true,
      created_by: req.user!.id,
    }));

    const { data: createdTasks, error: insertError } = await supabase
      .from("tasks")
      .insert(rowsToInsert)
      .select();

    if (insertError) {
      res.status(500).json({ error: insertError.message });
      return;
    }

    for (const task of createdTasks ?? []) {
      await logActivity(task.id, req.user!.id, "created", null, task.title);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("ai_task_suggestions")
    .update({ status, suggested_tasks: finalTasks })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  res.json(updated);
});
