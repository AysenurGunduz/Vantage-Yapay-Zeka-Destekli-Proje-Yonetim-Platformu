import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import type { ProgressSummaryFeedItem } from "@/types/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function NotificationBell({ theme = "dark" }: { theme?: "dark" | "light" }) {
  const [items, setItems] = useState<ProgressSummaryFeedItem[]>([]);

  useEffect(() => {
    apiFetch<ProgressSummaryFeedItem[]>("/api/dashboard/progress-feed")
      .then(setItems)
      .catch(() => {});
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Bildirimler"
        className="relative flex size-9 items-center justify-center rounded-full text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50"
      >
        <Bell className="size-4" />
        {items.length > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[var(--accent)]" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={`w-80 ${theme === "light" ? "light-theme" : ""}`}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-[var(--text-secondary)]">
            İlerleme Özetleri
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-muted)]">Henüz bir bildirim yok.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto px-1 py-1">
            {items.map((item) => (
              <li key={item.id} className="rounded-[6px] px-2 py-2 text-xs hover:bg-[var(--surface-hover)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--text-primary)]">{item.project_name}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">{formatGeneratedAt(item.generated_at)}</span>
                </div>
                <p className="mt-0.5 text-[var(--text-secondary)]">{item.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
