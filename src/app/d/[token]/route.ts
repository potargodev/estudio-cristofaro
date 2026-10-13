import { fileForToken } from "@/modules/share/server";

export const dynamic = "force-dynamic";

// Link público de un documento compartido (A4): token aleatorio, con
// vencimiento y revocable por quien lo compartió. Cada apertura queda
// registrada. Vencido o desactivado, responde que ya no está disponible.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const f = await fileForToken((await params).token);
  if (!f) return new Response("Este link venció o fue desactivado. Pedile a quien te lo mandó uno nuevo.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
  const name = f.name.replace(/["\\\r\n]/g, "").slice(0, 120);
  return new Response(Buffer.from(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "X-Content-Type-Options": "nosniff" } });
}
