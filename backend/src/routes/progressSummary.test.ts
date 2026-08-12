import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type ChainConfig = {
  maybeSingle?: unknown;
  order?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
  };
  return obj;
}

let membership: { role_in_project: string } | null = null;
let project: { name: string } | null = { name: "Vantage Web" };
let latestSummary: Record<string, unknown> | null = null;
let generateShouldThrow = false;
let generateResult: Record<string, unknown> | null = {
  id: "s1",
  project_id: "project-1",
  period_start: "2026-08-05",
  period_end: "2026-08-12",
  summary: "Bu dönemde ekip iyi bir ilerleme kaydetti.",
  model_used: "background",
  generated_at: "2026-08-12T00:00:00.000Z",
};

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
      if (table === "project_members") {
        return chain({ maybeSingle: { data: membership, error: null } });
      }
      if (table === "projects") {
        return chain({ maybeSingle: { data: project, error: null } });
      }
      if (table === "progress_summaries") {
        return chain({ maybeSingle: { data: latestSummary, error: null } });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

vi.mock("../jobs/runProgressSummaryJob.js", () => ({
  PROGRESS_SUMMARY_PERIOD_DAYS: 7,
  generateAndSaveProjectSummary: vi.fn(async () => {
    if (generateShouldThrow) throw new Error("model unreachable");
    return generateResult;
  }),
}));

const { app } = await import("../app.js");

beforeEach(() => {
  membership = null;
  project = { name: "Vantage Web" };
  latestSummary = null;
  generateShouldThrow = false;
});

describe("GET /api/projects/:projectId/progress-summary", () => {
  it("rejects a non-member", async () => {
    const res = await request(app).get("/api/projects/project-1/progress-summary").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when no summary has been generated yet", async () => {
    membership = { role_in_project: "member" };

    const res = await request(app).get("/api/projects/project-1/progress-summary").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("returns the latest saved summary", async () => {
    membership = { role_in_project: "member" };
    latestSummary = { id: "s1", summary: "Bu dönemde ekip iyi bir ilerleme kaydetti." };

    const res = await request(app).get("/api/projects/project-1/progress-summary").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(latestSummary);
  });
});

describe("POST /api/projects/:projectId/progress-summary/generate", () => {
  it("rejects a non-member", async () => {
    const res = await request(app)
      .post("/api/projects/project-1/progress-summary/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 404 when the project doesn't exist", async () => {
    membership = { role_in_project: "member" };
    project = null;

    const res = await request(app)
      .post("/api/projects/project-1/progress-summary/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("generates and returns a saved summary", async () => {
    membership = { role_in_project: "member" };

    const res = await request(app)
      .post("/api/projects/project-1/progress-summary/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(generateResult);
  });

  it("returns a null summary when the project has no tasks", async () => {
    membership = { role_in_project: "member" };
    generateResult = null;

    const res = await request(app)
      .post("/api/projects/project-1/progress-summary/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null });
  });

  it("returns 502 when generation fails", async () => {
    membership = { role_in_project: "member" };
    generateShouldThrow = true;

    const res = await request(app)
      .post("/api/projects/project-1/progress-summary/generate")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(502);
  });
});
