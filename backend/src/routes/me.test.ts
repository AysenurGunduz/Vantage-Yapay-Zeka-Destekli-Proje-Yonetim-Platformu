import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

type ChainConfig = {
  maybeSingle?: unknown;
  single?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    update: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    maybeSingle: vi.fn(() => Promise.resolve(config.maybeSingle)),
    single: vi.fn(() => Promise.resolve(config.single)),
  };
  return obj;
}

let profileResponses: ReturnType<typeof chain>[] = [];

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
      if (table === "profiles") return profileResponses.shift();
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

const { app } = await import("../app.js");

beforeEach(() => {
  profileResponses = [];
});

describe("GET /api/me", () => {
  it("returns the caller's profile", async () => {
    const profile = { id: "user-1", full_name: "Ayşe", avatar_url: null, title: null, usage_purpose: null, self_reported_traits: null };
    profileResponses = [chain({ maybeSingle: { data: profile, error: null } })];

    const res = await request(app).get("/api/me").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(profile);
  });

  it("returns 404 when the profile row is missing", async () => {
    profileResponses = [chain({ maybeSingle: { data: null, error: null } })];

    const res = await request(app).get("/api/me").set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/me", () => {
  it("rejects an invalid usage_purpose", async () => {
    const res = await request(app)
      .patch("/api/me")
      .set("Authorization", "Bearer valid-token")
      .send({ usage_purpose: "not-a-real-purpose" });

    expect(res.status).toBe(400);
  });

  it("rejects an empty body", async () => {
    const res = await request(app).patch("/api/me").set("Authorization", "Bearer valid-token").send({});

    expect(res.status).toBe(400);
  });

  it("updates usage_purpose", async () => {
    const updated = { id: "user-1", full_name: "Ayşe", avatar_url: null, title: null, usage_purpose: "work", self_reported_traits: null };
    profileResponses = [chain({ single: { data: updated, error: null } })];

    const res = await request(app).patch("/api/me").set("Authorization", "Bearer valid-token").send({ usage_purpose: "work" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });

  it("updates self_reported_traits", async () => {
    const traits = { collaboration_style: "independent", problem_solving_style: "plan_first" };
    const updated = { id: "user-1", full_name: "Ayşe", avatar_url: null, title: null, usage_purpose: null, self_reported_traits: traits };
    profileResponses = [chain({ single: { data: updated, error: null } })];

    const res = await request(app)
      .patch("/api/me")
      .set("Authorization", "Bearer valid-token")
      .send({ self_reported_traits: traits });

    expect(res.status).toBe(200);
    expect(res.body.self_reported_traits).toEqual(traits);
  });
});
