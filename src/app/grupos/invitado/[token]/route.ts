import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/runtime-config";
import { GUEST_COOKIE, guestByToken } from "@/modules/gastos/server/actor";

export const dynamic = "force-dynamic";

/**
 * Link mágico de un invitado sin cuenta: deja la cookie (que solo abre SU
 * grupo) y lo lleva al grupo. Un link inválido o viejo no revela nada.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const base = getSiteUrl();
  if (!rateLimit(`gastos-invitado:${clientIp(request.headers)}`, 30, 10 * 60 * 1000)) return NextResponse.redirect(`${base}/grupos/entrar?invitacion=limite`);
  const g = await guestByToken(token);
  if (!g) return NextResponse.redirect(`${base}/grupos/entrar?invitacion=invalida`);
  await audit({ studioId: g.studioId, actorLabel: `invitado: ${g.email ?? g.name}`, action: "gastos.invitado_ingresar", entityType: "integrante_gastos", entityId: g.memberId, metadata: { grupo: g.groupId } });
  const res = NextResponse.redirect(`${base}/grupos/g/${g.groupId}`);
  res.cookies.set(GUEST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), maxAge: 60 * 60 * 24 * 90, path: "/" });
  return res;
}
