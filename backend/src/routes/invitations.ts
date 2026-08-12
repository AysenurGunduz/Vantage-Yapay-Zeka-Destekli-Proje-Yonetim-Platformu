import { Router } from "express";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { sendInvitationEmail } from "../services/email.js";

export const organizationInvitationsRouter = Router({ mergeParams: true });

organizationInvitationsRouter.use(requireAuth);

async function getMembership(organizationId: string, userId: string) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return data;
}

function canManageInvitations(role: string | undefined) {
  return role === "owner" || role === "admin";
}

const INVITABLE_ROLES = ["admin", "member"] as const;

organizationInvitationsRouter.get("/", async (req, res) => {
  const { orgId } = req.params as { orgId: string };

  const membership = await getMembership(orgId, req.user!.id);
  if (!membership || !canManageInvitations(membership.role)) {
    res.status(403).json({ error: "Only an owner or admin can view invitations" });
    return;
  }

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role, status, created_at, expires_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

organizationInvitationsRouter.post("/", async (req, res) => {
  const { orgId } = req.params as { orgId: string };
  const { email, role } = req.body as { email?: string; role?: string };

  if (!email || !email.trim()) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const resolvedRole = role ?? "member";
  if (!INVITABLE_ROLES.includes(resolvedRole as (typeof INVITABLE_ROLES)[number])) {
    res.status(400).json({ error: "role must be one of: admin, member" });
    return;
  }

  const membership = await getMembership(orgId, req.user!.id);
  if (!membership || !canManageInvitations(membership.role)) {
    res.status(403).json({ error: "Only an owner or admin can invite members" });
    return;
  }

  const { data: invitation, error } = await supabase
    .from("organization_invitations")
    .insert({
      organization_id: orgId,
      email: email.trim().toLowerCase(),
      role: resolvedRole,
      invited_by: req.user!.id,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const [{ data: organization }, { data: inviterProfile }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", req.user!.id).maybeSingle(),
  ]);

  await sendInvitationEmail({
    to: invitation.email,
    organizationName: organization?.name ?? "Vantage",
    inviterName: inviterProfile?.full_name ?? null,
    role: invitation.role,
    token: invitation.token,
  });

  res.status(201).json(invitation);
});

organizationInvitationsRouter.delete("/:invitationId", async (req, res) => {
  const { orgId, invitationId } = req.params as { orgId: string; invitationId: string };

  const membership = await getMembership(orgId, req.user!.id);
  if (!membership || !canManageInvitations(membership.role)) {
    res.status(403).json({ error: "Only an owner or admin can revoke invitations" });
    return;
  }

  const { error } = await supabase
    .from("organization_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", orgId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
});

export const invitationsRouter = Router();

invitationsRouter.use(requireAuth);

invitationsRouter.get("/", async (req, res) => {
  const email = req.user!.email?.toLowerCase();

  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, organization_id, email, role, status, token, created_at, expires_at")
    .eq("email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const orgIds = [...new Set((data ?? []).map((invitation) => invitation.organization_id))];
  const orgNameById = new Map<string, string>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", orgIds);
    for (const org of orgs ?? []) orgNameById.set(org.id, org.name);
  }

  res.json(
    (data ?? []).map((invitation) => ({
      ...invitation,
      organization_name: orgNameById.get(invitation.organization_id) ?? null,
    })),
  );
});

async function findInvitationByToken(token: string) {
  const { data } = await supabase
    .from("organization_invitations")
    .select("id, organization_id, email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  return data;
}

function validateInvitationForUser(
  invitation: { email: string; status: string; expires_at: string } | null,
  userEmail: string | undefined,
) {
  if (!invitation) {
    return { status: 404, error: "Invitation not found" } as const;
  }
  if (invitation.status !== "pending" || new Date(invitation.expires_at) < new Date()) {
    return { status: 410, error: "This invitation is no longer valid" } as const;
  }
  if (invitation.email !== userEmail?.toLowerCase()) {
    return { status: 403, error: "This invitation was issued to a different email address" } as const;
  }
  return null;
}

invitationsRouter.get("/:token", async (req, res) => {
  const invitation = await findInvitationByToken(req.params.token);

  const validationError = validateInvitationForUser(invitation, req.user!.email);
  if (validationError) {
    res.status(validationError.status).json({ error: validationError.error });
    return;
  }

  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", invitation!.organization_id)
    .maybeSingle();

  res.json({
    organization_id: invitation!.organization_id,
    organization_name: organization?.name ?? null,
    email: invitation!.email,
    role: invitation!.role,
  });
});

invitationsRouter.post("/:token/accept", async (req, res) => {
  const invitation = await findInvitationByToken(req.params.token);

  const validationError = validateInvitationForUser(invitation, req.user!.email);
  if (validationError) {
    res.status(validationError.status).json({ error: validationError.error });
    return;
  }

  const { data: existingMember } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", invitation!.organization_id)
    .eq("user_id", req.user!.id)
    .maybeSingle();

  if (existingMember) {
    res.status(409).json({ error: "Already a member of this organization" });
    return;
  }

  const { error: memberError } = await supabase.from("organization_members").insert({
    organization_id: invitation!.organization_id,
    user_id: req.user!.id,
    role: invitation!.role,
  });

  if (memberError) {
    res.status(500).json({ error: memberError.message });
    return;
  }

  await supabase
    .from("organization_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitation!.id);

  res.status(201).json({ organization_id: invitation!.organization_id, role: invitation!.role });
});
