import { describe, it, expect, vi, beforeEach } from "vitest";

let scheduledCallback: (() => void) | null = null;
const scheduleMock = vi.fn((_expression: string, callback: () => void) => {
  scheduledCallback = callback;
  return { stop: vi.fn() };
});

vi.mock("node-cron", () => ({
  default: { schedule: (...args: [string, () => void]) => scheduleMock(...args) },
}));

const { scheduleProgressSummaryJob, DEFAULT_SCHEDULE } = await import("./progressSummaryScheduler.js");

beforeEach(() => {
  scheduleMock.mockClear();
  scheduledCallback = null;
});

describe("scheduleProgressSummaryJob", () => {
  it("registers the job on the default schedule when none is given", () => {
    scheduleProgressSummaryJob(async () => {});

    expect(scheduleMock).toHaveBeenCalledWith(DEFAULT_SCHEDULE, expect.any(Function));
  });

  it("registers the job on a custom schedule when provided", () => {
    scheduleProgressSummaryJob(async () => {}, "*/5 * * * *");

    expect(scheduleMock).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));
  });

  it("invokes the job callback when the schedule fires", async () => {
    const runJob = vi.fn(async () => {});
    scheduleProgressSummaryJob(runJob);

    scheduledCallback?.();
    await Promise.resolve();

    expect(runJob).toHaveBeenCalledTimes(1);
  });

  it("logs instead of throwing when the job callback rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const runJob = vi.fn(async () => {
      throw new Error("boom");
    });
    scheduleProgressSummaryJob(runJob);

    expect(() => scheduledCallback?.()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleErrorSpy).toHaveBeenCalledWith("Progress summary job failed:", "boom");
    consoleErrorSpy.mockRestore();
  });
});
