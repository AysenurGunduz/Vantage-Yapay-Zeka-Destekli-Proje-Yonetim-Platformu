import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface SendEmailParams {
  from: string;
  to: string;
  subject: string;
  html: string;
}

const send = vi.fn(async (_params: SendEmailParams) => ({ data: { id: "email-1" }, error: null }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  send.mockClear();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("sendInvitationEmail", () => {
  it("skips sending when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendInvitationEmail } = await import("./email.js");

    await sendInvitationEmail({
      to: "invitee@vantage.dev",
      organizationName: "Vantage Org",
      inviterName: "Ayşenur",
      role: "member",
      token: "tok-1",
    });

    expect(send).not.toHaveBeenCalled();
  });

  it("sends an invitation email with the invite link when configured", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.FRONTEND_URL = "http://localhost:5173";
    const { sendInvitationEmail } = await import("./email.js");

    await sendInvitationEmail({
      to: "invitee@vantage.dev",
      organizationName: "Vantage Org",
      inviterName: "Ayşenur",
      role: "admin",
      token: "tok-1",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [call] = send.mock.calls[0];
    expect(call.to).toBe("invitee@vantage.dev");
    expect(call.subject).toContain("Vantage Org");
    expect(call.html).toContain("http://localhost:5173/invite/tok-1");
    expect(call.html).toContain("Ayşenur");
    expect(call.html).toContain("yönetici");
  });

  it("does not throw when the email provider errors", async () => {
    process.env.RESEND_API_KEY = "test-key";
    send.mockRejectedValueOnce(new Error("provider down"));
    const { sendInvitationEmail } = await import("./email.js");

    await expect(
      sendInvitationEmail({
        to: "invitee@vantage.dev",
        organizationName: "Vantage Org",
        inviterName: null,
        role: "member",
        token: "tok-1",
      }),
    ).resolves.toBeUndefined();
  });
});
