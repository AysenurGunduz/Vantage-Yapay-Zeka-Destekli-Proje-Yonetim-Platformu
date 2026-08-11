import { useEffect, useState } from "react";
import { X, Play, Square, Link2 } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import type {
  OrganizationMember,
  Task,
  TaskDependency,
  TaskDependencyType,
  TaskPriority,
  TaskTimeEntriesResponse,
  TimeEntry,
} from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DEPENDENCY_TYPES: TaskDependencyType[] = ["blocked_by", "relates_to", "duplicates"];

const DEPENDENCY_TYPE_LABELS: Record<TaskDependencyType, string> = {
  blocked_by: "Bekliyor",
  relates_to: "İlgili",
  duplicates: "Kopyası",
};

function dependencyLabel(dep: TaskDependency): string {
  if (dep.dependency_type === "blocked_by") return dep.direction === "outgoing" ? "Bekliyor" : "Bekletiyor";
  if (dep.dependency_type === "duplicates") return dep.direction === "outgoing" ? "Kopyası" : "Bu görevin kopyası";
  return "İlgili";
}

const PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const priorityPillClass: Record<TaskPriority, string> = {
  low: "bg-[var(--priority-low)]/15 text-[var(--priority-low)]",
  medium: "bg-[var(--priority-medium)]/15 text-[var(--priority-medium)]",
  high: "bg-[var(--priority-high)]/15 text-[var(--priority-high)]",
  urgent: "bg-[var(--priority-urgent)]/20 text-[var(--priority-urgent)]",
};

const fieldClass =
  "w-full rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30";

interface ActivityEntry {
  id: string;
  action_type: string;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "Devam Ediyor",
  review: "İncelemede",
  done: "Tamamlandı",
};

