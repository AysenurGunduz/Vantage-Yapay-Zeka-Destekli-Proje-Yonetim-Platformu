import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type ChainConfig = {
  maybeSingle?: unknown;
  single?: unknown;
  order?: unknown;
  then?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    order: vi.fn(() => Promise.resolve(config.order)),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
    single: vi.fn(() => Promise.resolve(config.single)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(config.then).then(resolve),
  };
  return obj;
}

let membership: { role_in_project: string } | null = null;
let taskResponses: ReturnType<typeof chain>[] = [];
let activityLogQueue: ReturnType<typeof chain>[] = [];

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
      if (table === "project_members") {
        return chain({ maybeSingle: { data: membership, error: null } });
      }
      if (table === "tasks") {
        return taskResponses.shift();
      }
      if (table === "task_time_entries") {
        return taskResponses.shift();
      }
      if (table === "task_activity_log") {
        return activityLogQueue.length > 0 ? activityLogQueue.shift() : chain({ then: { error: null } });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

beforeEach(() => {
  membership = null;
  taskResponses = [];
  activityLogQueue = [];
});

describe("time entries routes", () => {
  it("returns 404 when listing entries for a task that doesn't exist", async () => {
    taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/tasks/missing-task/time-entries").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("rejects listing entries for a non-member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", estimated_hours: 4 };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app).get("/api/tasks/task-1/time-entries").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("lists entries with a computed total and the task's estimate", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", estimated_hours: 4 };
    membership = { role_in_project: "member" };
    const entries = [
      { id: "entry-1", user_id: "user-1", minutes: 90, note: "Şema tasarımı", logged_at: "2026-08-04T10:00:00.000Z" },
      { id: "entry-2", user_id: "user-1", minutes: 30, note: null, logged_at: "2026-08-05T10:00:00.000Z" },
    ];
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ order: { data: entries, error: null } }),
    ];

    const res = await request(app).get("/api/tasks/task-1/time-entries").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries, totalMinutes: 120, estimatedHours: 4 });
  });

  it("rejects logging a non-positive amount of time", async () => {
    const res = await request(app)
      .post("/api/tasks/task-1/time-entries")
      .set("Authorization", "Bearer valid-token")
      .send({ minutes: 0 });

    expect(res.status).toBe(400);
  });

  it("rejects logging time for a non-member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app)
      .post("/api/tasks/task-1/time-entries")
      .set("Authorization", "Bearer valid-token")
      .send({ minutes: 45 });

    expect(res.status).toBe(403);
  });

  it("logs time for a project member and records an activity entry", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    membership = { role_in_project: "member" };
    const insertedEntry = { id: "entry-1", task_id: "task-1", user_id: "user-1", minutes: 45, note: "Test", logged_at: "2026-08-05T10:00:00.000Z" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: insertedEntry, error: null } }),
    ];
    const activityChain = chain({ then: { error: null } });
    activityLogQueue = [activityChain];

    const res = await request(app)
      .post("/api/tasks/task-1/time-entries")
      .set("Authorization", "Bearer valid-token")
      .send({ minutes: 45, note: "Test" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(insertedEntry);
    expect(activityChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: "task-1", user_id: "user-1", action_type: "time_logged", to_value: "45 dk" }),
    );
  });
});
