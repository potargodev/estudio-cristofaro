import { redirect } from "next/navigation";
import { cache } from "react";
import { createSessionClient } from "./supabase/server";
import type { Profile } from "./types";

export const getSession = cache(async () => {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, studio_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, profile: (profile as Profile | null) ?? null };
});

/** Usuario del estudio (admin o contador). Si no, lo saca del backoffice. */
export async function requireStaff() {
  const session = await getSession();
  const profile = session.profile;
  if (!profile || profile.role === "cliente") redirect("/admin/sin-acceso");
  return { ...session, profile };
}
