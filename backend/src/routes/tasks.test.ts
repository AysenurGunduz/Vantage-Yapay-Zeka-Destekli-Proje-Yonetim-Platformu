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
    update: vi.fn(() => obj),
    delete: vi.fn(() => obj),
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
let generateTextResult = "Bu görev yakın zamanda tamamlanmadığı için gecikme riski taşıyor.";
let generateTextShouldThrow = false;

vi.mock("../ai/index.js", () => ({
  interactiveAI: {
    generateJSON: vi.fn(async () => ({})),
    generateText: vi.fn(async () => {
      if (generateTextShouldThrow) throw new Error("model unreachable");
      return generateTextResult;
    }),
  },
}));

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
const { supabase } = await import("../lib/supabaseClient.js");

beforeEach(() => {
  membership = null;
  taskResponses = [];
  activityLogQueue = [];
  generateTextResult = "Bu görev yakın zamanda tamamlanmadığı için gecikme riski taşıyor.";
  generateTextShouldThrow = false;
});

describe("tasks routes", () => {
  it("rejects listing tasks for a non-project-member", async () => {
    const res = await request(app)
      .get("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("lists tasks for a project member", async () => {
    membership = { role_in_project: "member" };
    const taskList = [{ id: "task-1", project_id: "project-1", title: "Design schema" }];
    taskResponses = [chain({ order: { data: taskList, error: null } })];

    const res = await request(app)
      .get("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(taskList);
  });

  it("rejects creating a task without a title", async () => {
    membership = { role_in_project: "member" };

    const res = await request(app)
      .post("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "  " });

    expect(res.status).toBe(400);
  });

  it("creates a task when the user is a project member", async () => {
    membership = { role_in_project: "member" };
    const insertedTask = { id: "task-1", project_id: "project-1", title: "Design schema", priority: "medium" };
    taskResponses = [chain({ single: { data: insertedTask, error: null } })];

    const res = await request(app)
      .post("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Design schema" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(insertedTask);
  });

  it("logs a 'created' activity entry when a task is made", async () => {
    membership = { role_in_project: "member" };
    const insertedTask = { id: "task-1", project_id: "project-1", title: "Design schema", priority: "medium" };
    taskResponses = [chain({ single: { data: insertedTask, error: null } })];

    await request(app)
      .post("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Design schema" });

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith("task_activity_log");
  });

  it("creates a task with tags", async () => {
    membership = { role_in_project: "member" };
    const insertedTask = {
      id: "task-1",
      project_id: "project-1",
      title: "Design schema",
      priority: "medium",
      tags: ["backend", "urgent-fix"],
    };
    taskResponses = [chain({ single: { data: insertedTask, error: null } })];

    const res = await request(app)
      .post("/api/projects/project-1/tasks")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Design schema", tags: ["backend", "urgent-fix"] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(insertedTask);
  });

  it("returns 404 for a task that doesn't exist", async () => {
    taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/tasks/missing-task").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("returns a task for a project member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    membership = { role_in_project: "member" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app).get("/api/tasks/task-1").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(taskRow);
  });

  it("rejects an update with no updatable fields", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    membership = { role_in_project: "member" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(400);
  });

  it("updates a task's status", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    const updatedTask = { ...taskRow, status: "in_progress" };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];

    const res = await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedTask);
  });

  it("logs a 'status' activity entry when a task's status changes", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", status: "todo" };
    const updatedTask = { ...taskRow, status: "in_progress" };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];

    await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ status: "in_progress" });

    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith("task_activity_log");
  });

  it("logs an assignee_id activity entry with a note when one is provided", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", assignee_id: null };
    const updatedTask = { ...taskRow, assignee_id: "user-2" };
    membership = { role_in_project: "member" };
    const activityChain = chain({ then: { error: null } });
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];
    activityLogQueue = [activityChain];

    await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ assignee_id: "user-2", assignee_note: "Bu hafta bitirebilir misin?" });

    expect(activityChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action_type: "assignee_id", note: "Bu hafta bitirebilir misin?" }),
    );
  });

  it("does not attach a note to a status activity entry even if assignee_note is sent", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", status: "todo" };
    const updatedTask = { ...taskRow, status: "in_progress" };
    membership = { role_in_project: "member" };
    const activityChain = chain({ then: { error: null } });
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];
    activityLogQueue = [activityChain];

    await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ status: "in_progress", assignee_note: "should be ignored" });

    expect(activityChain.insert).toHaveBeenCalledWith(expect.objectContaining({ action_type: "status", note: null }));
  });

  it("updates a task's tags", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", tags: [] };
    const updatedTask = { ...taskRow, tags: ["design", "review"] };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];

    const res = await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ tags: ["design", "review"] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedTask);
  });

  it("does not log a tags activity entry when the tags haven't actually changed", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", tags: ["review", "design"] };
    const updatedTask = { ...taskRow, title: "Design schema v2" };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ single: { data: updatedTask, error: null } }),
    ];
    vi.mocked(supabase.from).mockClear();

    await request(app)
      .patch("/api/tasks/task-1")
      .set("Authorization", "Bearer valid-token")
      .send({ title: "Design schema v2", tags: ["design", "review"] });

    expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith("task_activity_log");
  });

  it("returns 404 for a task's activity when the task doesn't exist", async () => {
    taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app)
      .get("/api/tasks/missing-task/activity")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("rejects a task's activity for a non-member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app)
      .get("/api/tasks/task-1/activity")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns a task's activity log for a project member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };
    membership = { role_in_project: "member" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
    const logRows = [
      { id: "log-1", action_type: "status", from_value: "todo", to_value: "in_progress", created_at: "2026-07-30T10:00:00.000Z" },
    ];
    activityLogQueue = [chain({ order: { data: logRows, error: null } })];

    const res = await request(app)
      .get("/api/tasks/task-1/activity")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(logRows);
  });

  it("returns 404 for a risk explanation on a task that doesn't exist", async () => {
    taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app)
      .post("/api/tasks/missing-task/risk-explanation")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });

  it("rejects a risk explanation for a non-member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", status: "todo" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app)
      .post("/api/tasks/task-1/risk-explanation")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns a rule-based score and an AI explanation for a project member", async () => {
    const taskRow = {
      id: "task-1",
      project_id: "project-1",
      title: "Design schema",
      status: "backlog",
      due_date: "2020-01-01",
      created_at: "2019-12-01T00:00:00.000Z",
    };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { data: [], error: null } }),
      chain({ then: { data: [], error: null } }),
    ];

    const res = await request(app)
      .post("/api/tasks/task-1/risk-explanation")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.level).toBe("high");
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.explanation).toBe(generateTextResult);
  });

  it("factors logged time into the risk score and mentions it in the AI prompt", async () => {
    const taskRow = {
      id: "task-1",
      project_id: "project-1",
      title: "Design schema",
      status: "in_progress",
      due_date: "2026-08-10",
      created_at: "2026-08-01T00:00:00.000Z",
      estimated_hours: 4,
    };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { data: [], error: null } }),
      chain({ then: { data: [{ minutes: 300 }, { minutes: 60 }], error: null } }), // 6 hours spent vs. a 4-hour estimate
    ];

    const res = await request(app)
      .post("/api/tasks/task-1/risk-explanation")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.factors.effort).toBeGreaterThan(0);

    const { interactiveAI } = await import("../ai/index.js");
    const promptArg = vi.mocked(interactiveAI.generateText).mock.calls.at(-1)?.[0] as string;
    expect(promptArg).toContain("Efor karşılaştırması");
    expect(promptArg).toContain("harcanan süre tahmini belirgin şekilde aşmış");
    expect(promptArg).not.toContain("4 saat");
    expect(promptArg).not.toContain("6.0 saat");
  });

  it("returns 502 when the AI explanation call throws", async () => {
    const taskRow = {
      id: "task-1",
      project_id: "project-1",
      title: "Design schema",
      status: "backlog",
      due_date: "2020-01-01",
      created_at: "2019-12-01T00:00:00.000Z",
    };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { data: [], error: null } }),
      chain({ then: { data: [], error: null } }),
    ];
    generateTextShouldThrow = true;

    const res = await request(app)
      .post("/api/tasks/task-1/risk-explanation")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(502);
  });

  it("rejects deleting another member's task for a plain member", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", created_by: "someone-else" };
    membership = { role_in_project: "member" };
    taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

    const res = await request(app).delete("/api/tasks/task-1").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("allows the task creator to delete their own task", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", created_by: "user-1" };
    membership = { role_in_project: "member" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { error: null } }),
    ];

    const res = await request(app).delete("/api/tasks/task-1").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(204);
  });

  it("allows a project admin to delete another member's task", async () => {
    const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema", created_by: "someone-else" };
    membership = { role_in_project: "admin" };
    taskResponses = [
      chain({ maybeSingle: { data: taskRow, error: null } }),
      chain({ then: { error: null } }),
    ];

    const res = await request(app).delete("/api/tasks/task-1").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(204);
  });
});
