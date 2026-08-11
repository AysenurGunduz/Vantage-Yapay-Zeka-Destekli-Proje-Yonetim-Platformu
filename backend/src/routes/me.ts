import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const meRouter = Router();

meRouter.use(requireAuth);

const VALID_USAGE_PURPOSES = ["work", "personal", "education", "other"] as const;

const PROFILE_FIELDS = "id, full_name, avatar_url, title, usage_purpose, self_reported_traits";

meRouter.get("/", async (req, res) => {
  const { data, error } = await supabase.from("profiles").select(PROFILE_FIELDS).eq("id", req.user!.id).maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(data);
});

meRouter.patch("/", async (req, res) => {
  const { usage_purpose: usagePurpose, self_reported_traits: selfReportedTraits } = req.body as {
    usage_purpose?: string;
    self_reported_traits?: Record<string, string>;
  };

  const updates: Record<string, unknown> = {};

  if (usagePurpose !== undefined) {
    if (!VALID_USAGE_PURPOSES.includes(usagePurpose as (typeof VALID_USAGE_PURPOSES)[number])) {
      res.status(400).json({ error: `usage_purpose must be one of: ${VALID_USAGE_PURPOSES.join(", ")}` });
      return;
    }
    updates.usage_purpose = usagePurpose;
  }

  if (selfReportedTraits !== undefined) {
    updates.self_reported_traits = selfReportedTraits;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", req.user!.id)
    .select(PROFILE_FIELDS)
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});
