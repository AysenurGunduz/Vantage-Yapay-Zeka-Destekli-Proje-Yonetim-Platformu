import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

function chain(result: unknown) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return obj;
}

let membershipRows: { project_id: string; projects: { name: string } | null }[] = [];
let taskRows: {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string;
  created_at?: string;
  updated_at?: string;
}[] = [];
let activityRows: {
  id: string;
  task_id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}[] = [];
let timeEntryRows: { task_id: string; minutes: number }[] = [];

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
        return chain({ data: membershipRows, error: null });
      }
      if (table === "tasks") {
        return chain({ data: taskRows, error: null });
      }
      if (table === "task_activity_log") {
        return chain({ data: activityRows, error: null });
      }
      if (table === "task_time_entries") {
        return chain({ data: timeEntryRows, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

function daysFromToday(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  membershipRows = [];
  taskRows = [];
  activityRows = [];
  timeEntryRows = [];
});

describe("dashboard routes", () => {
  it("returns zeroed stats when the user has no projects", async () => {
    const res = await request(app).get("/api/dashboard/stats").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalTasks: 0,
      byStatus: { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 },
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
      overdueTasks: [],
      dueSoonTasks: [],
      byProject: [],
    });
  });

  it("aggregates task counts by status, priority, and project, and splits overdue from due-soon", async () => {
    membershipRows = [{ project_id: "project-1", projects: { name: "Website Yenileme" } }];
    taskRows = [
      { id: "task-1", title: "Old task", status: "todo", priority: "high", due_date: "2020-01-01", project_id: "project-1" },
      { id: "task-2", title: "Done task", status: "done", priority: "low", due_date: "2020-01-01", project_id: "project-1" },
      { id: "task-3", title: "Fresh task", status: "in_progress", priority: "urgent", due_date: null, project_id: "project-1" },
      { id: "task-4", title: "Soon task", status: "todo", priority: "medium", due_date: daysFromToday(2), project_id: "project-1" },
      { id: "task-5", title: "Far task", status: "todo", priority: "medium", due_date: daysFromToday(30), project_id: "project-1" },
    ];

    const res = await request(app).get("/api/dashboard/stats").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.totalTasks).toBe(5);
    expect(res.body.byStatus).toEqual({ backlog: 0, todo: 3, in_progress: 1, review: 0, done: 1 });
    expect(res.body.byPriority).toEqual({ low: 1, medium: 2, high: 1, urgent: 1 });
    expect(res.body.overdueTasks).toEqual([
      { id: "task-1", title: "Old task", status: "todo", priority: "high", due_date: "2020-01-01", project_id: "project-1" },
    ]);
    expect(res.body.dueSoonTasks).toEqual([
      { id: "task-4", title: "Soon task", status: "todo", priority: "medium", due_date: daysFromToday(2), project_id: "project-1" },
    ]);
    expect(res.body.byProject).toEqual([{ project_id: "project-1", project_name: "Website Yenileme", count: 5 }]);
  });

  it("rejects requests without a valid token", async () => {
    const res = await request(app).get("/api/dashboard/stats").set("Authorization", "Bearer bad-token");

    expect(res.status).toBe(401);
  });

  it("returns an empty activity feed when the user has no projects", async () => {
    const res = await request(app).get("/api/dashboard/activity").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns an empty risk list when the user has no projects", async () => {
    const res = await request(app).get("/api/dashboard/risk").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("scores non-done tasks by delay risk and sorts them highest-risk first", async () => {
    membershipRows = [{ project_id: "project-1", projects: { name: "Website Yenileme" } }];
    taskRows = [
      {
        id: "task-1",
        title: "Overdue and untouched",
        status: "backlog",
        priority: "high",
        due_date: "2020-01-01",
        project_id: "project-1",
        created_at: "2019-12-01T00:00:00.000Z",
        updated_at: "2019-12-01T00:00:00.000Z",
      },
      {
        id: "task-2",
        title: "Fresh task, far deadline",
        status: "todo",
        priority: "low",
        due_date: daysFromToday(60),
        project_id: "project-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "task-3",
        title: "Already done",
        status: "done",
        priority: "medium",
        due_date: "2020-01-01",
        project_id: "project-1",
        created_at: "2019-12-01T00:00:00.000Z",
        updated_at: "2019-12-15T00:00:00.000Z",
      },
    ];

    const res = await request(app).get("/api/dashboard/risk").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.every((task: { status: string }) => task.status !== "done")).toBe(true);
    expect(res.body[0].id).toBe("task-1");
    expect(res.body[0].risk_level).toBe("high");
    expect(res.body.map((task: { id: string }) => task.id)).not.toContain("task-3");
  });

  it("raises a task's risk score when logged time has exceeded its estimate", async () => {
    membershipRows = [{ project_id: "project-1", projects: { name: "Website Yenileme" } }];
    const baseTask = {
      id: "task-1",
      title: "Backend entegrasyonu",
      status: "in_progress",
      priority: "medium",
      due_date: daysFromToday(5),
      project_id: "project-1",
      created_at: daysFromToday(-4),
      updated_at: daysFromToday(-4),
      estimated_hours: 4,
    };
    taskRows = [baseTask];

    const res1 = await request(app).get("/api/dashboard/risk").set("Authorization", "Bearer valid-token");
    const scoreWithoutOverrun = res1.body[0]?.risk_score ?? 0;

    timeEntryRows = [{ task_id: "task-1", minutes: 600 }]; // 10 hours logged vs. a 4-hour estimate
    const res2 = await request(app).get("/api/dashboard/risk").set("Authorization", "Bearer valid-token");
    const scoreWithOverrun = res2.body[0]?.risk_score ?? 0;

    expect(scoreWithOverrun).toBeGreaterThan(scoreWithoutOverrun);
  });

  it("filters the risk list to a single project when projectId is given", async () => {
    membershipRows = [
      { project_id: "project-1", projects: { name: "Website Yenileme" } },
      { project_id: "project-2", projects: { name: "Mobil Uygulama" } },
    ];
    taskRows = [
      {
        id: "task-1",
        title: "Proje 1 görevi",
        status: "backlog",
        priority: "high",
        due_date: "2020-01-01",
        project_id: "project-1",
        created_at: "2019-12-01T00:00:00.000Z",
        updated_at: "2019-12-01T00:00:00.000Z",
      },
      {
        id: "task-2",
        title: "Proje 2 görevi",
        status: "backlog",
        priority: "high",
        due_date: "2020-01-01",
        project_id: "project-2",
        created_at: "2019-12-01T00:00:00.000Z",
        updated_at: "2019-12-01T00:00:00.000Z",
      },
    ];

    const res = await request(app)
      .get("/api/dashboard/risk?projectId=project-2")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("task-2");
  });

  it("returns the recent activity feed with task titles attached", async () => {
    membershipRows = [{ project_id: "project-1", projects: { name: "Website Yenileme" } }];
    taskRows = [{ id: "task-1", title: "Design schema", status: "todo", priority: "medium", due_date: null, project_id: "project-1" }];
    activityRows = [
      {
        id: "log-1",
        task_id: "task-1",
        action_type: "status",
        from_value: "todo",
        to_value: "in_progress",
        created_at: "2026-07-29T10:00:00.000Z",
      },
    ];

    const res = await request(app).get("/api/dashboard/activity").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: "log-1",
        task_id: "task-1",
        action_type: "status",
        from_value: "todo",
        to_value: "in_progress",
        created_at: "2026-07-29T10:00:00.000Z",
        task_title: "Design schema",
      },
    ]);
  });
});
