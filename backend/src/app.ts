import express from "express";
import cors from "cors";
import { supabase } from "./lib/supabaseClient.js";
import { organizationsRouter } from "./routes/organizations.js";
import { projectsRouter } from "./routes/projects.js";
import { projectTasksRouter, taskRouter } from "./routes/tasks.js";
import { organizationMembersRouter } from "./routes/organizationMembers.js";
import { organizationInvitationsRouter, invitationsRouter } from "./routes/invitations.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { projectAITaskSplitsRouter, aiTaskSplitRouter } from "./routes/aiTaskSplits.js";
import { projectSprintSummaryRouter } from "./routes/sprintSummary.js";
import { taskTimeEntriesRouter } from "./routes/timeEntries.js";
import { taskDependenciesRouter } from "./routes/taskDependencies.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const { error } = await supabase.auth.admin.listUsers();

  res.json({
    status: "ok",
    supabase: error ? "unreachable" : "connected",
  });
});

app.use("/api/organizations", organizationsRouter);
app.use("/api/organizations/:orgId/projects", projectsRouter);
app.use("/api/organizations/:orgId/members", organizationMembersRouter);
app.use("/api/organizations/:orgId/invitations", organizationInvitationsRouter);
app.use("/api/invitations", invitationsRouter);
app.use("/api/projects/:projectId/tasks", projectTasksRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/projects/:projectId/ai/task-splits", projectAITaskSplitsRouter);
app.use("/api/ai/task-splits", aiTaskSplitRouter);
app.use("/api/projects/:projectId/sprint-summary", projectSprintSummaryRouter);
app.use("/api/tasks/:taskId/time-entries", taskTimeEntriesRouter);
app.use("/api/tasks/:taskId/dependencies", taskDependenciesRouter);
