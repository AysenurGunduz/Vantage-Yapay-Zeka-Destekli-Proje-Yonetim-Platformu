import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../backend/.env") });

export const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

const TEST_PASSWORD = "Test1234!";

export async function createTestUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${Date.now()}@vantage.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  await admin.from("profiles").update({ usage_purpose: "work" }).eq("id", data.user.id);

  return { id: data.user.id, email, password: TEST_PASSWORD };
}

export async function deleteTestUser(userId: string) {
  await admin.auth.admin.deleteUser(userId);
}

export async function deleteOrganization(orgId: string) {
  // Members, invitations, projects, and tasks all cascade-delete from organizations.
  await admin.from("organizations").delete().eq("id", orgId);
}
