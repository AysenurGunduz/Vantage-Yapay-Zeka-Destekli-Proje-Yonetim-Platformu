import { describe, it, expect, vi, beforeEach } from "vitest";

type ChainConfig = {
  single?: unknown;
  then?: unknown;
};

function chain(config: ChainConfig) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    single: vi.fn(() => Promise.resolve(config.single)),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(config.then).then(resolve),
  };
  return obj;
}

let projectsResponse: ReturnType<typeof chain>;
let taskResponses: ReturnType<typeof chain>[] = [];
let summaryResponses: ReturnType<typeof chain>[] = [];
let generateTextResult = "Bu dönemde ekip iyi bir ilerleme kaydetti.";
let generateTextShouldThrow = false;

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "projects") return projectsResponse;
      if (table === "tasks") return taskResponses.shift();
      if (table === "progress_summaries") return summaryResponses.shift();
      throw new Error(`Unexpected table: ${table}`);
    }),
  },
}));

vi.mock("../ai/index.js", () => ({
  backgroundAI: {
    generateText: vi.fn(async () => {
      if (generateTextShouldThrow) throw new Error("model unreachable");
      return generateTextResult;
    }),
  },
}));

const { generateAndSaveProjectSummary, runProgressSummaryJob } = await import("./runProgressSummaryJob.js");
const { backgroundAI } = await import("../ai/index.js");

const PERIOD_START = new Date("2026-08-05T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-12T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  taskResponses = [];
  summaryResponses = [];
  generateTextResult = "Bu dönemde ekip iyi bir ilerleme kaydetti.";
  generateTextShouldThrow = false;
});

describe("generateAndSaveProjectSummary", () => {
  it("returns null and skips the AI call for a project with no tasks", async () => {
    taskResponses = [chain({ then: { data: [], error: null } })];

    const result = await generateAndSaveProjectSummary("p1", "Proje", PERIOD_START, PERIOD_END);

    expect(result).toBeNull();
    expect(backgroundAI.generateText).not.toHaveBeenCalled();
  });

  it("generates and saves a summary for a project with tasks", async () => {
    taskResponses = [
      chain({
        then: {
          data: [{ status: "done", title: "Görev A", due_date: null, updated_at: "2026-08-08T00:00:00.000Z" }],
          error: null,
        },
      }),
    ];
    const saved = {
      id: "s1",
      project_id: "p1",
      period_start: "2026-08-05",
      period_end: "2026-08-12",
      summary: "Bu dönemde ekip iyi bir ilerleme kaydetti.",
      model_used: "background",
      generated_at: "2026-08-12T00:00:00.000Z",
    };
    summaryResponses = [chain({ single: { data: saved, error: null } })];

    const result = await generateAndSaveProjectSummary("p1", "Proje", PERIOD_START, PERIOD_END);

    expect(result).toEqual(saved);
    expect(backgroundAI.generateText).toHaveBeenCalledOnce();
  });

  it("throws when saving fails", async () => {
    taskResponses = [
      chain({ then: { data: [{ status: "done", title: "Görev A", due_date: null, updated_at: "2026-08-08T00:00:00.000Z" }], error: null } }),
    ];
    summaryResponses = [chain({ single: { data: null, error: { message: "insert failed" } } })];

    await expect(generateAndSaveProjectSummary("p1", "Proje", PERIOD_START, PERIOD_END)).rejects.toThrow("insert failed");
  });
});

describe("runProgressSummaryJob", () => {
  it("processes every project, skipping ones with no tasks", async () => {
    projectsResponse = chain({ then: { data: [{ id: "p1", name: "Proje 1" }, { id: "p2", name: "Proje 2" }], error: null } });
    taskResponses = [
      chain({ then: { data: [], error: null } }),
      chain({
        then: {
          data: [{ status: "done", title: "Görev A", due_date: null, updated_at: "2026-08-08T00:00:00.000Z" }],
          error: null,
        },
      }),
    ];
    summaryResponses = [
      chain({
        single: {
          data: {
            id: "s1",
            project_id: "p2",
            period_start: "2026-08-05",
            period_end: "2026-08-12",
            summary: "Özet",
            model_used: "background",
            generated_at: "2026-08-12T00:00:00.000Z",
          },
          error: null,
        },
      }),
    ];

    await runProgressSummaryJob();

    expect(backgroundAI.generateText).toHaveBeenCalledOnce();
  });

  it("continues to the next project when one project's summary generation throws", async () => {
    projectsResponse = chain({ then: { data: [{ id: "p1", name: "Proje 1" }, { id: "p2", name: "Proje 2" }], error: null } });
    taskResponses = [
      chain({ then: { data: null, error: { message: "tasks query failed" } } }),
      chain({
        then: {
          data: [{ status: "done", title: "Görev A", due_date: null, updated_at: "2026-08-08T00:00:00.000Z" }],
          error: null,
        },
      }),
    ];
    summaryResponses = [
      chain({
        single: {
          data: {
            id: "s1",
            project_id: "p2",
            period_start: "2026-08-05",
            period_end: "2026-08-12",
            summary: "Özet",
            model_used: "background",
            generated_at: "2026-08-12T00:00:00.000Z",
          },
          error: null,
        },
      }),
    ];
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runProgressSummaryJob();

    expect(consoleSpy).toHaveBeenCalled();
    expect(backgroundAI.generateText).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("logs and continues when loading projects fails", async () => {
    projectsResponse = chain({ then: { data: null, error: { message: "db down" } } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runProgressSummaryJob();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
