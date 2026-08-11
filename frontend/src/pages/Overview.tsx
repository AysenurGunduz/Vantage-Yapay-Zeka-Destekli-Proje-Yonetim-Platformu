import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FolderKanban, ListTodo, Sparkles } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { apiFetch } from "../lib/apiClient";
import type { DashboardRiskTask, DashboardStats, DashboardTaskSummary, RiskExplanation } from "../types/api";
import { Logo } from "@/components/Logo";
import { PanelSkeleton } from "@/components/Skeleton";
import { Reveal } from "@/components/Reveal";
import { PageNav } from "@/components/PageNav";
import { useTheme } from "@/lib/ThemeContext";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ProfileMenu } from "@/components/ProfileMenu";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
}

const panelClass =
  "rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-5";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "Devam Ediyor",
  review: "İncelemede",
  done: "Tamamlandı",
};

// Categorical palette, validated for adjacent-pair CVD separation against this
// app's dark surface (see dataviz skill) — order is load-bearing, don't shuffle.
const STATUS_COLORS: Record<string, string> = {
  backlog: "#3987e5",
  todo: "#d95926",
  in_progress: "#199e70",
  review: "#c98500",
  done: "#d55181",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  urgent: "Acil",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: "#818cf8",
  high: "#ff6b5b",
  urgent: "#ff3b30",
};

const CRITICAL_COLOR = "#d03b3b";
const WARNING_COLOR = "#fab219";

const RISK_LEVEL_LABELS: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  low: "#94a3b8",
  medium: WARNING_COLOR,
  high: CRITICAL_COLOR,
};

const chartTickStyle = { fill: "var(--text-muted)", fontSize: 12 };
const tooltipContentStyle = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--surface-border)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 13,
};

