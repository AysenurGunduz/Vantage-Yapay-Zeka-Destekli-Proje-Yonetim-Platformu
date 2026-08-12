import { describe, it, expect } from "vitest";
import { collectProjectProgressData, buildProgressSummaryPrompt, type TaskProgressRow } from "./progressSummary.js";

const PERIOD_START = new Date("2026-08-05T00:00:00.000Z");
const PERIOD_END = new Date("2026-08-12T00:00:00.000Z");

function task(overrides: Partial<TaskProgressRow> = {}): TaskProgressRow {
  return {
    status: "done",
    title: "Görev",
    due_date: null,
    updated_at: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("collectProjectProgressData", () => {
  it("returns all-zero data for a project with no tasks", () => {
    const data = collectProjectProgressData("p1", "Proje", [], PERIOD_START, PERIOD_END);

    expect(data).toEqual({
      projectId: "p1",
      projectName: "Proje",
      periodStart: "2026-08-05",
      periodEnd: "2026-08-12",
      totalTasks: 0,
      completedInPeriod: [],
      inProgressCount: 0,
      overdueCount: 0,
      completionRatePercent: 0,
    });
  });

  it("only counts tasks completed within the period", () => {
    const data = collectProjectProgressData(
      "p1",
      "Proje",
      [
        task({ title: "Dönem içi", updated_at: "2026-08-08T00:00:00.000Z" }),
        task({ title: "Dönem öncesi", updated_at: "2026-08-01T00:00:00.000Z" }),
      ],
      PERIOD_START,
      PERIOD_END,
    );

    expect(data.completedInPeriod).toEqual(["Dönem içi"]);
  });

  it("counts in-progress and overdue tasks", () => {
    const data = collectProjectProgressData(
      "p1",
      "Proje",
      [
        task({ status: "in_progress", due_date: null }),
        task({ status: "in_progress", due_date: null }),
        task({ status: "todo", due_date: "2026-08-01" }),
        task({ status: "done", due_date: "2026-08-01" }),
      ],
      PERIOD_START,
      PERIOD_END,
    );

    expect(data.inProgressCount).toBe(2);
    expect(data.overdueCount).toBe(1);
  });

  it("computes the overall completion rate from all tasks, not just the period", () => {
    const data = collectProjectProgressData(
      "p1",
      "Proje",
      [task({ status: "done" }), task({ status: "done" }), task({ status: "todo" }), task({ status: "in_progress" })],
      PERIOD_START,
      PERIOD_END,
    );

    expect(data.completionRatePercent).toBe(50);
  });
});

describe("buildProgressSummaryPrompt", () => {
  it("includes the exact completed task titles and counts", () => {
    const prompt = buildProgressSummaryPrompt({
      projectId: "p1",
      projectName: "Vantage",
      periodStart: "2026-08-05",
      periodEnd: "2026-08-12",
      totalTasks: 10,
      completedInPeriod: ["Görev A", "Görev B"],
      inProgressCount: 3,
      overdueCount: 1,
      completionRatePercent: 60,
    });

    expect(prompt).toContain("Görev A");
    expect(prompt).toContain("Görev B");
    expect(prompt).toContain("Toplam görev sayısı: 10");
    expect(prompt).toContain("yüzde 60");
  });

  it("says nothing was completed when the list is empty", () => {
    const prompt = buildProgressSummaryPrompt({
      projectId: "p1",
      projectName: "Vantage",
      periodStart: "2026-08-05",
      periodEnd: "2026-08-12",
      totalTasks: 5,
      completedInPeriod: [],
      inProgressCount: 1,
      overdueCount: 0,
      completionRatePercent: 20,
    });

    expect(prompt).toContain("bu dönemde tamamlanan görev yok");
  });
});
