import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

function chain(result: unknown) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    gt: vi.fn(() => obj),
    in: vi.fn(() => obj),
    order: vi.fn(() => obj),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return obj;
}

let invitationRows: {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  created_at: string;
  expires_at: string;
}[] = [];
let organizationRows: { id: string; name: string }[] = [];

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === "valid-token"
          ? { data: { user: { id: "user-1", email: "invited@vantage.dev" } }, error: null }
          : { data: { user: null }, error: { message: "Invalid token" } }
      ),
    },
    from: vi.fn((table: string) => {
      if (table === "organization_invitations") {
        return chain({ data: invitationRows, error: null });
      }
      if (table === "organizations") {
        return chain({ data: organizationRows, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

beforeEach(() => {
  invitationRows = [];
  organizationRows = [];
});

describe("listing own pending invitations", () => {
  it("returns an empty list when there are no pending invitations", async () => {
    const res = await request(app).get("/api/invitations").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("attaches the organization name to each pending invitation", async () => {
    invitationRows = [
      {
        id: "inv-1",
        organization_id: "org-1",
        email: "invited@vantage.dev",
        role: "member",
        status: "pending",
        token: "tok-1",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
    ];
    organizationRows = [{ id: "org-1", name: "Vantage Org" }];

    const res = await request(app).get("/api/invitations").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: "inv-1",
        organization_id: "org-1",
        organization_name: "Vantage Org",
        email: "invited@vantage.dev",
        role: "member",
        status: "pending",
        token: "tok-1",
        created_at: invitationRows[0].created_at,
        expires_at: invitationRows[0].expires_at,
      },
    ]);
  });
});
