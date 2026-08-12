import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronDown, FileText, FolderKanban, ListTodo, Plus, Search, Sparkles, Users2 } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { apiFetch } from "../lib/apiClient";
import { supabase } from "../lib/supabaseClient";
import type { Organization, Project, Task, TaskPriority, TaskStatus } from "../types/api";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { TaskDetailModal } from "@/components/kanban/TaskDetailModal";
import { PanelSkeleton, SidebarListSkeleton } from "@/components/Skeleton";
import { Reveal } from "@/components/Reveal";
import { PageNav } from "@/components/PageNav";
import { Breadcrumb, type BreadcrumbItem } from "@/components/Breadcrumb";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { PendingInvitations } from "@/components/PendingInvitations";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { EmptyState } from "@/components/EmptyState";
import { AITaskSplitDialog } from "@/components/AITaskSplitDialog";
import { SprintSummaryDialog } from "@/components/SprintSummaryDialog";
import { useTheme } from "@/lib/ThemeContext";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
}

const inputClass =
  "rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent)]/30";
const submitButtonClass =
  "rounded-[6px] bg-[var(--accent)] text-[var(--bg-base)] transition-colors hover:bg-[var(--accent-hover)]";
const panelClass =
  "rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--surface-border-hover)] hover:bg-[var(--surface-hover)]";
const iconBadgeClass = "flex size-6 items-center justify-center rounded-full bg-[var(--accent)]/10";
const selectClass =
  "rounded-[6px] border border-[var(--surface-border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent)]";

