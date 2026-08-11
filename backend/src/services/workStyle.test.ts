import { describe, it, expect } from "vitest";
import { calculateWorkStyleTraits, type WorkStyleTaskInput } from "./workStyle.js";

function task(overrides: Partial<WorkStyleTaskInput> = {}): WorkStyleTaskInput {
  return {
    status: "done",
    priority: "medium",
    dueDate: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    estimatedHours: null,
    spentHours: null,
    tags: [],
    ...overrides,
  };
}

describe("calculateWorkStyleTraits", () => {
  it("returns all-empty traits for no tasks", () => {
    const traits = calculateWorkStyleTraits([]);

    expect(traits).toEqual({
      completedTaskCount: 0,
      onTimeRate: null,
      avgCompletionDays: null,
      effortAccuracy: null,
      topTags: [],
      priorityMix: { low: 0, medium: 0, high: 0, urgent: 0 },
    });
  });

  it("ignores tasks that aren't done", () => {
    const traits = calculateWorkStyleTraits([task({ status: "in_progress" }), task({ status: "todo" })]);

    expect(traits.completedTaskCount).toBe(0);
  });

  it("computes on-time rate only from completed tasks that had a due date", () => {
    const traits = calculateWorkStyleTraits([
      task({ dueDate: "2026-08-05", updatedAt: "2026-08-03T00:00:00.000Z" }), // on time
      task({ dueDate: "2026-08-02", updatedAt: "2026-08-03T00:00:00.000Z" }), // late
      task({ dueDate: null }), // excluded, no due date
    ]);

    expect(traits.completedTaskCount).toBe(3);
    expect(traits.onTimeRate).toBeCloseTo(0.5);
  });

  it("returns a null on-time rate when no completed task had a due date", () => {
    const traits = calculateWorkStyleTraits([task({ dueDate: null }), task({ dueDate: null })]);

    expect(traits.onTimeRate).toBeNull();
  });

  it("computes the average completion time in days", () => {
    const traits = calculateWorkStyleTraits([
      task({ createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" }), // 2 days
      task({ createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z" }), // 4 days
    ]);

    expect(traits.avgCompletionDays).toBeCloseTo(3);
  });

  it("computes effort accuracy only from tasks with both an estimate and logged time", () => {
    const traits = calculateWorkStyleTraits([
      task({ estimatedHours: 4, spentHours: 6 }), // 1.5x
      task({ estimatedHours: 2, spentHours: 2 }), // 1x
      task({ estimatedHours: null, spentHours: 3 }), // excluded, no estimate
      task({ estimatedHours: 5, spentHours: null }), // excluded, nothing logged
    ]);

    expect(traits.effortAccuracy).toBeCloseTo(1.25);
  });

  it("ranks the top 3 most common tags across completed tasks", () => {
    const traits = calculateWorkStyleTraits([
      task({ tags: ["frontend", "bug"] }),
      task({ tags: ["frontend"] }),
      task({ tags: ["backend"] }),
      task({ tags: ["backend"] }),
      task({ tags: ["backend"] }),
      task({ tags: ["design"] }),
      task({ tags: ["design"] }),
    ]);

    expect(traits.topTags).toEqual(["backend", "frontend", "design"]);
  });

  it("tallies completed tasks by priority", () => {
    const traits = calculateWorkStyleTraits([
      task({ priority: "urgent" }),
      task({ priority: "urgent" }),
      task({ priority: "low" }),
      task({ status: "todo", priority: "high" }), // not done, excluded
    ]);

    expect(traits.priorityMix).toEqual({ low: 1, medium: 0, high: 0, urgent: 2 });
  });
});
