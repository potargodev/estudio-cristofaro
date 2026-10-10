import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Cualquier persona con sesión tiene su Bitácora (y su Copiloto). Todo se filtra por su id */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return user;
}
