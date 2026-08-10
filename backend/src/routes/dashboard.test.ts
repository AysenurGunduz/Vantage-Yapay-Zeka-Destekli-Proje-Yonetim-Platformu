import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

function chain(result: unknown) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    neq: vi.fn(() => obj),
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
}[] = [];
let activityRows: {
  id: string;
  task_id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}[] = [];

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

  it("returns an empty my-tasks list when the user has no projects", async () => {
    const res = await request(app).get("/api/dashboard/my-tasks").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("attaches project names to my-tasks and sorts by due date with no-due-date tasks last", async () => {
    membershipRows = [
      { project_id: "project-1", projects: { name: "Website Yenileme" } },
      { project_id: "project-2", projects: { name: "Mobil Uygulama" } },
    ];
    taskRows = [
      { id: "task-1", title: "Vade yok", status: "todo", priority: "medium", due_date: null, project_id: "project-1" },
      { id: "task-2", title: "Yakın vade", status: "in_progress", priority: "high", due_date: "2026-08-01", project_id: "project-2" },
      { id: "task-3", title: "Uzak vade", status: "todo", priority: "low", due_date: "2026-08-10", project_id: "project-1" },
    ];

    const res = await request(app).get("/api/dashboard/my-tasks").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.map((t: { title: string }) => t.title)).toEqual(["Yakın vade", "Uzak vade", "Vade yok"]);
    expect(res.body[0].project_name).toBe("Mobil Uygulama");
    expect(res.body[2].project_name).toBe("Website Yenileme");
  });
});