export default function Workspace() {
  const { user, signOut } = useAuth();
  const { theme } = useTheme();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [createProjectOrgId, setCreateProjectOrgId] = useState<string | null>(null);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [sprintSummaryOpen, setSprintSummaryOpen] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskTags, setNewTaskTags] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created" | "due_date" | "priority">("created");
  const [searchQuery, setSearchQuery] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [orgsLoading, setOrgsLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);

  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) ?? null;
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Panel", href: "/dashboard" },
    { label: "Çalışma Alanı", href: "/dashboard/workspace" },
  ];
  if (selectedOrg) breadcrumbItems.push({ label: selectedOrg.name });
  if (selectedProject) breadcrumbItems.push({ label: selectedProject.name });

  const availableTags = Array.from(new Set(tasks.flatMap((task) => task.tags))).sort();

  const priorityOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const visibleTasks = tasks
    .filter((task) => filterPriority === "all" || task.priority === filterPriority)
    .filter((task) => filterTag === "all" || task.tags.includes(filterTag))
    .filter((task) => task.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (sortBy === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sortBy === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });

  function refetchOrganizations() {
    apiFetch<Organization[]>("/api/organizations")
      .then(setOrganizations)
      .catch((err: unknown) => setError(errorMessage(err)))
      .finally(() => setOrgsLoading(false));
  }

  useEffect(() => {
    refetchOrganizations();
  }, []);

  useEffect(() => {
    setSelectedProjectId(null);
    if (!selectedOrgId) {
      setProjects([]);
      return;
    }
    let cancelled = false;
    setProjectsLoading(true);
    apiFetch<Project[]>(`/api/organizations/${selectedOrgId}/projects`)
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedOrgId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    setTasksLoading(true);
    apiFetch<Task[]>(`/api/projects/${selectedProjectId}/tasks`)
      .then((data) => {
        if (!cancelled) setTasks(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) return;

    const channel = supabase
      .channel(`tasks:project:${selectedProjectId}`)
      .on<Task>(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${selectedProjectId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newTask = payload.new;
            setTasks((prev) => (prev.some((task) => task.id === newTask.id) ? prev : [...prev, newTask]));
          } else if (payload.eventType === "UPDATE") {
            const updatedTask = payload.new;
            setTasks((prev) => prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
          } else if (payload.eventType === "DELETE") {
            const deletedId = payload.old.id;
            if (deletedId) setTasks((prev) => prev.filter((task) => task.id !== deletedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedProjectId]);

  async function handleCreateOrg(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const org = await apiFetch<Organization>("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: newOrgName }),
      });
      setOrganizations((prev) => [...prev, { ...org, role: "owner" }]);
      setNewOrgName("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
    setCreateProjectOrgId(null);
  }

  async function handleCreateTask(event: FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setError(null);
    try {
      const task = await apiFetch<Task>(`/api/projects/${selectedProjectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: newTaskTitle,
          priority: newTaskPriority,
          due_date: newTaskDueDate || null,
          tags: newTaskTags
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        }),
      });
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
      setNewTaskTitle("");
      setNewTaskPriority("medium");
      setNewTaskDueDate("");
      setNewTaskTags("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteTask(taskId: string) {
    setError(null);
    try {
      await apiFetch<void>(`/api/tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    const previousTask = tasks.find((task) => task.id === taskId);
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    setError(null);
    try {
      await apiFetch<Task>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      if (previousTask) {
        setTasks((prev) => prev.map((task) => (task.id === taskId ? previousTask : task)));
      }
      setError(errorMessage(err));
    }
  }

  return (
    <div className={`${theme}-theme relative min-h-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]`}>
      <div className="page-fade-in relative z-10 mx-auto max-w-screen-2xl px-8 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <Logo theme={theme} />
          <div className="flex flex-wrap items-center gap-3">
            <PageNav />
            <NotificationBell theme={theme} />
            <ProfileMenu email={user?.email} onSignOut={signOut} theme={theme} />
          </div>
        </div>

        <div className="mb-6">
          <Breadcrumb items={breadcrumbItems} />
        </div>

        {error && (
          <p className="mb-6 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>
        )}

        <PendingInvitations onAccepted={refetchOrganizations} />

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-6 lg:w-72">
            <Reveal as="section" className={panelClass}>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight">
                <span className={iconBadgeClass}>
                  <Building2 className="size-3.5 text-[#ff6b5b]" />
                </span>
                Çalışma Alanı
              </div>

              {orgsLoading ? (
                <SidebarListSkeleton />
              ) : (
                <div className="space-y-1">
                  {organizations.map((org) => {
                    const isOpen = selectedOrgId === org.id;
                    return (
                      <div key={org.id}>
                        <button
                          onClick={() => setSelectedOrgId(isOpen ? null : org.id)}
                          className={`flex w-full items-center justify-between gap-2 rounded-[6px] px-3 py-2.5 text-left text-sm transition-colors ${
                            isOpen
                              ? "bg-[var(--accent)]/10 text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <span className="truncate">{org.name}</span>
                          <ChevronDown
                            className={`size-4 shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        {isOpen && (
                          <div className="mt-1 mb-2 ml-3 space-y-1 border-l border-[var(--surface-border)] pl-3">
                            <Link
                              to={`/dashboard/organizations/${org.id}/team`}
                              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
                            >
                              <Users2 className="size-3.5" />
                              Ekip Üyeleri
                            </Link>

                            {projectsLoading ? (
                              <SidebarListSkeleton />
                            ) : (
                              <>
                                {projects.map((project) => (
                                  <button
                                    key={project.id}
                                    onClick={() => setSelectedProjectId(project.id)}
                                    className={`flex w-full items-center gap-2 rounded-[6px] border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
                                      selectedProjectId === project.id
                                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                                        : "border-transparent text-[var(--text-secondary)] hover:border-[var(--surface-border-hover)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                    }`}
                                  >
                                    <FolderKanban className="size-3 shrink-0" />
                                    <span className="truncate">{project.name}</span>
                                  </button>
                                ))}
                                {projects.length === 0 && (
                                  <p className="px-2 py-1.5 text-xs text-[var(--text-muted)]">Henüz proje yok.</p>
                                )}
                              </>
                            )}

                            <button
                              onClick={() => setCreateProjectOrgId(org.id)}
                              className="mt-1 flex w-full items-center gap-1.5 rounded-[6px] px-2 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                            >
                              <Plus className="size-3.5 shrink-0" />
                              Yeni proje
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {organizations.length === 0 && (
                    <EmptyState
                      icon={Building2}
                      title="Henüz bir organizasyonun yok."
                      description="Aşağıdan ilkini oluşturarak başla."
                      className="py-4"
                    />
                  )}
                </div>
              )}

              <form onSubmit={handleCreateOrg} className="mt-3 flex gap-2 border-t border-[var(--surface-border)] pt-3">
                <Input
                  placeholder="Yeni organizasyon"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  className={inputClass}
                />
                <Button type="submit" size="icon" className={`${submitButtonClass} shrink-0`} aria-label="Organizasyon oluştur">
                  <Plus className="size-4" />
                </Button>
              </form>
            </Reveal>
          </aside>

          <main className="min-w-0 flex-1">
            {selectedProjectId ? (
              <Reveal as="section" delayMs={120} className={panelClass}>
                <form onSubmit={handleCreateTask} className="mb-5 flex flex-wrap gap-2">
                  <Input
                    placeholder="Yeni görev başlığı"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                    className={`${inputClass} min-w-[200px] flex-1`}
                  />
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className={selectClass}
                  >
                    <option value="low" className="bg-[var(--surface)] text-[var(--text-primary)]">
                      Düşük
                    </option>
                    <option value="medium" className="bg-[var(--surface)] text-[var(--text-primary)]">
                      Orta
                    </option>
                    <option value="high" className="bg-[var(--surface)] text-[var(--text-primary)]">
                      Yüksek
                    </option>
                    <option value="urgent" className="bg-[var(--surface)] text-[var(--text-primary)]">
                      Acil
                    </option>
                  </select>
                  <Input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className={`${inputClass} w-auto`}
                  />
                  <Input
                    placeholder="Etiketler (virgülle ayır)"
                    value={newTaskTags}
                    onChange={(e) => setNewTaskTags(e.target.value)}
                    className={`${inputClass} min-w-[160px]`}
                  />
                  <Button type="submit" className={submitButtonClass}>
                    <Plus className="size-4" />
                    Ekle
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAiDialogOpen(true)}
                    className="gap-1.5 rounded-[6px] border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
                  >
                    <Sparkles className="size-4" />
                    AI ile Öner
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSprintSummaryOpen(true)}
                    className="gap-1.5 rounded-[6px] border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]"
                  >
                    <FileText className="size-4" />
                    Sprint Özeti
                  </Button>
                </form>

                {tasks.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                    <div className="relative min-w-[160px] flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <Input
                        placeholder="Görevlerde ara..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={`${inputClass} h-9 pl-8 text-sm`}
                      />
                    </div>
                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value as TaskPriority | "all")}
                      className={selectClass}
                    >
                      <option value="all" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Tüm öncelikler
                      </option>
                      <option value="low" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Düşük
                      </option>
                      <option value="medium" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Orta
                      </option>
                      <option value="high" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Yüksek
                      </option>
                      <option value="urgent" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Acil
                      </option>
                    </select>
                    <select
                      value={filterTag}
                      onChange={(e) => setFilterTag(e.target.value)}
                      className={selectClass}
                    >
                      <option value="all" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Tüm etiketler
                      </option>
                      {availableTags.map((tag) => (
                        <option key={tag} value={tag} className="bg-[var(--surface)] text-[var(--text-primary)]">
                          #{tag}
                        </option>
                      ))}
                    </select>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as "created" | "due_date" | "priority")}
                      className={selectClass}
                    >
                      <option value="created" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Sırala: Varsayılan
                      </option>
                      <option value="due_date" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Sırala: Son tarih
                      </option>
                      <option value="priority" className="bg-[var(--surface)] text-[var(--text-primary)]">
                        Sırala: Öncelik
                      </option>
                    </select>
                    {(filterPriority !== "all" || filterTag !== "all" || sortBy !== "created" || searchQuery !== "") && (
                      <button
                        onClick={() => {
                          setFilterPriority("all");
                          setFilterTag("all");
                          setSortBy("created");
                          setSearchQuery("");
                        }}
                        className="text-xs text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--accent)]"
                      >
                        Filtreleri temizle
                      </button>
                    )}
                  </div>
                )}

                {tasksLoading ? (
                  <PanelSkeleton />
                ) : (
                  <KanbanBoard
                    tasks={visibleTasks}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteTask}
                    onOpenTask={setSelectedTask}
                  />
                )}
              </Reveal>
            ) : (
              <Reveal
                delayMs={120}
                className="flex h-72 items-center justify-center rounded-[8px] border border-dashed border-[var(--surface-border)] px-6"
              >
                <EmptyState
                  icon={ListTodo}
                  title="Henüz bir proje seçilmedi"
                  description="Görevleri görüntülemek için önce sol taraftan bir organizasyon ve proje seç."
                />
              </Reveal>
            )}
          </main>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          organizationId={selectedOrgId}
          theme={theme}
          onClose={() => setSelectedTask(null)}
          onSave={(updated) => {
            setTasks((prev) => prev.map((task) => (task.id === updated.id ? updated : task)));
          }}
        />
      )}

      <CreateProjectDialog
        organizationId={createProjectOrgId}
        open={createProjectOrgId !== null}
        theme={theme}
        onOpenChange={(next) => {
          if (!next) setCreateProjectOrgId(null);
        }}
        onCreated={handleProjectCreated}
      />

      {selectedProjectId && (
        <AITaskSplitDialog
          projectId={selectedProjectId}
          open={aiDialogOpen}
          theme={theme}
          onOpenChange={setAiDialogOpen}
        />
      )}

      {selectedProjectId && (
        <SprintSummaryDialog
          projectId={selectedProjectId}
          open={sprintSummaryOpen}
          theme={theme}
          onOpenChange={setSprintSummaryOpen}

          />
      )}
    </div>
  );
}