function formatActivityTime(createdAt: string) {
  return new Date(createdAt).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function memberLabel(members: OrganizationMember[], userId: string | null): string {
  if (!userId) return "Atanmadı";
  const member = members.find((m) => m.user_id === userId);
  return member?.full_name ?? member?.email ?? "Bilinmeyen kullanıcı";
}

function describeActivity(entry: ActivityEntry, members: OrganizationMember[]): string {
  switch (entry.action_type) {
    case "created":
      return "oluşturuldu";
    case "status":
      return `durum: ${STATUS_LABELS[entry.from_value ?? ""] ?? entry.from_value} → ${STATUS_LABELS[entry.to_value ?? ""] ?? entry.to_value}`;
    case "priority":
      return `öncelik: ${entry.from_value} → ${entry.to_value}`;
    case "due_date":
      return entry.to_value
        ? `son tarih ${new Date(entry.to_value).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} olarak ayarlandı`
        : "son tarih kaldırıldı";
    case "tags":
      return "etiketler güncellendi";
    case "assignee_id":
      return `atandı: ${memberLabel(members, entry.from_value)} → ${memberLabel(members, entry.to_value)}`;
    case "dependency_added":
      return `bağlantı eklendi (${entry.to_value})`;
    default:
      return entry.action_type;
  }
}

export function TaskDetailModal({
  task,
  organizationId,
  theme = "dark",
  onClose,
  onSave,
}: {
  task: Task;
  organizationId: string | null;
  theme?: "dark" | "light";
  onClose: () => void;
  onSave: (updated: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [tags, setTags] = useState<string[]>(task.tags);
  const [tagInput, setTagInput] = useState("");
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
  const [assigneeNote, setAssigneeNote] = useState("");
  const [estimatedHours, setEstimatedHours] = useState(task.estimated_hours != null ? String(task.estimated_hours) : "");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [timeLoading, setTimeLoading] = useState(true);
  const [manualHours, setManualHours] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [loggingTime, setLoggingTime] = useState(false);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [timerElapsedSec, setTimerElapsedSec] = useState(0);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(true);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [newDependencyType, setNewDependencyType] = useState<TaskDependencyType>("blocked_by");
  const [newRelatedTaskId, setNewRelatedTaskId] = useState("");
  const [addingDependency, setAddingDependency] = useState(false);

  useEffect(() => {
    apiFetch<ActivityEntry[]>(`/api/tasks/${task.id}/activity`)
      .then(setActivity)
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [task.id]);

  useEffect(() => {
    apiFetch<TaskTimeEntriesResponse>(`/api/tasks/${task.id}/time-entries`)
      .then((res) => {
        setTimeEntries(res.entries);
        setTotalMinutes(res.totalMinutes);
      })
      .catch(() => {})
      .finally(() => setTimeLoading(false));
  }, [task.id]);

  useEffect(() => {
    apiFetch<TaskDependency[]>(`/api/tasks/${task.id}/dependencies`)
      .then(setDependencies)
      .catch(() => {})
      .finally(() => setDependenciesLoading(false));
  }, [task.id]);

  useEffect(() => {
    apiFetch<Task[]>(`/api/projects/${task.project_id}/tasks`)
      .then((tasks) => setProjectTasks(tasks.filter((t) => t.id !== task.id)))
      .catch(() => {});
  }, [task.id, task.project_id]);

  useEffect(() => {
    if (timerStartedAt === null) return;
    const interval = setInterval(() => {
      setTimerElapsedSec(Math.floor((Date.now() - timerStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerStartedAt]);

  async function logTime(minutes: number, note: string | null) {
    setLoggingTime(true);
    setError(null);
    try {
      const entry = await apiFetch<TimeEntry>(`/api/tasks/${task.id}/time-entries`, {
        method: "POST",
        body: JSON.stringify({ minutes, note: note ?? undefined }),
      });
      setTimeEntries((prev) => [entry, ...prev]);
      setTotalMinutes((prev) => prev + minutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zaman kaydedilemedi");
    } finally {
      setLoggingTime(false);
    }
  }

  async function handleManualLog() {
    const minutes = Math.round(parseFloat(manualHours) * 60);
    if (!minutes || minutes <= 0) return;
    await logTime(minutes, manualNote.trim() || null);
    setManualHours("");
    setManualNote("");
  }

  function startTimer() {
    setTimerElapsedSec(0);
    setTimerStartedAt(Date.now());
  }

  async function stopTimer() {
    if (timerStartedAt === null) return;
    const minutes = Math.max(1, Math.round((Date.now() - timerStartedAt) / 60000));
    setTimerStartedAt(null);
    setTimerElapsedSec(0);
    await logTime(minutes, "Sayaç ile kaydedildi");
  }

  async function addDependency() {
    if (!newRelatedTaskId) return;
    setAddingDependency(true);
    setError(null);
    try {
      const dependency = await apiFetch<TaskDependency>(`/api/tasks/${task.id}/dependencies`, {
        method: "POST",
        body: JSON.stringify({ dependency_type: newDependencyType, related_task_id: newRelatedTaskId }),
      });
      setDependencies((prev) => [...prev, dependency]);
      setNewRelatedTaskId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı eklenemedi");
    } finally {
      setAddingDependency(false);
    }
  }

  async function removeDependency(dependencyId: string) {
    setError(null);
    try {
      await apiFetch(`/api/tasks/${task.id}/dependencies/${dependencyId}`, { method: "DELETE" });
      setDependencies((prev) => prev.filter((d) => d.id !== dependencyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı kaldırılamadı");
    }
  }

  useEffect(() => {
    if (!organizationId) return;
    apiFetch<OrganizationMember[]>(`/api/organizations/${organizationId}/members`)
      .then(setMembers)
      .catch(() => {});
  }, [organizationId]);

  function addTag() {
    const value = tagInput.trim().toLowerCase();
    if (value && !tags.includes(value)) {
      setTags((prev) => [...prev, value]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          priority,
          tags,
          assignee_id: assigneeId || null,
          assignee_note: assigneeNote.trim() || undefined,
          estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
        }),
      });
      onSave(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`${theme}-theme fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl shadow-black/50"
      >
        <div className="flex items-start justify-between gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-lg font-semibold outline-none focus-visible:border-b focus-visible:border-[#ff6b5b]"
          />
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[3fr_2fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Açıklama</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Görev hakkında detay ekle..."
                className={`${fieldClass} resize-none`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Etiketler</label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-[var(--tag-bg)] px-2.5 py-1 text-xs text-[var(--tag-text)]"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      aria-label={`${tag} etiketini kaldır`}
                      className="text-[var(--tag-text)]/70 hover:text-[var(--tag-text)]"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Etiket yaz, Enter'a bas"
                className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Zaman Takibi</label>
                {!timeLoading && (
                  <span
                    className={`text-xs ${
                      task.estimated_hours != null && totalMinutes / 60 > task.estimated_hours
                        ? "text-[#ff6b5b]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {task.estimated_hours != null ? `Tahmin: ${task.estimated_hours} sa · ` : ""}
                    Harcanan: {formatHours(totalMinutes)} sa
                  </span>
                )}
              </div>

              {timerStartedAt === null ? (
                <Button
                  type="button"
                  onClick={startTimer}
                  disabled={loggingTime}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[var(--surface-hover)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-border)]"
                >
                  <Play className="size-3" />
                  Sayacı başlat
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={stopTimer}
                  disabled={loggingTime}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#ff6b5b] px-2.5 py-1.5 text-xs text-[#0d1b3a] hover:bg-[#ff8577]"
                >
                  <Square className="size-3" />
                  Durdur · {formatElapsed(timerElapsedSec)}
                </Button>
              )}

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  placeholder="Saat gir"
                  className="h-8 w-24 shrink-0 rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-xs text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
                />
                <Input
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Not (opsiyonel)"
                  className="h-8 min-w-0 flex-1 rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-xs text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
                />
                <Button
                  type="button"
                  onClick={handleManualLog}
                  disabled={loggingTime || !manualHours}
                  className="h-8 shrink-0 rounded-[6px] bg-[var(--surface-hover)] px-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-border)]"
                >
                  Ekle
                </Button>
              </div>

              {timeLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Yükleniyor...</p>
              ) : timeEntries.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Henüz zaman kaydı yok.</p>
              ) : (
                <ul className="max-h-24 space-y-1 overflow-y-auto pr-1 text-xs text-[var(--text-secondary)]">
                  {timeEntries.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {formatHours(entry.minutes)} sa{entry.note ? ` · ${entry.note}` : ""}
                      </span>
                      <span className="shrink-0 text-[var(--text-muted)]">{formatActivityTime(entry.logged_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <Link2 className="size-3.5" />
                Bağlı Görevler
              </label>

              {dependenciesLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Yükleniyor...</p>
              ) : dependencies.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Henüz bağlı bir görev yok.</p>
              ) : (
                <ul className="space-y-1">
                  {dependencies.map((dep) => (
                    <li
                      key={dep.id}
                      className="flex items-center justify-between gap-2 rounded-[6px] bg-[var(--surface-hover)] px-2.5 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-[var(--text-muted)]">{dependencyLabel(dep)}:</span>{" "}
                        {dep.related_task?.title ?? "Silinmiş görev"}
                        {dep.related_task && (
                          <span className="text-[var(--text-muted)]"> · {STATUS_LABELS[dep.related_task.status]}</span>
                        )}
                      </span>
                      <button
                        onClick={() => removeDependency(dep.id)}
                        aria-label="Bağlantıyı kaldır"
                        className="shrink-0 text-[var(--text-muted)] hover:text-[#ff6b5b]"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2">
                <select
                  aria-label="Bağlantı türü"
                  value={newDependencyType}
                  onChange={(e) => setNewDependencyType(e.target.value as TaskDependencyType)}
                  className="h-8 shrink-0 rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)] outline-none focus-visible:border-[#ff6b5b]"
                >
                  {DEPENDENCY_TYPES.map((type) => (
                    <option key={type} value={type} className="bg-[var(--surface)]">
                      {DEPENDENCY_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Bağlanacak görev"
                  value={newRelatedTaskId}
                  onChange={(e) => setNewRelatedTaskId(e.target.value)}
                  className="h-8 min-w-0 flex-1 rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-2 text-xs text-[var(--text-primary)] outline-none focus-visible:border-[#ff6b5b]"
                >
                  <option value="" className="bg-[var(--surface)]">
                    Görev seç...
                  </option>
                  {projectTasks.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[var(--surface)]">
                      {t.title}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  aria-label="Bağlantı ekle"
                  onClick={addDependency}
                  disabled={addingDependency || !newRelatedTaskId}
                  className="h-8 shrink-0 rounded-[6px] bg-[var(--surface-hover)] px-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-border)]"
                >
                  Ekle
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Öncelik</label>
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((option) => (
                  <button
                    key={option}
                    onClick={() => setPriority(option)}
                    className={`rounded-[6px] px-2.5 py-1 text-xs transition-colors ${
                      priority === option
                        ? priorityPillClass[option]
                        : "bg-[var(--surface-hover)] text-[var(--text-muted)] hover:bg-[var(--surface-border)]"
                    } ${priority === option ? "ring-1 ring-inset ring-[var(--surface-border-hover)]" : ""}`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Son tarih</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
                />
              </div>
              <div className="w-24 space-y-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Tahmini (sa)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="—"
                  className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Atanan kişi</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={`${fieldClass} appearance-none`}
              >
                <option value="" className="bg-[var(--surface)]">
                  Atanmadı
                </option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id} className="bg-[var(--surface)]">
                    {member.full_name ?? member.email ?? member.user_id}
                  </option>
                ))}
              </select>

              {assigneeId !== (task.assignee_id ?? "") && (
                <textarea
                  value={assigneeNote}
                  onChange={(e) => setAssigneeNote(e.target.value)}
                  rows={2}
                  placeholder="Atama ile ilgili bir not bırak (opsiyonel)"
                  className={`${fieldClass} resize-none`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Aktivite Geçmişi</label>
              {activityLoading ? (
                <p className="text-xs text-[var(--text-muted)]">Yükleniyor...</p>
              ) : activity.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">Henüz bir aktivite yok.</p>
              ) : (
                <ul className="max-h-28 space-y-1.5 overflow-y-auto pr-1 text-xs text-[var(--text-secondary)]">
                  {activity.map((entry) => (
                    <li key={entry.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate">{describeActivity(entry, members)}</span>
                        <span className="shrink-0 text-[var(--text-muted)]">{formatActivityTime(entry.created_at)}</span>
                      </div>
                      {entry.note && <p className="mt-0.5 pl-0 text-[var(--text-secondary)] italic">"{entry.note}"</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-[#ff6b5b]">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-[6px] border-[var(--surface-border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            Vazgeç
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-[6px] bg-[#ff6b5b] text-[#0d1b3a] hover:bg-[#ff8577]"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
