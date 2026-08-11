import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { shareOrganization } from "./workStyle.js";

export const userSelfAssessmentRouter = Router({ mergeParams: true });

userSelfAssessmentRouter.use(requireAuth);

userSelfAssessmentRouter.get("/", async (req, res) => {
  const { userId } = req.params as { userId: string };

  const allowed = await shareOrganization(req.user!.id, userId);
  if (!allowed) {
    res.status(403).json({ error: "You don't share an organization with this user" });
    return;
  }

  const { data, error } = await supabase.from("profiles").select("self_reported_traits").eq("id", userId).maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data?.self_reported_traits) {
    res.status(404).json({ error: "This user hasn't filled in a self-assessment yet" });
    return;
  }

  res.json({ self_reported_traits: data.self_reported_traits });
});
