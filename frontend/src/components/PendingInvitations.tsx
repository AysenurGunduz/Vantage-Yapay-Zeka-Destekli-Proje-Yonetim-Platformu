import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { apiFetch } from "@/lib/apiClient";
import type { PendingInvitation } from "@/types/api";
import { Button } from "@/components/ui/button";

const roleLabel: Record<string, string> = {
  owner: "sahip",
  admin: "yönetici",
  member: "üye",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu";
}

interface PendingInvitationsProps {
  onAccepted?: () => void;
}

export function PendingInvitations({ onAccepted }: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PendingInvitation[]>("/api/invitations")
      .then(setInvitations)
      .catch(() => undefined);
  }, []);

  async function handleAccept(invitation: PendingInvitation) {
    setError(null);
    setAcceptingId(invitation.id);
    try {
      await apiFetch(`/api/invitations/${invitation.token}/accept`, { method: "POST" });
      setInvitations((prev) => prev.filter((item) => item.id !== invitation.id));
      onAccepted?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAcceptingId(null);
    }
  }

  if (invitations.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {error && <p className="rounded-[6px] bg-[#ff6b5b]/10 px-3 py-2 text-sm text-[#ff6b5b]">{error}</p>}
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#ff6b5b]/30 bg-[#ff6b5b]/[0.06] px-4 py-3"
        >
          <div className="flex items-center gap-2.5 text-sm">
            <Building2 className="size-4 shrink-0 text-[#ff6b5b]" />
            <span>
              <span className="font-medium text-[var(--text-primary)]">
                {invitation.organization_name ?? "Bir organizasyon"}
              </span>{" "}
              seni {roleLabel[invitation.role] ?? invitation.role} rolüyle davet etti.
            </span>
          </div>
          <Button
            size="sm"
            disabled={acceptingId === invitation.id}
            onClick={() => handleAccept(invitation)}
            className="rounded-[6px] bg-[#ff6b5b] font-semibold text-[#0d1b3a] hover:bg-[#ff8577]"
          >
            {acceptingId === invitation.id ? "Katılıyorsun..." : "Kabul et"}
          </Button>
        </div>
      ))}
    </div>
  );
}
