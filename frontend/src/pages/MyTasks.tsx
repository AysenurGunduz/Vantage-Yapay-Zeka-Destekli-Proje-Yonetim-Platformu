import { useEffect, useState } from "react";
import { CheckSquare } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { apiFetch } from "../lib/apiClient";
import type { MyTaskSummary, TaskPriority, TaskStatus } from "../types/api";
import { Logo } from "@/components/Logo";
import { PanelSkeleton } from "@/components/Skeleton";
import { Reveal } from "@/components/Reveal";
import { PageNav } from "@/components/PageNav";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ProfileMenu } from "@/components/ProfileMenu";
import { useTheme } from "@/lib/ThemeContext";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
}

const panelClass = "rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-5";

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "Devam Ediyor",
  review: "İncelemede",
  done: "Tamamlandı",
};

const STATUS_DOT: Record<TaskStatus, string> = {
  backlog: "bg-[var(--text-muted)]",
  todo: "bg-sky-400",
  in_progress: "bg-amber-400",
  review: "bg-purple-400",
  done: "bg-emerald-400",
};

const priorityPillClass: Record<TaskPriority, string> = {
  low: "bg-[var(--priority-low)]/15 text-[var(--priority-low)]",
  medium: "bg-[var(--priority-medium)]/15 text-[var(--priority-medium)]",
  high: "bg-[var(--priority-high)]/15 text-[var(--priority-high)]",
  urgent: "bg-[var(--priority-urgent)]/20 text-[var(--priority-urgent)]",
};

function formatDueDate(dueDate: string) {
  return new Date(dueDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

export default function MyTasks() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const [tasks, setTasks] = useState<MyTaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MyTaskSummary[]>("/api/dashboard/my-tasks")
      .then(setTasks)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={`${theme}-theme relative min-h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]`}>
      <div className="page-fade-in relative z-10 mx-auto max-w-screen-2xl px-8 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Logo theme={theme} />
          <div className="flex flex-wrap items-center gap-3">
            <PageNav />
            <ProfileMenu email={user?.email} onSignOut={signOut} theme={theme} />
          </div>
        </div>

        <div className="mb-6">
          <Breadcrumb items={[{ label: "Panel", href: "/dashboard" }, { label: "Görevlerim" }]} />
        </div>

        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold">
          <CheckSquare className="size-5 text-[var(--accent)]" />
          Görevlerim
        </h1>

        {error && <p className="mb-6 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>}

        {loading ? (
          <PanelSkeleton />
        ) : (
          <Reveal as="section" className={panelClass}>
            {tasks.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Sana atanmış açık bir görev yok.</p>
            ) : (
              <ul className="divide-y divide-[var(--surface-border)]">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                    <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[task.status]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{task.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{task.project_name}</p>
                    </div>
                    <span className={`shrink-0 rounded-[6px] px-2 py-1 text-xs ${priorityPillClass[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{STATUS_LABELS[task.status]}</span>
                    {task.due_date && (
                      <span className={`shrink-0 text-xs ${isOverdue(task.due_date) ? "text-[#ff6b5b]" : "text-[var(--text-muted)]"}`}>
                        {formatDueDate(task.due_date)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        )}
      </div>
    </div>
  );
}
