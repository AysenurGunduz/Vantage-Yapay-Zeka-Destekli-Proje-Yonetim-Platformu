import "dotenv/config";
import { app } from "./app.js";
import { scheduleProgressSummaryJob } from "./jobs/progressSummaryScheduler.js";
import { runProgressSummaryJob } from "./jobs/runProgressSummaryJob.js";

const port = process.env.PORT ?? 4000;

app.listen(port, () => {
  console.log(`Vantage backend listening on http://localhost:${port}`);
});

scheduleProgressSummaryJob(runProgressSummaryJob);
