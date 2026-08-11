export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  role: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  tags: string[];
  created_at: string;
}

export type OrganizationRole = "owner" | "admin" | "member";

export interface OrganizationMember {
  user_id: string;
  role: OrganizationRole;
  joined_at: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export interface DashboardTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
  project_id: string;
}

export interface DashboardActivityEntry {
  id: string;
  task_id: string;
  task_title: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalTasks: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdueTasks: DashboardTaskSummary[];
  dueSoonTasks: DashboardTaskSummary[];
  byProject: Array<{ project_id: string; project_name: string; count: number }>;
}

export interface SuggestedSubtask {
  title: string;
  estimated_hours?: number;
}

export type AITaskSuggestionStatus = "pending" | "accepted" | "rejected";

export interface AITaskSuggestion {
  id: string;
  project_id: string;
  source_description: string;
  suggested_tasks: { subtasks: SuggestedSubtask[] };
  status: AITaskSuggestionStatus;
  created_by: string;
  created_at: string;
}

export interface SprintSummaryResult {
  summary: string | null;
  taskCount: number;
  periodDays: number;
}

export interface MyTaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  project_id: string;
  project_name: string;
  tags: string[];
}

export interface WorkStyleTraits {
  completedTaskCount: number;
  onTimeRate: number | null;
  avgCompletionDays: number | null;
  effortAccuracy: number | null;
  topTags: string[];
  priorityMix: Record<TaskPriority, number>;
}

export interface WorkStyleProfile {
  id: string;
  user_id: string;
  traits: WorkStyleTraits;
  summary: string;
  model_used: string;
  generated_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface OrganizationInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
}
