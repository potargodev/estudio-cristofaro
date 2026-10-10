import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { user_preferences, type UserPrefs } from "@/db/schema";

export async function getPrefs(userId: string): Promise<UserPrefs> {
  const [r] = await getDb().select({ data: user_preferences.data }).from(user_preferences).where(eq(user_preferences.user_id, userId));
  return r?.data ?? {};
}

export async function setPrefs(userId: string, patch: Partial<UserPrefs>) {
  const current = await getPrefs(userId);
  const data = { ...current, ...patch };
  await getDb()
    .insert(user_preferences)
    .values({ user_id: userId, data })
    .onConflictDoUpdate({ target: user_preferences.user_id, set: { data, updated_at: new Date() } });
  return data;
}
