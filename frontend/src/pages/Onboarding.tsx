import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/AuthContext";
import { apiFetch } from "@/lib/apiClient";
import { useTheme } from "@/lib/ThemeContext";

const USAGE_PURPOSES = [
  { value: "work", label: "İş için", description: "Şirketimdeki/ekibimdeki projeleri yönetmek için kullanacağım" },
  { value: "personal", label: "Kişisel projeler için", description: "Kendi projelerimi ve görevlerimi takip etmek için kullanacağım" },
  { value: "education", label: "Eğitim için", description: "Bir ders, staj ya da okul projesi kapsamında kullanacağım" },
  { value: "other", label: "Diğer", description: "Yukarıdakilerden hiçbiri tam olarak uymuyor" },
];

export default function Onboarding() {
  const { refreshProfile } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectPurpose(value: string) {
    setSubmitting(value);
    setError(null);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: JSON.stringify({ usage_purpose: value }) });
      await refreshProfile();
      navigate("/dashboard/workspace", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti, tekrar dener misin?");
      setSubmitting(null);
    }
  }

  return (
    <div className={`${theme}-theme flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-6 text-[var(--text-primary)]`}>
      <div className="w-full max-w-lg">
        <Reveal className="mb-8 flex justify-center">
          <Logo theme={theme} />
        </Reveal>

        <Reveal delayMs={80}>
          <h1 className="text-center text-2xl font-semibold">Vantage'ı öncelikle ne için kullanacaksın?</h1>
          <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">
            Bu cevap, deneyimini sana göre şekillendirmemize yardımcı olur.
          </p>
        </Reveal>

        {error && <p className="mt-4 rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>}

        <div className="mt-8 space-y-3">
          {USAGE_PURPOSES.map((purpose, index) => (
            <Reveal key={purpose.value} delayMs={120 + index * 60}>
              <button
                type="button"
                onClick={() => selectPurpose(purpose.value)}
                disabled={submitting !== null}
                className="w-full rounded-[8px] border border-[var(--surface-border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <p className="font-medium text-[var(--text-primary)]">
                  {submitting === purpose.value ? "Kaydediliyor..." : purpose.label}
                </p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{purpose.description}</p>
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
