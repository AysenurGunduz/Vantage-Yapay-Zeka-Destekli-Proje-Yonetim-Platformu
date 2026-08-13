import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, deleteOrganization, type TestUser } from "./utils/testUser";

let inviter: TestUser;
let invitee: TestUser;
let orgId: string | null = null;

test.describe("davet akışı: bekleyen davetin görünmesi ve kabul edilmesi", () => {
  test.beforeAll(async () => {
    inviter = await createTestUser("e2e-inviter");
    invitee = await createTestUser("e2e-invitee");
  });

  test.afterAll(async () => {
    if (orgId) await deleteOrganization(orgId);
    await deleteTestUser(inviter.id);
    await deleteTestUser(invitee.id);
  });

  test("davet edilen kullanıcı bekleyen daveti kendi hesabında görüp kabul edebilir", async ({ browser }) => {
    const inviterContext = await browser.newContext();
    const inviterPage = await inviterContext.newPage();

    await inviterPage.goto("/login");
    await inviterPage.getByLabel("E-posta").fill(inviter.email);
    await inviterPage.getByLabel("Şifre").fill(inviter.password);
    await inviterPage.getByRole("button", { name: "Giriş Yap" }).click();
    await inviterPage.waitForURL("**/dashboard");
    await inviterPage.goto("/dashboard/workspace");

    const orgName = `E2E Invite Org ${Date.now()}`;
    const [orgResponse] = await Promise.all([
      inviterPage.waitForResponse((r) => r.url().endsWith("/api/organizations") && r.request().method() === "POST"),
      (async () => {
        await inviterPage.getByPlaceholder("Yeni organizasyon").fill(orgName);
        await inviterPage.getByRole("button", { name: "Organizasyon oluştur" }).click();
      })(),
    ]);
    orgId = (await orgResponse.json()).id;

    await inviterPage.getByText(orgName).click();
    await inviterPage.getByRole("link", { name: "Ekip Üyeleri" }).click();
    await inviterPage.waitForURL("**/team");

    await inviterPage.getByPlaceholder("yeni.uye@sirket.com").fill(invitee.email);
    await inviterPage.getByRole("button", { name: "Davet Et" }).click();
    await inviterPage.getByText("Kopyala").waitFor();

    await inviterContext.close();

    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();

    await inviteePage.goto("/login");
    await inviteePage.getByLabel("E-posta").fill(invitee.email);
    await inviteePage.getByLabel("Şifre").fill(invitee.password);
    await inviteePage.getByRole("button", { name: "Giriş Yap" }).click();
    await inviteePage.waitForURL("**/dashboard");
    await inviteePage.goto("/dashboard/workspace");

    await expect(inviteePage.getByText("seni üye rolüyle davet etti.")).toBeVisible();
    await expect(inviteePage.getByText(orgName).first()).toBeVisible();

    await inviteePage.getByRole("button", { name: "Kabul et" }).click();
    await expect(inviteePage.getByRole("button", { name: "Kabul et" })).toHaveCount(0);
    await expect(inviteePage.getByText(orgName).first()).toBeVisible();

    await inviteeContext.close();
  });
});
