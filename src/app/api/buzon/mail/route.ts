import { receiveMail } from "@/modules/buzon/server";

export const dynamic = "force-dynamic";

/**
 * Correo entrante del buzón (§2.p, B8): el proveedor de mail entrante manda
 * cada mensaje reenviado a comprobantes+<token>@… como JSON (to, from,
 * subject y adjuntos en base64), con el secreto en X-Faro-Inbox-Secret.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }
  const r = await receiveMail(req.headers.get("x-faro-inbox-secret"), (body ?? {}) as Parameters<typeof receiveMail>[1]);
  return Response.json({ leidos: r.read }, { status: r.status });
}
