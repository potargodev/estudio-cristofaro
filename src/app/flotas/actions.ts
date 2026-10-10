"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requirePersonal } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import * as fl from "@/modules/flotas/server";
import { recordAcceptance } from "@/modules/legal/server";

// Acciones de Flotas. Quién es sale SIEMPRE de la sesión (titular de una
// cuenta personal); que pertenezca a la Flota y su rol lo valida el módulo.

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function me() {
  const u = await requirePersonal();
  return { user: u, me: { id: u.id, name: u.name, email: u.email } };
}

async function run(back: string, fn: () => Promise<string | void>, ok: string) {
  let to = back;
  try {
    const r = await fn();
    if (typeof r === "string") to = r;
  } catch (e) {
    if (e instanceof fl.FleetError) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/flotas", "layout");
  redirect(`${to}${to.includes("?") ? "&" : "?"}ok=${encodeURIComponent(ok)}`);
}

const fleetPath = (fd: FormData) => {
  const id = s(fd, "fleet");
  return /^[0-9a-f-]{36}$/i.test(id) ? `/flotas/${id}` : "/flotas";
};

export async function createFleetAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    "/flotas",
    async () => {
      const id = await fl.createFleet(m, { name: s(fd, "name"), description: s(fd, "description"), profile: s(fd, "profile"), informalAck: fd.get("informal") === "on" });
      await audit({ studioId: user.studioId, actor: user, action: "flota.creada", entityType: "flota", entityId: id });
      await recordAcceptance(user, ["flotas"], clientIp(await headers()));
      return `/flotas/${id}`;
    },
    "Creaste la Flota. Ahora invitá a tu tripulación.",
  );
}

export async function answerInvitationAction(fd: FormData) {
  const { user, me: m } = await me();
  const accept = s(fd, "accept") === "1";
  await run(
    "/flotas",
    async () => {
      const id = await fl.answerInvitation(m, s(fd, "member"), accept, s(fd, "profile"), fd.get("informal") === "on");
      await audit({ studioId: user.studioId, actor: user, action: accept ? "flota.unirse" : "flota.rechazar", entityType: "flota", entityId: id });
      if (accept) await recordAcceptance(user, ["flotas"], clientIp(await headers()));
      return accept ? `/flotas/${id}` : "/flotas";
    },
    accept ? "Te sumaste a la Flota." : "Rechazaste la invitación.",
  );
}

export async function inviteAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.inviteMember(m, s(fd, "fleet"), s(fd, "email"), s(fd, "name"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.invitar", entityType: "flota", entityId: s(fd, "fleet"), metadata: { email: s(fd, "email").toLowerCase() } });
    },
    "Invitación enviada.",
  );
}

export async function updateFleetAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.updateFleet(m, s(fd, "fleet"), s(fd, "name"), s(fd, "description"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.editar", entityType: "flota", entityId: s(fd, "fleet") });
    },
    "Guardado.",
  );
}

export async function setProfileAction(fd: FormData) {
  const { me: m } = await me();
  await run(fleetPath(fd), () => fl.setMyProfile(m, s(fd, "fleet"), s(fd, "profile")), "Perfil actualizado.");
}

export async function removeMemberAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.removeMember(m, s(fd, "fleet"), s(fd, "member"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.quitar", entityType: "flota", entityId: s(fd, "fleet"), metadata: { integrante: s(fd, "member") } });
    },
    "Integrante quitado.",
  );
}

export async function transferCaptainAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.transferCaptain(m, s(fd, "fleet"), s(fd, "member"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.capitan", entityType: "flota", entityId: s(fd, "fleet"), metadata: { a: s(fd, "member") } });
    },
    "Pasaste el rol de Capitán.",
  );
}

export async function leaveFleetAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.leaveFleet(m, s(fd, "fleet"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.salir", entityType: "flota", entityId: s(fd, "fleet") });
      return "/flotas";
    },
    "Saliste de la Flota. Tu acuerdo con el estudio, si tenías, sigue vigente hasta que lo des de baja.",
  );
}

export async function postMessageAction(fd: FormData) {
  const { me: m } = await me();
  await run(fleetPath(fd), () => fl.postMessage(m, s(fd, "fleet"), s(fd, "body")), "Mensaje enviado.");
}

export async function publishRequestAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.publishRequest(m, s(fd, "fleet"), s(fd, "zone"), fd.getAll("services").map(String), s(fd, "message"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.pedido", entityType: "flota", entityId: s(fd, "fleet") });
    },
    "Publicaste el pedido en la Red de estudios.",
  );
}

export async function closeRequestAction(fd: FormData) {
  const { user, me: m } = await me();
  await run(
    fleetPath(fd),
    async () => {
      await fl.closeRequest(m, s(fd, "fleet"));
      await audit({ studioId: user.studioId, actor: user, action: "flota.pedido_cerrar", entityType: "flota", entityId: s(fd, "fleet") });
    },
    "Cerraste el pedido.",
  );
}

export async function voteAction(fd: FormData) {
  const { me: m } = await me();
  await run(fleetPath(fd), () => fl.vote(m, s(fd, "fleet"), s(fd, "proposal")), "Voto registrado (no es vinculante).");
}

export async function signAgreementAction(fd: FormData) {
  const { user, me: m } = await me();
  const proposal = s(fd, "proposal");
  await run(
    `/flotas/acuerdo/${/^[0-9a-f-]{36}$/i.test(proposal) ? proposal : "x"}`,
    async () => {
      const r = await fl.signAgreement(m, proposal, s(fd, "signed_name"), fd.get("consent") === "on", clientIp(await headers()));
      await audit({ studioId: user.studioId, actor: user, action: "flota.acuerdo_firmado", entityType: "acuerdo", entityId: r.agreementId });
      await audit({ studioId: r.studioId, organizationId: r.organizationId, actor: user, action: "flota.acuerdo_firmado", entityType: "acuerdo", entityId: r.agreementId });
      return "/flotas/servicios";
    },
    "Firmaste tu acuerdo. El estudio se va a poner en contacto.",
  );
}

export async function requestEndAction(fd: FormData) {
  const { user, me: m } = await me();
  const id = s(fd, "agreement");
  if (fd.get("confirm") !== "on") redirect(`/flotas/servicios?baja=${encodeURIComponent(id)}&error=${encodeURIComponent("Confirmá que revisaste la liquidación final.")}`);
  await run(
    "/flotas/servicios",
    async () => {
      const r = await fl.requestEnd(m, id);
      await audit({ studioId: user.studioId, actor: user, action: "flota.acuerdo_baja", entityType: "acuerdo", entityId: id, metadata: { fin: r.endsOn, pendiente: r.pendingAmount } });
      await audit({ studioId: r.agreement.studio_id, organizationId: r.agreement.organization_id, actor: user, action: "flota.acuerdo_baja", entityType: "acuerdo", entityId: id, metadata: { fin: r.endsOn } });
    },
    "Pediste la baja. El servicio sigue hasta la fecha de fin.",
  );
}
