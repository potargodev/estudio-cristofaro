import { portalBrand, getBranding } from "@/modules/white-label/server";
import { readStored } from "@/lib/uploads";

// Logo de la marca blanca: es público a propósito (se muestra en el ingreso
// al portal, antes de iniciar sesión). Solo PNG o JPG validados al subirlos,
// y solo si el estudio tiene la marca blanca activa.

export async function GET(_req: Request, { params }: { params: Promise<{ studioId: string }> }) {
  const { studioId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studioId) || !(await portalBrand(studioId))) return new Response("No encontrado", { status: 404 });
  const b = await getBranding(studioId);
  if (!b?.logo_path || !b.logo_mime) return new Response("No encontrado", { status: 404 });
  const { data } = await readStored(b.logo_path);
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": b.logo_mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
  });
}
