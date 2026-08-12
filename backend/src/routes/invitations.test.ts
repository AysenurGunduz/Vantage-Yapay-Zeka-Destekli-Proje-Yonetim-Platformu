import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

let membership: { role: string } | null = null;
let invitationsListResult: unknown[] = [];
let createdInvitation: unknown = null;
let organizationRow: { name: string } | null = { name: "Vantage Org" };
let inviterProfileRow: { full_name: string | null } | null = { full_name: "Ayşenur" };

const sendInvitationEmail = vi.fn(async () => undefined);
vi.mock("../services/email.js", () => ({ sendInvitationEmail }));

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === "valid-token"
          ? { data: { user: { id: "user-1", email: "test@vantage.dev" } }, error: null }
          : { data: { user: null }, error: { message: "Invalid token" } }
      ),
    },
    from: vi.fn((table: string) => {
      if (table === "organization_members") {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          maybeSingle: vi.fn(async () => ({ data: membership, error: null })),
        };
        return obj;
      }

      if (table === "organization_invitations") {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          insert: vi.fn(() => obj),
          update: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          order: vi.fn(() => obj),
          single: vi.fn(async () => ({ data: createdInvitation, error: null })),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: invitationsListResult, error: null }).then(resolve),
        };
        return obj;
      }

      if (table === "organizations") {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          maybeSingle: vi.fn(async () => ({ data: organizationRow, error: null })),
        };
        return obj;
      }

      if (table === "profiles") {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          maybeSingle: vi.fn(async () => ({ data: inviterProfileRow, error: null })),
        };
        return obj;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

beforeEach(() => {
  membership = null;
  invitationsListResult = [];
  createdInvitation = null;
  organizationRow = { name: "Vantage Org" };
  inviterProfileRow = { full_name: "Ayşenur" };
  sendInvitationEmail.mockClear();
});

describe("organization invitations routes", () => {
  it("rejects listing invitations for a non-admin member", async () => {
    membership = { role: "member" };

    const res = await request(app)
      .get("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("lists invitations for an owner", async () => {
    membership = { role: "owner" };
    invitationsListResult = [{ id: "inv-1", email: "a@b.com", role: "member", status: "pending" }];

    const res = await request(app)
      .get("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(invitationsListResult);
  });

  it("rejects creating an invitation without an email", async () => {
    membership = { role: "owner" };

    const res = await request(app)
      .post("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejects an invalid role", async () => {
    membership = { role: "owner" };

    const res = await request(app)
      .post("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token")
      .send({ email: "new@vantage.dev", role: "owner" });

    expect(res.status).toBe(400);
  });

  it("rejects creating an invitation from a non-admin member", async () => {
    membership = { role: "member" };

    const res = await request(app)
      .post("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token")
      .send({ email: "new@vantage.dev" });

    expect(res.status).toBe(403);
  });

  it("creates an invitation when requested by an admin", async () => {
    membership = { role: "admin" };
    createdInvitation = {
      id: "inv-2",
      organization_id: "org-1",
      email: "new@vantage.dev",
      role: "member",
      token: "tok-2",
    };

    const res = await request(app)
      .post("/api/organizations/org-1/invitations")
      .set("Authorization", "Bearer valid-token")
      .send({ email: "new@vantage.dev" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(createdInvitation);
    expect(sendInvitationEmail).toHaveBeenCalledWith({
      to: "new@vantage.dev",
      organizationName: "Vantage Org",
      inviterName: "Ayşenur",
      role: "member",
      token: "tok-2",
    });
  });

  it("rejects revoking an invitation from a non-admin member", async () => {
    membership = { role: "member" };

    const res = await request(app)
      .delete("/api/organizations/org-1/invitations/inv-1")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("revokes an invitation when requested by an owner", async () => {
    membership = { role: "owner" };

    const res = await request(app)
      .delete("/api/organizations/org-1/invitations/inv-1")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(204);
  });
});
