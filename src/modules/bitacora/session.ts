import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/** Cualquier persona con sesión tiene su Bitácora (y su Vigía). Todo se filtra por su id */
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/ingresar");
  return user;
}
