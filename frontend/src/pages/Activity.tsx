import { useEffect, useState } from "react";
import { History, PlusCircle, ArrowRightCircle, Flag, CalendarClock, Tag, UserRound, Timer, Link2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { apiFetch } from "../lib/apiClient";
import type { DashboardActivityEntry } from "../types/api";
import { Logo } from "@/components/Logo";
import { PanelSkeleton } from "@/components/Skeleton";
import { Reveal } from "@/components/Reveal";
import { PageNav } from "@/components/PageNav";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { useTheme } from "@/lib/ThemeContext";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
}

const panelClass = "rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-5";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "Devam Ediyor",
  review: "İncelemede",
  done: "Tamamlandı",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  urgent: "Acil",
};

function formatDueDate(dueDate: string) {
  return new Date(dueDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

function formatActivityTime(createdAt: string) {
  return new Date(createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function describeActivity(entry: DashboardActivityEntry): string {
  switch (entry.action_type) {
    case "created":
      return "oluşturuldu";
    case "priority":
      return `öncelik: ${PRIORITY_LABELS[entry.from_value ?? ""] ?? entry.from_value} → ${PRIORITY_LABELS[entry.to_value ?? ""] ?? entry.to_value}`;
    case "due_date":
      return entry.to_value ? `son tarih ${formatDueDate(entry.to_value)} olarak ayarlandı` : "son tarih kaldırıldı";
    case "tags":
      return "etiketler güncellendi";
    case "assignee_id":
      return "atanan kişi değişti";
    case "time_logged":
      return `çalışma süresi eklendi: ${entry.to_value}`;
    case "dependency_added":
      return `bağlantı eklendi (${entry.to_value})`;
    default:
      return entry.action_type;
  }
}

const STATUS_DOT: Record<string, string> = {
  backlog: "bg-[var(--text-muted)]",
  todo: "bg-sky-400",
  in_progress: "bg-amber-400",
  review: "bg-purple-400",
  done: "bg-emerald-400",
};

const ACTION_ICONS: Record<string, typeof History> = {
  created: PlusCircle,
  status: ArrowRightCircle,
  priority: Flag,
  due_date: CalendarClock,
  tags: Tag,
  assignee_id: UserRound,
  time_logged: Timer,
  dependency_added: Link2,
};

function ActivityDescription({ entry }: { entry: DashboardActivityEntry }) {
  if (entry.action_type === "status") {
    const from = entry.from_value ?? "";
    const to = entry.to_value ?? "";
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[from] ?? "bg-[var(--text-muted)]"}`} />
        {STATUS_LABELS[from] ?? from}
        <span className="text-[var(--text-muted)]">→</span>
        <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[to] ?? "bg-[var(--text-muted)]"}`} />
        {STATUS_LABELS[to] ?? to}
      </span>
    );
  }
  return <span className="text-sm text-[var(--text-secondary)]">{describeActivity(entry)}</span>;
}

export default function Activity() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();
  const [activity, setActivity] = useState<DashboardActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardActivityEntry[]>("/api/dashboard/activity")
      .then(setActivity)
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
            <NotificationBell theme={theme} />
            <ProfileMenu email={user?.email} onSignOut={signOut} theme={theme} />
          </div>
        </div>

        <div className="mb-6">
          <Breadcrumb items={[{ label: "Panel", href: "/dashboard" }, { label: "Aktiviteler" }]} />
        </div>

        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold">
          <History className="size-5 text-[var(--accent)]" />
          Son Aktiviteler
        </h1>

        {error && <p className="mb-6 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>}

        {loading ? (
          <PanelSkeleton />
        ) : (
          <Reveal as="section" className={panelClass}>
            {activity.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Henüz bir aktivite yok.</p>
            ) : (
              <ul className="divide-y divide-[var(--surface-border)]">
                {activity.map((entry) => {
                  const Icon = ACTION_ICONS[entry.action_type] ?? History;
                  return (
                    <li key={entry.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] text-[var(--accent)]">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{entry.task_title}</p>
                        <div className="mt-1">
                          <ActivityDescription entry={entry} />
                        </div>
                        {entry.note && <p className="mt-1 text-sm text-[var(--text-muted)] italic">"{entry.note}"</p>}
                      </div>
                      <span className="shrink-0 pt-1.5 text-xs text-[var(--text-muted)]">
                        {formatActivityTime(entry.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Reveal>
        )}
      </div>
    </div>
  );
}
