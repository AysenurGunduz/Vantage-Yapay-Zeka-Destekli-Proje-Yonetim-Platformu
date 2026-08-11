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

let taskResponses: ReturnType<typeof chain>[] = [];
let projectMembersResponses: ReturnType<typeof chain>[] = [];

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
      if (table === "tasks") return taskResponses.shift();
      if (table === "project_members") return projectMembersResponses.shift();
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

const taskRow = {
  id: "task-1",
  project_id: "project-1",
  priority: "medium",
  due_date: null,
  tags: ["backend"],
  assignee_id: null,
};

function doneTask(overrides: Record<string, unknown> = {}) {
  return {
    status: "done",
    priority: "medium",
    due_date: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
    estimated_hours: null,
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  taskResponses = [];
  projectMembersResponses = [];
});

describe("GET /api/tasks/:taskId/assignment-suggestions", () => {
  it("returns 404 when the task doesn't exist", async () => {
    taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/tasks/task-1/assignment-suggestions").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("rejects a non-member", async () => {
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
    projectMembersResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/tasks/task-1/assignment-suggestions").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("ranks a member with matching tag history above one without", async () => {
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { data: [doneTask({ tags: ["backend"] })], error: null } }),
      chain({ then: { data: [doneTask({ tags: ["design"] })], error: null } }),
    ];
    projectMembersResponses = [
      chain({ maybeSingle: { data: { role_in_project: "member" }, error: null } }),
      chain({ then: { data: [{ user_id: "user-2" }, { user_id: "user-3" }], error: null } }),
    ];

    const res = await request(app).get("/api/tasks/task-1/assignment-suggestions").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body[0].userId).toBe("user-2");
    expect(res.body[0].reasons[0]).toContain("backend");
  });

  it("excludes the current assignee from the suggestion list", async () => {
    const assignedTaskRow = { ...taskRow, assignee_id: "user-2" };
    taskResponses = [
      chain({ maybeSingle: { data: assignedTaskRow, error: null } }),
      chain({ then: { data: [doneTask({ tags: ["design"] })], error: null } }),
    ];
    projectMembersResponses = [
      chain({ maybeSingle: { data: { role_in_project: "member" }, error: null } }),
      chain({ then: { data: [{ user_id: "user-2" }, { user_id: "user-3" }], error: null } }),
    ];

    const res = await request(app).get("/api/tasks/task-1/assignment-suggestions").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.map((s: { userId: string }) => s.userId)).toEqual(["user-3"]);
  });
});
