import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type ChainConfig = {
  maybeSingle?: unknown;
  single?: unknown;
  then?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
    single: vi.fn(() => Promise.resolve(config.single)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(config.then).then(resolve),
  };
  return obj;
}

let organizationMembersQueue: ReturnType<typeof chain>[] = [];
let taskResponses: ReturnType<typeof chain>[] = [];
let profileResponses: ReturnType<typeof chain>[] = [];
let generateTextResult = "Bu kişi görevlerini genelde zamanında ve dikkatli bir şekilde tamamlıyor.";
let generateTextShouldThrow = false;

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
      if (table === "tasks") {
        return taskResponses.shift();
      }
      if (table === "work_style_profiles") {
        return profileResponses.shift();
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

vi.mock("../ai/index.js", () => ({
  backgroundAI: {
    generateText: vi.fn(async () => {
      if (generateTextShouldThrow) throw new Error("model unreachable");
      return generateTextResult;
    }),
  },
}));

const { app } = await import("../app.js");
const { backgroundAI } = await import("../ai/index.js");

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
  taskResponses = [];
  profileResponses = [];
  generateTextResult = "Bu kişi görevlerini genelde zamanında ve dikkatli bir şekilde tamamlıyor.";
  generateTextShouldThrow = false;
  vi.mocked(backgroundAI.generateText).mockClear();
});

describe("GET /api/users/:userId/work-style", () => {
  it("rejects a requester who doesn't share an organization with the target", async () => {
    noSharedOrg();

    const res = await request(app).get("/api/users/user-2/work-style").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when no profile has been generated yet", async () => {
    sharedOrg();
    profileResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/users/user-2/work-style").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("returns the latest saved profile", async () => {
    sharedOrg();
    const profile = { id: "profile-1", user_id: "user-2", traits: {}, summary: "Özet", model_used: "background" };
    profileResponses = [chain({ maybeSingle: { data: profile, error: null } })];

    const res = await request(app).get("/api/users/user-2/work-style").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(profile);
  });

  it("lets a user view their own profile without an organization check", async () => {
    const profile = { id: "profile-1", user_id: "user-1", traits: {}, summary: "Özet", model_used: "background" };
    profileResponses = [chain({ maybeSingle: { data: profile, error: null } })];

    const res = await request(app).get("/api/users/user-1/work-style").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
  });
});

describe("POST /api/users/:userId/work-style/generate", () => {
  it("rejects a requester who doesn't share an organization with the target", async () => {
    noSharedOrg();

    const res = await request(app)
      .post("/api/users/user-2/work-style/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns a null summary and skips the AI call when there are no completed tasks", async () => {
    sharedOrg();
    taskResponses = [chain({ then: { data: [], error: null } })];

    const res = await request(app)
      .post("/api/users/user-2/work-style/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeNull();
    expect(res.body.traits.completedTaskCount).toBe(0);
    expect(backgroundAI.generateText).not.toHaveBeenCalled();
  });

  it("generates and saves a profile from completed task history", async () => {
    sharedOrg();
    taskResponses = [
      chain({
        then: {
          data: [
            {
              status: "done",
              priority: "high",
              due_date: "2026-08-05",
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-03T00:00:00.000Z",
              estimated_hours: 4,
              tags: ["backend"],
            },
          ],
          error: null,
        },
      }),
    ];
    const savedProfile = { id: "profile-1", user_id: "user-2", summary: generateTextResult };
    profileResponses = [chain({ single: { data: savedProfile, error: null } })];

    const res = await request(app)
      .post("/api/users/user-2/work-style/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(savedProfile);
    expect(backgroundAI.generateText).toHaveBeenCalledTimes(1);
    const promptArg = vi.mocked(backgroundAI.generateText).mock.calls[0][0];
    expect(promptArg).toContain("1 göreve");
    expect(promptArg).not.toMatch(/%/);
  });

  it("returns 502 when the AI call throws", async () => {
    sharedOrg();
    taskResponses = [
      chain({
        then: {
          data: [
            {
              status: "done",
              priority: "medium",
              due_date: null,
              created_at: "2026-08-01T00:00:00.000Z",
              updated_at: "2026-08-02T00:00:00.000Z",
              estimated_hours: null,
              tags: [],
            },
          ],
          error: null,
        },
      }),
    ];
    generateTextShouldThrow = true;

    const res = await request(app)
      .post("/api/users/user-2/work-style/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(502);
  });
});
