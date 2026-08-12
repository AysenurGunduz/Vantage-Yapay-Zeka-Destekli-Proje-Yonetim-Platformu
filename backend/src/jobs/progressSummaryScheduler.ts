import cron, { type ScheduledTask } from "node-cron";

// Her gün sabah 06:00'da çalışır, .env üzerinden değiştirilebilir (cron ifadesi).
export const DEFAULT_SCHEDULE = "0 6 * * *";

export function scheduleProgressSummaryJob(
  runJob: () => Promise<void>,
  schedule: string = process.env.PROGRESS_SUMMARY_CRON ?? DEFAULT_SCHEDULE,
): ScheduledTask {
  const task = cron.schedule(schedule, () => {
    runJob().catch((err) => {
      console.error("Progress summary job failed:", err instanceof Error ? err.message : err);
    });
  });
  console.log(`Progress summary job scheduled: "${schedule}"`);
  return task;
}
