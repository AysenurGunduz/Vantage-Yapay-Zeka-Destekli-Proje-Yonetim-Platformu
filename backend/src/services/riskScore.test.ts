import { describe, it, expect } from "vitest";
import { calculateDelayRisk, calculateProjectVelocity } from "./riskScore.js";

const NOW = new Date("2026-08-05T00:00:00.000Z");

describe("calculateDelayRisk", () => {
  it("returns zero risk for a done task regardless of other inputs", () => {
    const result = calculateDelayRisk({
      status: "done",
      dueDate: "2020-01-01",
      createdAt: "2020-01-01",
      projectAvgCompletionDays: 30,
      now: NOW,
    });

    expect(result).toEqual({
      score: 0,
      level: "low",
      factors: { deadline: 0, progress: 0, velocity: 0, effort: 0 },
    });
  });

  it("gives low risk to a fresh task with a far due date and no history", () => {
    const result = calculateDelayRisk({
      status: "todo",
      dueDate: "2026-09-04", // 30 days out
      createdAt: "2026-08-05",
      projectAvgCompletionDays: null,
      now: NOW,
    });

    expect(result.level).toBe("low");
    expect(result.score).toBe(0);
  });

  it("gives high risk to an overdue task with no progress", () => {
    const result = calculateDelayRisk({
      status: "backlog",
      dueDate: "2026-07-31", // 5 days overdue
      createdAt: "2026-07-21", // 10-day window
      projectAvgCompletionDays: null,
      now: NOW,
    });

    expect(result.level).toBe("high");
    expect(result.factors.deadline).toBeGreaterThan(0);
    expect(result.factors.progress).toBeGreaterThan(0);
  });

  it("gives medium risk to an overdue task that is nearly finished", () => {
    const result = calculateDelayRisk({
      status: "review",
      dueDate: "2026-07-31", // 5 days overdue
      createdAt: "2026-07-21",
      projectAvgCompletionDays: null,
      now: NOW,
    });

    expect(result.level).toBe("medium");
    expect(result.factors.progress).toBeLessThan(
      calculateDelayRisk({
        status: "backlog",
        dueDate: "2026-07-31",
        createdAt: "2026-07-21",
        projectAvgCompletionDays: null,
        now: NOW,
      }).factors.progress,
    );
  });

  it("raises risk when the project's historical velocity is slower than the remaining time", () => {
    const slow = calculateDelayRisk({
      status: "todo",
      dueDate: "2026-08-10", // 5 days remaining
      createdAt: "2026-08-01",
      projectAvgCompletionDays: 20, // way slower than the time left
      now: NOW,
    });
    const fast = calculateDelayRisk({
      status: "todo",
      dueDate: "2026-08-10",
      createdAt: "2026-08-01",
      projectAvgCompletionDays: 1,
      now: NOW,
    });

    expect(slow.factors.velocity).toBeGreaterThan(fast.factors.velocity);
    expect(slow.score).toBeGreaterThan(fast.score);
  });

  it("ignores the effort factor entirely when there's no time-tracking data", () => {
    const withoutData = calculateDelayRisk({
      status: "in_progress",
      dueDate: "2026-08-10",
      createdAt: "2026-08-01",
      projectAvgCompletionDays: null,
      now: NOW,
    });

    expect(withoutData.factors.effort).toBe(0);
  });

  it("raises risk when the time already spent has exceeded the estimate", () => {
    const withinEstimate = calculateDelayRisk({
      status: "in_progress",
      dueDate: "2026-08-10",
      createdAt: "2026-08-01",
      projectAvgCompletionDays: null,
      estimatedHours: 10,
      spentHours: 5,
      now: NOW,
    });
    const overEstimate = calculateDelayRisk({
      status: "in_progress",
      dueDate: "2026-08-10",
      createdAt: "2026-08-01",
      projectAvgCompletionDays: null,
      estimatedHours: 10,
      spentHours: 20,
      now: NOW,
    });

    expect(withinEstimate.factors.effort).toBe(0);
    expect(overEstimate.factors.effort).toBeGreaterThan(0);
    expect(overEstimate.score).toBeGreaterThan(withinEstimate.score);
  });

  it("doesn't lower the achievable score just because time-tracking data is missing", () => {
    // Same inputs as the "high risk overdue backlog" case above, minus effort data:
    // the score should be identical to before the effort factor existed.
    const result = calculateDelayRisk({
      status: "backlog",
      dueDate: "2026-07-31",
      createdAt: "2026-07-21",
      projectAvgCompletionDays: null,
      now: NOW,
    });

    expect(result.level).toBe("high");
  });

  it("treats a task with no due date as having no deadline or velocity risk", () => {
    const result = calculateDelayRisk({
      status: "backlog",
      dueDate: null,
      createdAt: "2026-08-01",
      projectAvgCompletionDays: 15,
      now: NOW,
    });

    expect(result.factors.deadline).toBe(0);
    expect(result.factors.velocity).toBe(0);
    expect(result.factors.progress).toBeGreaterThan(0);
  });
});

describe("calculateProjectVelocity", () => {
  it("returns null when there is no completed-task history", () => {
    expect(calculateProjectVelocity([])).toBeNull();
  });

  it("averages the completion time of done tasks in days", () => {
    const avg = calculateProjectVelocity([
      { created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-03T00:00:00.000Z" }, // 2 days
      { created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-05T00:00:00.000Z" }, // 4 days
    ]);

    expect(avg).toBe(3);
  });
});
