import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  FolderKanban,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useTheme } from "@/lib/ThemeContext";
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Command = {
  id: string;
  label: string;
  section: "Git" | "İşlemler";
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const commands = useMemo<Command[]>(
    () => [
      { id: "home", label: "Ana Sayfa", section: "Git", icon: Home, run: () => navigate("/dashboard") },
      { id: "workspace", label: "Çalışma Alanı", section: "Git", icon: FolderKanban, run: () => navigate("/dashboard/workspace") },
      { id: "overview", label: "Genel Bakış", section: "Git", icon: LayoutGrid, run: () => navigate("/dashboard/overview") },
      { id: "activity", label: "Aktiviteler", section: "Git", icon: Activity, run: () => navigate("/dashboard/activity") },
      {
        id: "theme",
        label: theme === "light" ? "Koyu Temaya Geç" : "Açık Temaya Geç",
        section: "İşlemler",
        icon: theme === "light" ? Moon : Sun,
        run: () => toggleTheme(),
      },
      { id: "signout", label: "Çıkış Yap", section: "İşlemler", icon: LogOut, run: () => signOut() },
    ],
    [navigate, signOut, theme, toggleTheme],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return commands;
    return commands.filter((c) => c.label.toLocaleLowerCase("tr").includes(q));
  }, [commands, query]);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runCommand(command: Command) {
    command.run();
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[activeIndex];
      if (command) runCommand(command);
    }
  }

  const sections: Command["section"][] = ["Git", "İşlemler"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          showCloseButton={false}
          className="dark-theme top-24 left-1/2 max-w-lg -translate-x-1/2 -translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <div className="flex items-center gap-2 border-b border-[var(--surface-border)] px-3.5 py-3">
            <Search className="size-4 shrink-0 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Bir komut ara ya da yaz..."
              className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <kbd className="shrink-0 rounded border border-[var(--surface-border)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
              Esc
            </kbd>
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              <p className="px-2.5 py-4 text-center text-xs text-[var(--text-muted)]">Eşleşen komut yok</p>
            )}
            {sections.map((section) => {
              const items = filtered.filter((c) => c.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section} className="mb-1 last:mb-0">
                  <p className="px-2.5 py-1 text-[10px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
                    {section}
                  </p>
                  {items.map((command) => {
                    const index = filtered.indexOf(command);
                    const Icon = command.icon;
                    return (
                      <button
                        key={command.id}
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => runCommand(command)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-left text-sm text-[var(--text-primary)] transition-colors",
                          index === activeIndex ? "bg-[var(--surface-hover)]" : "hover:bg-[var(--surface-hover)]",
                        )}
                      >
                        <Icon className="size-4 text-[var(--text-muted)]" />
                        {command.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
