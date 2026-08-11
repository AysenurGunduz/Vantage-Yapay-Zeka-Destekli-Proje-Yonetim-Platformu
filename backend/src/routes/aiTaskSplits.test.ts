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
let suggestionResponses: ReturnType<typeof chain>[] = [];
let taskResponses: ReturnType<typeof chain>[] = [];
let activityLogQueue: ReturnType<typeof chain>[] = [];
let generateJSONResult: unknown = { subtasks: [{ title: "Alt görev 1", estimated_hours: 2 }] };
let generateJSONQueue: unknown[] | null = null;
let generateJSONShouldThrow = false;

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
      if (table === "ai_task_suggestions") {
        return suggestionResponses.shift();
      }
      if (table === "tasks") {
        return taskResponses.shift();
      }
      if (table === "task_activity_log") {
        return activityLogQueue.length > 0 ? activityLogQueue.shift() : chain({ then: { error: null } });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

vi.mock("../ai/index.js", () => ({
  interactiveAI: {
    generateJSON: vi.fn(async () => {
      if (generateJSONShouldThrow) throw new Error("model unreachable");
      if (generateJSONQueue && generateJSONQueue.length > 0) {
        return generateJSONQueue.shift();
      }
      return generateJSONResult;
    }),
    generateText: vi.fn(async () => ""),
  },
}));

const { app } = await import("../app.js");
const { supabase } = await import("../lib/supabaseClient.js");
const { interactiveAI } = await import("../ai/index.js");

beforeEach(() => {
  vi.mocked(interactiveAI.generateJSON).mockClear();
  membership = null;
  suggestionResponses = [];
  taskResponses = [];
  activityLogQueue = [];
  generateJSONResult = { subtasks: [{ title: "Alt görev 1", estimated_hours: 2 }] };
  generateJSONQueue = null;
  generateJSONShouldThrow = false;
});

describe("ai task split routes", () => {
  describe("POST /api/projects/:projectId/ai/task-splits", () => {
    it("rejects a request without a description", async () => {
      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
    });

    it("rejects a non-project-member", async () => {
      membership = null;

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(403);
    });

    it("creates a pending suggestion from a valid AI response", async () => {
      membership = { role_in_project: "member" };
      const record = {
        id: "suggestion-1",
        project_id: "project-1",
        source_description: "Kullanıcı profil sayfasını yeniden tasarla",
        suggested_tasks: generateJSONResult,
        status: "pending",
      };
      suggestionResponses = [chain({ single: { data: record, error: null } })];

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(record);
    });

    it("returns 502 when the AI response doesn't match the expected schema", async () => {
      membership = { role_in_project: "member" };
      generateJSONResult = { oops: true };

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(502);
    });

    it("retries once with a correction prompt when the first response fails schema validation", async () => {
      membership = { role_in_project: "member" };
      const fixedResult = { subtasks: [{ title: "Düzeltilmiş alt görev" }] };
      generateJSONQueue = [{ oops: true }, fixedResult];
      const record = {
        id: "suggestion-1",
        project_id: "project-1",
        source_description: "Kullanıcı profil sayfasını yeniden tasarla",
        suggested_tasks: fixedResult,
        status: "pending",
      };
      suggestionResponses = [chain({ single: { data: record, error: null } })];

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(record);

      expect(interactiveAI.generateJSON).toHaveBeenCalledTimes(2);
      const secondPrompt = vi.mocked(interactiveAI.generateJSON).mock.calls[1][0] as string;
      expect(secondPrompt).toContain("Önceki cevabın bu şemaya uymadı");
    });

    it("gives up after one retry if the correction attempt also fails schema validation", async () => {
      membership = { role_in_project: "member" };
      generateJSONQueue = [{ oops: true }, { oops: true }];

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(502);
      expect(interactiveAI.generateJSON).toHaveBeenCalledTimes(2);
    });

    it("returns 502 when the AI call throws", async () => {
      membership = { role_in_project: "member" };
      generateJSONShouldThrow = true;

      const res = await request(app)
        .post("/api/projects/project-1/ai/task-splits")
        .set("Authorization", "Bearer valid-token")
        .send({ description: "Kullanıcı profil sayfasını yeniden tasarla" });

      expect(res.status).toBe(502);
    });
  });

  describe("PATCH /api/ai/task-splits/:id", () => {
    it("rejects an invalid status value", async () => {
      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "maybe" });

      expect(res.status).toBe(400);
    });

    it("returns 404 for a suggestion that doesn't exist", async () => {
      suggestionResponses = [chain({ maybeSingle: { data: null, error: null } })];

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "accepted" });

      expect(res.status).toBe(404);
    });

    it("rejects a non-project-member", async () => {
      membership = null;
      const suggestionRow = {
        id: "suggestion-1",
        project_id: "project-1",
        status: "pending",
        suggested_tasks: { subtasks: [{ title: "Alt görev 1" }] },
      };
      suggestionResponses = [chain({ maybeSingle: { data: suggestionRow, error: null } })];

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "accepted" });

      expect(res.status).toBe(403);
    });

    it("rejects resolving a suggestion that was already resolved", async () => {
      membership = { role_in_project: "member" };
      const suggestionRow = {
        id: "suggestion-1",
        project_id: "project-1",
        status: "accepted",
        suggested_tasks: { subtasks: [{ title: "Alt görev 1" }] },
      };
      suggestionResponses = [chain({ maybeSingle: { data: suggestionRow, error: null } })];

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "accepted" });

      expect(res.status).toBe(400);
    });

    it("creates real tasks and marks the suggestion accepted", async () => {
      membership = { role_in_project: "member" };
      const suggestionRow = {
        id: "suggestion-1",
        project_id: "project-1",
        status: "pending",
        suggested_tasks: { subtasks: [{ title: "Alt görev 1", estimated_hours: 2 }] },
      };
      const updatedRow = { ...suggestionRow, status: "accepted" };
      const createdTasks = [{ id: "task-1", project_id: "project-1", title: "Alt görev 1" }];

      suggestionResponses = [
        chain({ maybeSingle: { data: suggestionRow, error: null } }),
        chain({ single: { data: updatedRow, error: null } }),
      ];
      taskResponses = [chain({ then: { data: createdTasks, error: null } })];

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "accepted" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedRow);
      expect(vi.mocked(supabase.from)).toHaveBeenCalledWith("tasks");
    });

    it("does not create tasks when rejecting a suggestion", async () => {
      membership = { role_in_project: "member" };
      const suggestionRow = {
        id: "suggestion-1",
        project_id: "project-1",
        status: "pending",
        suggested_tasks: { subtasks: [{ title: "Alt görev 1" }] },
      };
      const updatedRow = { ...suggestionRow, status: "rejected" };

      suggestionResponses = [
        chain({ maybeSingle: { data: suggestionRow, error: null } }),
        chain({ single: { data: updatedRow, error: null } }),
      ];
      vi.mocked(supabase.from).mockClear();

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "rejected" });

      expect(res.status).toBe(200);
      expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith("tasks");
    });

    it("rejects edited suggested_tasks that don't match the expected schema", async () => {
      membership = { role_in_project: "member" };
      const suggestionRow = {
        id: "suggestion-1",
        project_id: "project-1",
        status: "pending",
        suggested_tasks: { subtasks: [{ title: "Alt görev 1" }] },
      };
      suggestionResponses = [chain({ maybeSingle: { data: suggestionRow, error: null } })];

      const res = await request(app)
        .patch("/api/ai/task-splits/suggestion-1")
        .set("Authorization", "Bearer valid-token")
        .send({ status: "accepted", suggested_tasks: { subtasks: [{ title: "" }] } });

      expect(res.status).toBe(400);
    });
  });
});
