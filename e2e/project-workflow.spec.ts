import { test, expect, type Page } from "@playwright/test";
import { createTestUser, deleteTestUser, deleteOrganization, type TestUser } from "./utils/testUser";

let user: TestUser;
let orgId: string | null = null;

async function dragTaskToColumn(page: Page, taskTitle: string, columnLabel: string) {
  const card = page.getByText(taskTitle, { exact: true }).locator("..");
  const column = page.getByRole("heading", { name: columnLabel }).locator("../..");

  const cardBox = await card.boundingBox();
  const columnBox = await column.boundingBox();
  if (!cardBox || !columnBox) throw new Error("Could not locate the drag source or target");

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = columnBox.x + columnBox.width / 2;
  const endY = columnBox.y + columnBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / steps, startY + ((endY - startY) * i) / steps, {
      steps: 5,
    });
    await page.waitForTimeout(20);
  }

  await page.mouse.up();
}

test.describe("temel iş akışı: organizasyon, proje, görev ve Kanban", () => {
  test.beforeAll(async () => {
    user = await createTestUser("e2e-workflow");
  });

  test.afterAll(async () => {
    if (orgId) await deleteOrganization(orgId);
    await deleteTestUser(user.id);
  });

  test("kullanıcı organizasyon/proje/görev oluşturup görevi Kanban'da taşıyabilir", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-posta").fill(user.email);
    await page.getByLabel("Şifre").fill(user.password);
    await page.getByRole("button", { name: "Giriş Yap" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/dashboard/workspace");

    const orgName = `E2E Org ${Date.now()}`;
    const [orgResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/organizations") && r.request().method() === "POST"),
      (async () => {
        await page.getByPlaceholder("Yeni organizasyon").fill(orgName);
        await page.getByRole("button", { name: "Organizasyon oluştur" }).click();
      })(),
    ]);
    orgId = (await orgResponse.json()).id;

    await page.getByText(orgName).click();
    await page.getByRole("button", { name: "Yeni proje" }).click();

    const projectName = `E2E Project ${Date.now()}`;
    await page.getByPlaceholder("Örn. Mobil uygulama yeniden tasarımı").fill(projectName);
    await page.getByRole("button", { name: "Projeyi oluştur" }).click();

    await page.getByText(projectName).click();

    const taskTitle = `E2E Task ${Date.now()}`;
    await page.getByPlaceholder("Yeni görev başlığı").fill(taskTitle);
    await page.getByRole("button", { name: "Ekle" }).click();

    const backlogColumn = page.getByRole("heading", { name: "Backlog" }).locator("../..");
    await expect(backlogColumn.getByText(taskTitle, { exact: true })).toBeVisible();

    await dragTaskToColumn(page, taskTitle, "Devam Ediyor");

    const inProgressColumn = page.getByRole("heading", { name: "Devam Ediyor" }).locator("../..");
    await expect(inProgressColumn.getByText(taskTitle, { exact: true })).toBeVisible();
    await expect(backlogColumn.getByText(taskTitle, { exact: true })).toHaveCount(0);
  });
});
