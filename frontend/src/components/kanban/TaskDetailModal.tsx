import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import type { AssignmentSuggestion, OrganizationMember, Task, TaskComment, TaskPriority, WorkStyleProfile } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    case "commented":
      return "yorum yaptı";
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
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [assigneeWorkStyle, setAssigneeWorkStyle] = useState<WorkStyleProfile | null>(null);
  const [workStyleLoading, setWorkStyleLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AssignmentSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentInput, setCommentInput] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    apiFetch<ActivityEntry[]>(`/api/tasks/${task.id}/activity`)
      .then(setActivity)
      .catch(() => {})
      .finally(() => setActivityLoading(false));
  }, [task.id]);

  useEffect(() => {
    apiFetch<AssignmentSuggestion[]>(`/api/tasks/${task.id}/assignment-suggestions`)
      .then(setSuggestions)
      .catch(() => {});
  }, [task.id]);

  useEffect(() => {
    apiFetch<TaskComment[]>(`/api/tasks/${task.id}/comments`)
      .then(setComments)
      .catch(() => {})
      .finally(() => setCommentsLoading(false));
  }, [task.id]);

  useEffect(() => {
    if (!organizationId) return;
    apiFetch<OrganizationMember[]>(`/api/organizations/${organizationId}/members`)
      .then(setMembers)
      .catch(() => {});
  }, [organizationId]);

  useEffect(() => {
    if (!assigneeId) {
      setAssigneeWorkStyle(null);
      return;
    }
    setWorkStyleLoading(true);
    setAssigneeWorkStyle(null);
    apiFetch<WorkStyleProfile>(`/api/users/${assigneeId}/work-style`)
      .then(setAssigneeWorkStyle)
      .catch(() => setAssigneeWorkStyle(null))
      .finally(() => setWorkStyleLoading(false));
  }, [assigneeId]);

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

  async function addComment() {
    const content = commentInput.trim();
    if (!content) return;
    setPostingComment(true);
    setError(null);
    try {
      const comment = await apiFetch<TaskComment>(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setComments((prev) => [...prev, comment]);
      setCommentInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yorum eklenemedi");
    } finally {
      setPostingComment(false);
    }
  }

  async function removeComment(commentId: string) {
    setError(null);
    try {
      await apiFetch(`/api/tasks/${task.id}/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yorum kaldırılamadı");
    }
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
        className="w-full max-w-md space-y-4 rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-2xl shadow-black/50"
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
          <label className="text-xs font-medium text-[var(--text-secondary)]">Son tarih</label>
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Atanan kişi</label>
          <select
            aria-label="Atanan kişi"
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

          {assigneeId && (
            <div className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2 text-xs">
              {workStyleLoading ? (
                <p className="text-[var(--text-muted)]">Çalışma tarzı yükleniyor...</p>
              ) : assigneeWorkStyle?.summary ? (
                <p className="text-[var(--text-secondary)]">{assigneeWorkStyle.summary}</p>
              ) : (
                <p className="text-[var(--text-muted)]">Bu kişi için henüz bir çalışma tarzı analizi üretilmemiş.</p>
              )}
            </div>
          )}

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

        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">Önerilen Atamalar</label>
            <ul className="space-y-1.5">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.userId}
                  className="rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {memberLabel(members, suggestion.userId)}
                    </span>
                    <span className="shrink-0 rounded-[6px] bg-[var(--accent)]/10 px-2 py-0.5 text-xs text-[var(--accent)]">
                      %{suggestion.score} uyum
                    </span>
                  </div>
                  {suggestion.reasons.length > 0 && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{suggestion.reasons.join(" · ")}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setSuggestions((prev) => prev.filter((s) => s.userId !== suggestion.userId))}
                      className="rounded-[6px] px-2 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssigneeId(suggestion.userId)}
                      className="rounded-[6px] bg-[var(--accent)]/10 px-2 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
                    >
                      Ata
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

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

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--text-secondary)]">Yorumlar</label>
          {commentsLoading ? (
            <p className="text-xs text-[var(--text-muted)]">Yükleniyor...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Henüz bir yorum yok.</p>
          ) : (
            <ul className="max-h-32 space-y-2 overflow-y-auto pr-1">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-[6px] bg-[var(--surface-hover)] px-2.5 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-secondary)]">{memberLabel(members, comment.user_id)}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[var(--text-muted)]">
                      {formatActivityTime(comment.created_at)}
                      {comment.user_id === user?.id && (
                        <button
                          onClick={() => removeComment(comment.id)}
                          aria-label="Yorumu kaldır"
                          className="text-[var(--text-muted)] hover:text-[#ff6b5b]"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[var(--text-primary)]">{comment.content}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addComment();
                }
              }}
              placeholder="Bir yorum yaz..."
              className="h-8 min-w-0 flex-1 rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-xs text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
            />
            <Button
              type="button"
              onClick={addComment}
              disabled={postingComment || !commentInput.trim()}
              className="h-8 shrink-0 rounded-[6px] bg-[var(--surface-hover)] px-2.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-border)]"
            >
              Gönder
            </Button>
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
