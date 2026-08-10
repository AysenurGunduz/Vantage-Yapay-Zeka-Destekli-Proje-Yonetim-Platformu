import { Link, useLocation } from "react-router-dom";
import { CheckSquare, FolderKanban, History, LayoutDashboard } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard/workspace", label: "Çalışma Alanı", icon: FolderKanban },
  { to: "/dashboard/my-tasks", label: "Görevlerim", icon: CheckSquare },
  { to: "/dashboard/overview", label: "Genel Bakış", icon: LayoutDashboard },
  { to: "/dashboard/activity", label: "Aktiviteler", icon: History },
];

export function PageNav() {
  const location = useLocation();

  return (
    <nav className="flex w-fit items-center gap-1 rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-1">
      {NAV_ITEMS.map((item) => {
        const isActive = location.pathname === item.to;
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[var(--accent)] text-[var(--bg-base)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
