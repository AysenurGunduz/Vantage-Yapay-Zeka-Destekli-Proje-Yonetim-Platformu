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
let commentResponses: ReturnType<typeof chain>[] = [];
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
      if (table === "task_comments") {
        return commentResponses.shift();
      }
      if (table === "task_activity_log") {
        return activityLogQueue.length > 0 ? activityLogQueue.shift() : chain({ then: { error: null } });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

const taskRow = { id: "task-1", project_id: "project-1", title: "Design schema" };

beforeEach(() => {
  membership = null;
  taskResponses = [];
  commentResponses = [];
  activityLogQueue = [];
});

describe("task comments routes", () => {
  describe("GET /", () => {
    it("returns 404 when the task doesn't exist", async () => {
      taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app).get("/api/tasks/task-1/comments").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("rejects a non-member", async () => {
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

      const res = await request(app).get("/api/tasks/task-1/comments").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("lists comments oldest first", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      const comments = [
        { id: "c-1", task_id: "task-1", user_id: "user-1", content: "İlk yorum", created_at: "2026-08-10T09:00:00.000Z" },
        { id: "c-2", task_id: "task-1", user_id: "user-2", content: "İkinci yorum", created_at: "2026-08-10T10:00:00.000Z" },
      ];
      commentResponses = [chain({ order: { data: comments, error: null } })];

      const res = await request(app).get("/api/tasks/task-1/comments").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(comments);
    });
  });

  describe("POST /", () => {
    it("rejects empty content", async () => {
      const res = await request(app)
        .post("/api/tasks/task-1/comments")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "   " });

      expect(res.status).toBe(400);
    });

    it("rejects a non-member", async () => {
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];

      const res = await request(app)
        .post("/api/tasks/task-1/comments")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "Merhaba" });

      expect(res.status).toBe(403);
    });

    it("creates a comment and logs an activity entry", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      const insertedComment = { id: "c-1", task_id: "task-1", user_id: "user-1", content: "Merhaba", created_at: "2026-08-10T09:00:00.000Z" };
      commentResponses = [chain({ single: { data: insertedComment, error: null } })];
      const activityChain = chain({ then: { error: null } });
      activityLogQueue = [activityChain];

      const res = await request(app)
        .post("/api/tasks/task-1/comments")
        .set("Authorization", "Bearer valid-token")
        .send({ content: "Merhaba" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(insertedComment);
      expect(activityChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: "task-1", action_type: "commented" }),
      );
    });
  });

  describe("DELETE /:commentId", () => {
    it("returns 404 when the task doesn't exist", async () => {
      taskResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app).delete("/api/tasks/task-1/comments/c-1").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 404 when the comment doesn't exist", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      commentResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app).delete("/api/tasks/task-1/comments/c-1").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("rejects deleting someone else's comment as a plain member", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      commentResponses = [chain({ maybeSingle: { data: { id: "c-1", user_id: "user-2" }, error: null } })];

      const res = await request(app).delete("/api/tasks/task-1/comments/c-1").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("lets the author delete their own comment", async () => {
      membership = { role_in_project: "member" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      commentResponses = [
        chain({ maybeSingle: { data: { id: "c-1", user_id: "user-1" }, error: null } }),
        chain({ then: { error: null } }),
      ];

      const res = await request(app).delete("/api/tasks/task-1/comments/c-1").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });

    it("lets a project admin delete someone else's comment", async () => {
      membership = { role_in_project: "admin" };
      taskResponses = [chain({ maybeSingle: { data: taskRow, error: null } })];
      commentResponses = [
        chain({ maybeSingle: { data: { id: "c-1", user_id: "user-2" }, error: null } }),
        chain({ then: { error: null } }),
      ];

      const res = await request(app).delete("/api/tasks/task-1/comments/c-1").set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(204);
    });
  });
});
