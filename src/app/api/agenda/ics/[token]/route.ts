import { icsForToken } from "@/lib/agenda/bookings";

export const dynamic = "force-dynamic";

/** .ics de una llamada (link seguro, sin login) */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = await icsForToken(token);
  if (!ics) return new Response("No encontrado", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="llamada-estudio-cristofaro.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
