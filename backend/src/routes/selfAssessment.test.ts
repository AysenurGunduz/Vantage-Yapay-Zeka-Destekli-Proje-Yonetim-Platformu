import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type ChainConfig = {
  maybeSingle?: unknown;
  then?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(config.then).then(resolve),
  };
  return obj;
}

let organizationMembersQueue: ReturnType<typeof chain>[] = [];
let profileResponses: ReturnType<typeof chain>[] = [];

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === "valid-token"
          ? { data: { user: { id: "user-1", email: "test@vantage.dev" } }, error: null }
          : { data: { user: null }, error: { message: "Invalid token" } },
      ),
    },
    from: vi.fn((table: string) => {
      if (table === "organization_members") {
        return organizationMembersQueue.shift() ?? chain({ then: { data: [], error: null } });
      }
      if (table === "profiles") {
        return profileResponses.shift();
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

function sharedOrg() {
  organizationMembersQueue = [
    chain({ then: { data: [{ organization_id: "org-1" }], error: null } }),
    chain({ then: { data: [{ organization_id: "org-1" }], error: null } }),
  ];
}

function noSharedOrg() {
  organizationMembersQueue = [
    chain({ then: { data: [{ organization_id: "org-1" }], error: null } }),
    chain({ then: { data: [{ organization_id: "org-2" }], error: null } }),
  ];
}

beforeEach(() => {
  organizationMembersQueue = [];
  profileResponses = [];
});

describe("GET /api/users/:userId/self-assessment", () => {
  it("rejects a user who doesn't share an organization", async () => {
    noSharedOrg();

    const res = await request(app).get("/api/users/user-2/self-assessment").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when no self-assessment has been filled in", async () => {
    sharedOrg();
    profileResponses = [chain({ maybeSingle: { data: { self_reported_traits: null }, error: null } })];

    const res = await request(app).get("/api/users/user-2/self-assessment").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("returns the self-reported traits", async () => {
    sharedOrg();
    const traits = { collaboration_style: "independent", problem_solving_style: "plan_first" };
    profileResponses = [chain({ maybeSingle: { data: { self_reported_traits: traits }, error: null } })];

    const res = await request(app).get("/api/users/user-2/self-assessment").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ self_reported_traits: traits });
  });
});
