import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Vantage <onboarding@resend.dev>";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

const ROLE_LABEL: Record<string, string> = {
  owner: "sahip",
  admin: "yönetici",
  member: "üye",
};

export interface InvitationEmailInput {
  to: string;
  organizationName: string;
  inviterName: string | null;
  role: string;
  token: string;
}

export async function sendInvitationEmail(input: InvitationEmailInput): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY is not set, skipping invitation email");
    return;
  }

  const inviteUrl = `${FRONTEND_URL}/invite/${input.token}`;
  const roleText = ROLE_LABEL[input.role] ?? input.role;
  const inviterText = input.inviterName ?? "Bir ekip üyesi";

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: `${input.organizationName} seni davet etti`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
          <h2 style="margin-bottom: 4px;">${input.organizationName}</h2>
          <p>${inviterText}, seni <strong>${roleText}</strong> rolüyle Vantage'a davet etti.</p>
          <p>
            <a
              href="${inviteUrl}"
              style="display:inline-block;background:#ff6b5b;color:#0d1b3a;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;"
            >
              Daveti Görüntüle
            </a>
          </p>
          <p style="color:#888;font-size:12px;">Bu davet linki 7 gün içinde geçerliliğini yitirir.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error("Failed to send invitation email:", err);
  }
}