function formatDueDate(dueDate: string) {
  return new Date(dueDate).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

const TABS = [
  { id: "genel", label: "Genel" },
  { id: "detay", label: "Detaylar" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TaskAlertList({
  tasks,
  color,
  emptyText,
}: {
  tasks: DashboardTaskSummary[];
  color: string;
  emptyText: string;
}) {
  if (tasks.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-center justify-between gap-3 rounded-[6px] border-l-2 px-3 py-2 text-sm"
          style={{ borderColor: color, backgroundColor: `${color}14` }}
        >
          <span className="min-w-0 flex-1 truncate">{task.title}</span>
          <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{PRIORITY_LABELS[task.priority]}</span>
            <span style={{ color }}>{formatDueDate(task.due_date)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RiskTaskList({ tasks }: { tasks: DashboardRiskTask[] }) {
  const [explanations, setExplanations] = useState<
    Record<string, { loading: boolean; error: string | null; data: RiskExplanation | null }>
  >({});

  async function explain(taskId: string) {
    setExplanations((prev) => ({ ...prev, [taskId]: { loading: true, error: null, data: null } }));
    try {
      const result = await apiFetch<RiskExplanation>(`/api/tasks/${taskId}/risk-explanation`, {
        method: "POST",
      });
      setExplanations((prev) => ({ ...prev, [taskId]: { loading: false, error: null, data: result } }));
    } catch (err: unknown) {
      setExplanations((prev) => ({ ...prev, [taskId]: { loading: false, error: errorMessage(err), data: null } }));
    }
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">Şu an gecikme riski taşıyan bir görev yok.</p>;
  }

  return (
    <ul className="space-y-2">
      {tasks.map((task) => {
        const color = RISK_LEVEL_COLORS[task.risk_level];
        const state = explanations[task.id];

        return (
          <li
            key={task.id}
            className="rounded-[6px] border-l-2 px-3 py-2 text-sm"
            style={{ borderColor: color, backgroundColor: `${color}14` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              <span className="flex shrink-0 items-center gap-3 text-xs text-[var(--text-muted)]">
                <span style={{ color }}>
                  {RISK_LEVEL_LABELS[task.risk_level]} risk · {task.risk_score}/100
                </span>
                {task.due_date && <span>{formatDueDate(task.due_date)}</span>}
              </span>
            </div>
            <div className="mt-1">
              {!state && (
                <button
                  onClick={() => explain(task.id)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  <Sparkles className="size-3" />
                  Neden riskli, AI&apos;a sor
                </button>
              )}
              {state?.loading && <p className="text-xs text-[var(--text-muted)]">Açıklama üretiliyor...</p>}
              {state?.error && <p className="text-xs text-[#ff6b5b]">{state.error}</p>}
              {state?.data && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{state.data.explanation}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className={panelClass}>
      <div className="flex items-center gap-2 text-[var(--text-muted)]">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p
        className="mt-2 text-3xl font-semibold"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export default function Overview() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("genel");
  const [riskTasks, setRiskTasks] = useState<DashboardRiskTask[] | null>(null);
  const [riskProjectFilter, setRiskProjectFilter] = useState("");

  useEffect(() => {
    apiFetch<DashboardStats>("/api/dashboard/stats")
      .then(setStats)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const query = riskProjectFilter ? `?projectId=${riskProjectFilter}` : "";
    setRiskTasks(null);
    apiFetch<DashboardRiskTask[]>(`/api/dashboard/risk${query}`)
      .then(setRiskTasks)
      .catch(() => setRiskTasks([]));
  }, [riskProjectFilter]);

  const statusData = stats
    ? Object.entries(stats.byStatus).map(([status, value]) => ({
        status,
        label: STATUS_LABELS[status] ?? status,
        value,
      }))
    : [];

  const priorityData = stats
    ? Object.entries(stats.byPriority).map(([priority, value]) => ({
        priority,
        label: PRIORITY_LABELS[priority] ?? priority,
        value,
      }))
    : [];

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
          <Breadcrumb items={[{ label: "Panel", href: "/dashboard" }, { label: "Genel Bakış" }]} />
        </div>

        <h1 className="mb-4 text-2xl font-semibold">Genel Bakış</h1>

        <div className="mb-6 flex gap-1 border-b border-[var(--surface-border)]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-6 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">
            {error}
          </p>
        )}

        {loading ? (
          <PanelSkeleton />
        ) : (
          stats && (
            <>
              {activeTab === "genel" && (
                <div className="space-y-6">
                  <Reveal className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatTile
                      icon={<ListTodo className="size-4" />}
                      label="Toplam Görev"
                      value={stats.totalTasks}
                    />
                    <StatTile
                      icon={<Clock3 className="size-4" />}
                      label="Devam Eden"
                      value={stats.byStatus.in_progress}
                    />
                    <StatTile
                      icon={<CheckCircle2 className="size-4" />}
                      label="Tamamlanan"
                      value={stats.byStatus.done}
                    />
                    <StatTile
                      icon={
                        <AlertTriangle
                          className="size-4"
                          style={{ color: CRITICAL_COLOR }}
                        />
                      }
                      label="Geciken"
                      value={stats.overdueTasks.length}
                      accent={
                        stats.overdueTasks.length > 0
                          ? CRITICAL_COLOR
                          : undefined
                      }
                    />
                  </Reveal>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Reveal delayMs={80} as="section" className={panelClass}>
                      <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
                        Duruma Göre Dağılım
                      </h2>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={statusData}
                          margin={{ top: 16, right: 8, left: -8, bottom: 0 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="var(--surface-border)"
                          />
                          <XAxis
                            dataKey="label"
                            tick={chartTickStyle}
                            axisLine={{ stroke: "var(--surface-border)" }}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={chartTickStyle}
                            axisLine={false}
                            tickLine={false}
                            width={28}
                          />
                          <Tooltip
                            cursor={{ fill: "var(--surface-hover)" }}
                            contentStyle={tooltipContentStyle}
                          />
                          <Bar
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          >
                            {statusData.map((entry) => (
                              <Cell
                                key={entry.status}
                                fill={STATUS_COLORS[entry.status]}
                              />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="top"
                              style={{
                                fill: "var(--text-secondary)",
                                fontSize: 12,
                              }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Reveal>

                    <Reveal delayMs={140} as="section" className={panelClass}>
                      <h2 className="mb-4 text-sm font-semibold text-[var(--text-secondary)]">
                        Önceliğe Göre Dağılım
                      </h2>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={priorityData}
                          margin={{ top: 16, right: 8, left: -8, bottom: 0 }}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="var(--surface-border)"
                          />
                          <XAxis
                            dataKey="label"
                            tick={chartTickStyle}
                            axisLine={{ stroke: "var(--surface-border)" }}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={chartTickStyle}
                            axisLine={false}
                            tickLine={false}
                            width={28}
                          />
                          <Tooltip
                            cursor={{ fill: "var(--surface-hover)" }}
                            contentStyle={tooltipContentStyle}
                          />
                          <Bar
                            dataKey="value"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                          >
                            {priorityData.map((entry) => (
                              <Cell
                                key={entry.priority}
                                fill={PRIORITY_COLORS[entry.priority]}
                              />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="top"
                              style={{
                                fill: "var(--text-secondary)",
                                fontSize: 12,
                              }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Reveal>
                  </div>
                </div>
              )}

              {activeTab === "detay" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <Reveal as="section" className={panelClass}>
                      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                        <AlertTriangle
                          className="size-4"
                          style={{ color: CRITICAL_COLOR }}
                        />
                        Geciken Görevler
                      </h2>
                      <TaskAlertList
                        tasks={stats.overdueTasks}
                        color={CRITICAL_COLOR}
                        emptyText="Gecikmiş görev yok, harika gidiyorsun."
                      />
                    </Reveal>

                    <Reveal delayMs={80} as="section" className={panelClass}>
                      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                        <CalendarClock
                          className="size-4"
                          style={{ color: WARNING_COLOR }}
                        />
                        Yaklaşan Görevler (3 gün içinde)
                      </h2>
                      <TaskAlertList
                        tasks={stats.dueSoonTasks}
                        color={WARNING_COLOR}
                        emptyText="Önümüzdeki 3 gün içinde son tarihi gelen görev yok."
                      />
                    </Reveal>
                  </div>

                  <Reveal delayMs={160} as="section" className={panelClass}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                        <Sparkles className="size-4 text-[var(--accent)]" />
                        Gecikme Riski En Yüksek Görevler
                      </h2>
                      {stats && stats.byProject.length > 1 && (
                        <select
                          value={riskProjectFilter}
                          onChange={(e) => setRiskProjectFilter(e.target.value)}
                          className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-secondary)] outline-none focus-visible:border-[var(--accent)]"
                        >
                          <option value="">Tüm projeler</option>
                          {stats.byProject.map((project) => (
                            <option key={project.project_id} value={project.project_id}>
                              {project.project_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {riskTasks ? (
                      <RiskTaskList tasks={riskTasks} />
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">Yükleniyor...</p>
                    )}
                  </Reveal>

                  <Reveal delayMs={220} as="section" className={panelClass}>
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                      <FolderKanban className="size-4 text-[var(--accent)]" />
                      Proje Bazında Dağılım
                    </h2>
                    {stats.byProject.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">
                        Henüz bir projeye ait görev yok.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {stats.byProject.map((project) => {
                          const maxCount = stats.byProject[0]?.count || 1;
                          const widthPct = Math.max(
                            6,
                            Math.round((project.count / maxCount) * 100),
                          );
                          return (
                            <li
                              key={project.project_id}
                              className="flex items-center gap-3 text-sm"
                            >
                              <span className="w-40 shrink-0 truncate text-[var(--text-secondary)]">
                                {project.project_name}
                              </span>
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                                <div
                                  className="h-full rounded-full bg-[var(--accent)]"
                                  style={{ width: `${widthPct}%` }}
                                />
                              </div>
                              <span className="w-6 shrink-0 text-right text-[var(--text-muted)]">
                                {project.count}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </Reveal>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
