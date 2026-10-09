import "server-only";
import { getOrgStaff } from "../organizations";
import { getHosts } from "./slots";

/** Personas del estudio asignadas a la organización que aceptan llamadas (el responsable primero) */
export async function orgHosts(studioId: string, organizationId: string) {
  const team = await getOrgStaff(organizationId);
  const ordered = [...team.filter((t) => t.assignment === "responsable"), ...team.filter((t) => t.assignment !== "responsable")];
  const hosts = await getHosts(studioId, { userIds: ordered.map((t) => t.id) });
  return ordered.map((t) => hosts.find((h) => h.av.user_id === t.id)).filter((h): h is NonNullable<typeof h> => Boolean(h));
}
