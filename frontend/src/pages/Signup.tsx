import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Reveal } from "@/components/Reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Signup() {
  const { signUp } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await signUp(email, password);

    setSubmitting(false);
    if (error) {
      setError(error);
      return;
    }
    setSuccess(true);
  }

  return (
    <AuthLayout
      headline="Ekibinizle birlikte daha hızlı ilerleyin."
      subtitle="Görevleri yapay zeka ile otomatik bölün, riskleri erkenden görün, ilerlemeyi anlık takip edin."
    >
      {success ? (
        <Reveal className="space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight">E-postanı kontrol et</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Hesabını onaylamak için gönderdiğimiz bağlantıya tıkla.
          </p>
          <Link to="/login" className="inline-block text-sm font-medium text-[#ff6b5b] underline underline-offset-4">
            Giriş sayfasına dön
          </Link>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <h2 className="text-2xl font-semibold tracking-tight">Hesabını oluştur</h2>
          </Reveal>
          <Reveal delayMs={80}>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Vantage'ı kullanmaya hemen başla</p>
          </Reveal>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <p className="rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>
            )}

            <Reveal delayMs={160} className="space-y-1.5">
              <Label htmlFor="email" className="text-[var(--text-secondary)]">
                E-posta
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
              />
            </Reveal>

            <Reveal delayMs={240} className="space-y-1.5">
              <Label htmlFor="password" className="text-[var(--text-secondary)]">
                Şifre
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-[6px] border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-primary)] focus-visible:border-[#ff6b5b] focus-visible:ring-[#ff6b5b]/30"
              />
            </Reveal>

            <Reveal delayMs={320}>
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full rounded-[6px] bg-[#ff6b5b] font-semibold text-[#0d1b3a] transition-transform hover:scale-[1.02] hover:bg-[#ff8577] active:bg-[#e85a4a]"
              >
                {submitting ? "Kayıt olunuyor..." : "Kayıt Ol"}
              </Button>
            </Reveal>

            <Reveal delayMs={400}>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                Zaten hesabın var mı?{" "}
                <Link to="/login" className="font-medium text-[#ff6b5b] underline underline-offset-4">
                  Giriş yap
                </Link>
              </p>
            </Reveal>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
