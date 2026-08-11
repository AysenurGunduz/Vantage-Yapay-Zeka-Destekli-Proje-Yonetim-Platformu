import { describe, it, expect } from "vitest";
import { suggestAssignees, type AssignmentCandidate, type TaskRequirements } from "./assignmentSuggestion.js";
import type { WorkStyleTraits } from "./workStyle.js";

const REFERENCE_DATE = new Date("2026-08-11T00:00:00.000Z");

function traits(overrides: Partial<WorkStyleTraits> = {}): WorkStyleTraits {
  return {
    completedTaskCount: 10,
    onTimeRate: null,
    avgCompletionDays: null,
    effortAccuracy: null,
    topTags: [],
    priorityMix: { low: 0, medium: 0, high: 0, urgent: 0 },
    ...overrides,
  };
}

function candidate(userId: string, overrides: Partial<WorkStyleTraits> = {}): AssignmentCandidate {
  return { userId, traits: traits(overrides) };
}

function requirements(overrides: Partial<TaskRequirements> = {}): TaskRequirements {
  return { priority: "medium", dueDate: null, tags: [], ...overrides };
}

describe("suggestAssignees", () => {
  it("ranks a candidate with matching tags above one without", () => {
    const results = suggestAssignees(
      requirements({ tags: ["backend", "api"] }),
      [candidate("no-match", { topTags: ["design"] }), candidate("match", { topTags: ["backend", "api"] })],
      REFERENCE_DATE,
    );

    expect(results[0].userId).toBe("match");
    expect(results[0].reasons[0]).toContain("backend");
  });

  it("gives no candidates a tag bonus when the task has no tags", () => {
    const results = suggestAssignees(
      requirements({ tags: [] }),
      [candidate("a", { topTags: ["backend"] }), candidate("b", { topTags: ["design"] })],
      REFERENCE_DATE,
    );

    expect(results[0].score).toBe(results[1].score);
  });

  it("ranks a reliable candidate above an unreliable one for an urgent task", () => {
    const results = suggestAssignees(
      requirements({ priority: "urgent" }),
      [candidate("unreliable", { onTimeRate: 0.3 }), candidate("reliable", { onTimeRate: 0.9 })],
      REFERENCE_DATE,
    );

    expect(results[0].userId).toBe("reliable");
    expect(results[0].reasons).toContain("yüksek öncelikli görevlerde zamanında teslim geçmişi güçlü");
  });

  it("flags an unreliable candidate for an urgent task", () => {
    const results = suggestAssignees(
      requirements({ priority: "urgent" }),
      [candidate("unreliable", { onTimeRate: 0.3 })],
      REFERENCE_DATE,
    );

    expect(results[0].reasons).toContain("geçmişte gecikme eğilimi var, bu öncelikli görev yakından takip gerektirebilir");
  });

  it("does not add a reliability reason for a non-urgent task", () => {
    const results = suggestAssignees(
      requirements({ priority: "low" }),
      [candidate("someone", { onTimeRate: 0.9 })],
      REFERENCE_DATE,
    );

    expect(results[0].reasons).toEqual([]);
  });

  it("prefers a fast completer when the due date is close", () => {
    const results = suggestAssignees(
      requirements({ dueDate: "2026-08-13" }),
      [candidate("slow", { avgCompletionDays: 8 }), candidate("fast", { avgCompletionDays: 1 })],
      REFERENCE_DATE,
    );

    expect(results[0].userId).toBe("fast");
    expect(results[0].reasons).toContain("bu son tarihe rahatlıkla yetişebilecek bir tamamlama hızına sahip");
  });

  it("flags a slow completer when the due date is tight relative to their pace", () => {
    const results = suggestAssignees(
      requirements({ dueDate: "2026-08-12" }),
      [candidate("slow", { avgCompletionDays: 10 })],
      REFERENCE_DATE,
    );

    expect(results[0].reasons).toContain("geçmiş tamamlama hızına göre bu son tarih zorlayıcı olabilir");
  });

  it("ignores completion speed when the due date is far away", () => {
    const results = suggestAssignees(
      requirements({ dueDate: "2026-09-20" }),
      [candidate("slow", { avgCompletionDays: 10 }), candidate("fast", { avgCompletionDays: 1 })],
      REFERENCE_DATE,
    );

    expect(results[0].score).toBe(results[1].score);
  });

  it("gives a candidate with no task history a neutral score and no reasons", () => {
    const results = suggestAssignees(requirements(), [candidate("new-member", { completedTaskCount: 0 })], REFERENCE_DATE);

    expect(results[0].score).toBe(50);
    expect(results[0].reasons).toEqual([]);
  });

  it("sorts candidates by descending score", () => {
    const results = suggestAssignees(
      requirements({ tags: ["backend"] }),
      [candidate("low", { topTags: [] }), candidate("high", { topTags: ["backend"] }), candidate("mid", { topTags: [] })],
      REFERENCE_DATE,
    );

    expect(results.map((r) => r.score)).toEqual([...results.map((r) => r.score)].sort((a, b) => b - a));
  });
});
