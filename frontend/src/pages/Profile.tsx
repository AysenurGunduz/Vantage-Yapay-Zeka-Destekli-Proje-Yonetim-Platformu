import { useState } from "react";
import { UserCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { SELF_ASSESSMENT_QUESTIONS } from "@/lib/selfAssessment";
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

export default function Profile() {
  const { user, signOut, profile, profileLoading, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answers = profile?.self_reported_traits ?? {};

  async function selectAnswer(key: string, value: string) {
    setSavingKey(key);
    setError(null);
    try {
      await apiFetch("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ self_reported_traits: { ...answers, [key]: value } }),
      });
      await refreshProfile();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingKey(null);
    }
  }

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
          <Breadcrumb items={[{ label: "Panel", href: "/dashboard" }, { label: "Profil" }]} />
        </div>

        <h1 className="mb-6 flex items-center gap-2 text-2xl font-semibold">
          <UserCircle className="size-5 text-[var(--accent)]" />
          Profil
        </h1>

        {error && <p className="mb-6 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>}

        {profileLoading && !profile ? (
          <PanelSkeleton />
        ) : (
          <Reveal as="section" className={`${panelClass} max-w-2xl`}>
            <h2 className="text-sm font-medium text-[var(--text-secondary)]">Çalışma Tarzım (Kendi Beyanım)</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Bu cevaplar, görev geçmişinden hesaplanan çalışma tarzı analizinden ayrı tutulur ve ekip arkadaşlarına
              "kendi beyanı" olarak gösterilir. İstediğin zaman değiştirebilirsin.
            </p>

            <div className="mt-5 space-y-6">
              {SELF_ASSESSMENT_QUESTIONS.map((q) => (
                <div key={q.key} className="space-y-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{q.question}</p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((option) => {
                      const selected = answers[q.key] === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => selectAnswer(q.key, option.value)}
                          disabled={savingKey !== null}
                          className={`rounded-[6px] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                              : "border-[var(--surface-border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </div>
  );
}
