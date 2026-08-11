import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { Logo } from "@/components/Logo";

export default function Home() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`${theme}-theme relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--bg-base)] px-6 text-center text-[var(--text-primary)]`}>
      <div ref={menuRef} className="absolute top-6 right-6 z-20">
        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          title={user?.email}
          className="flex size-10 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          {user?.email?.[0]?.toUpperCase() ?? "?"}
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-52 rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-1.5 text-left text-sm shadow-2xl shadow-black/10">
            <p className="truncate px-2.5 py-1.5 text-xs text-[var(--text-muted)]">{user?.email}</p>
            <div className="my-1 h-px bg-[var(--surface-border)]" />
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
              {theme === "light" ? "Koyu Tema" : "Açık Tema"}
            </button>
            <div className="my-1 h-px bg-[var(--surface-border)]" />
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-2 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <LogOut className="size-4" />
              Çıkış Yap
            </button>
          </div>
        )}
      </div>

      <Link to="/" className="page-fade-in relative z-10">
        <Logo className="scale-125" theme={theme} />
      </Link>

      <span className="page-fade-in relative z-10 mt-8 rounded-full bg-[#ff6b5b]/10 px-4 py-1.5 text-sm font-medium text-[#ff6b5b]">
        Yapay Zeka Destekli Proje Yönetimi
      </span>

      <h1 className="page-fade-in relative z-10 mt-6 max-w-2xl text-4xl leading-tight font-bold text-balance sm:text-5xl">
        İşinizi net görün, ekibinizi bir adım önde tutun.
      </h1>

      <p className="page-fade-in relative z-10 mt-4 max-w-xl text-lg leading-relaxed text-[var(--text-secondary)]">
        Hoş geldin, {user?.email}. Ne yapmak istersin?
      </p>

      <div className="page-fade-in relative z-10 mt-8 flex items-center gap-3">
        <Link
          to="/dashboard/workspace"
          className="group inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-[#ff6b5b] px-7 text-sm font-semibold text-[#0d1b3a] shadow-lg shadow-[#ff6b5b]/20 transition-all hover:bg-[#ff8577] hover:shadow-xl hover:shadow-[#ff6b5b]/30"
        >
          Hemen Başla
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          to="/dashboard/overview"
          className="inline-flex min-h-11 items-center gap-2 rounded-[6px] border border-[var(--surface-border)] px-6 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--surface-border-hover)] hover:text-[var(--text-primary)]"
        >
          Genel Bakış
        </Link>
      </div>
    </div>
  );
}
