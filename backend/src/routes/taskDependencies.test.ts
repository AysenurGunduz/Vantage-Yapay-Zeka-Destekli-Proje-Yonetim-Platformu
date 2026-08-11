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
    delete: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
    single: vi.fn(() => Promise.resolve(config.single)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(config.then).then(resolve),
  };
  return obj;
}

let membership: { role_in_project: string } | null = null;
let taskResponses: ReturnType<typeof chain>[] = [];
let dependencyResponses: ReturnType<typeof chain>[] = [];
let activityLogQueue: ReturnType<typeof chain>[] = [];

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
      if (table === "tasks") {
        return taskResponses.shift();
      }
      if (table === "task_dependencies") {
        return dependencyResponses.shift();
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
  dependencyResponses = [];
  activityLogQueue = [];
});

const taskRow = { id: "task-1", project_id: "project-1", title: "Ana görev", status: "todo" };

describe("task dependencies routes", () => {
  describe("GET /", () => {
    it("returns 404 when the task doesn't exist", async () => {
      taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app).get("/api/tasks/task-1/dependencies").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("rejects a non-member", async () => {
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

      const res = await request(app).get("/api/tasks/task-1/dependencies").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns an empty list when there are no dependencies", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      dependencyResponses = [chain({ then: { data: [], error: null } }), chain({ then: { data: [], error: null } })];

      const res = await request(app).get("/api/tasks/task-1/dependencies").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("combines outgoing and incoming dependencies with related task info", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [
        chain({ maybeSingle: { data: taskRow, error: null } }),
        chain({ then: { data: [{ id: "related-1", title: "Bağımlı görev", status: "in_progress" }], error: null } }),
      ];
      dependencyResponses = [
        chain({ then: { data: [{ id: "dep-1", dependency_type: "blocked_by", depends_on_task_id: "related-1" }], error: null } }),
        chain({ then: { data: [], error: null } }),
      ];

      const res = await request(app).get("/api/tasks/task-1/dependencies").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: "dep-1",
          direction: "outgoing",
          dependency_type: "blocked_by",
          related_task: { id: "related-1", title: "Bağımlı görev", status: "in_progress" },
        },
      ]);
    });
  });

  describe("POST /", () => {
    it("rejects an invalid dependency_type", async () => {
      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "nonsense", related_task_id: "task-2" });

      expect(res.status).toBe(400);
    });

    it("rejects a missing related_task_id", async () => {
      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "relates_to" });

      expect(res.status).toBe(400);
    });

    it("rejects a task depending on itself", async () => {
      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "relates_to", related_task_id: "task-1" });

      expect(res.status).toBe(400);
    });

    it("rejects a non-member", async () => {
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "relates_to", related_task_id: "task-2" });

      expect(res.status).toBe(403);
    });

    it("rejects a related task from a different project", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [
        chain({ maybeSingle: { data: taskRow, error: null } }),
        chain({ maybeSingle: { data: { id: "task-2", project_id: "other-project", title: "Başka proje", status: "todo" }, error: null } }),
      ];

      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "relates_to", related_task_id: "task-2" });

      expect(res.status).toBe(400);
    });

    it("creates a dependency and logs an activity entry", async () => {
      membership = { role_in_project: "member" };
      const relatedTask = { id: "task-2", project_id: "project-1", title: "İkinci görev", status: "todo" };
      const insertedDependency = { id: "dep-1", dependency_type: "blocked_by" };
      taskResponses = [
        chain({ maybeSingle: { data: taskRow, error: null } }),
        chain({ maybeSingle: { data: relatedTask, error: null } }),
      ];
      dependencyResponses = [chain({ single: { data: insertedDependency, error: null } })];
      const activityChain = chain({ then: { error: null } });
      activityLogQueue = [activityChain];

      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "blocked_by", related_task_id: "task-2" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: "dep-1",
        direction: "outgoing",
        dependency_type: "blocked_by",
        related_task: { id: "task-2", title: "İkinci görev", status: "todo" },
      });
      expect(activityChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: "task-1", action_type: "dependency_added" }),
      );
    });

    it("returns 409 when the same dependency already exists", async () => {
      membership = { role_in_project: "member" };
      const relatedTask = { id: "task-2", project_id: "project-1", title: "İkinci görev", status: "todo" };
      taskResponses = [
        chain({ maybeSingle: { data: taskRow, error: null } }),
        chain({ maybeSingle: { data: relatedTask, error: null } }),
      ];
      dependencyResponses = [chain({ single: { data: null, error: { code: "23505", message: "duplicate key" } } })];

      const res = await request(app)
        .post("/api/tasks/task-1/dependencies")
        .set("Authorization", "Bearer valid-token")
        .send({ dependency_type: "blocked_by", related_task_id: "task-2" });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /:dependencyId", () => {
    it("returns 404 when the task doesn't exist", async () => {
      taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app)
        .delete("/api/tasks/task-1/dependencies/dep-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("rejects a non-member", async () => {
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

      const res = await request(app)
        .delete("/api/tasks/task-1/dependencies/dep-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 404 when the dependency doesn't belong to this task", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      dependencyResponses = [
        chain({ maybeSingle: { data: { id: "dep-1", task_id: "other-task", depends_on_task_id: "other-task-2" }, error: null } }),
      ];

      const res = await request(app)
        .delete("/api/tasks/task-1/dependencies/dep-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("deletes the dependency", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      dependencyResponses = [
        chain({ maybeSingle: { data: { id: "dep-1", task_id: "task-1", depends_on_task_id: "task-2" }, error: null } }),
        chain({ then: { error: null } }),
      ];

      const res = await request(app)
        .delete("/api/tasks/task-1/dependencies/dep-1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });
  });
});
