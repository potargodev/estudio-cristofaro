import { entryPath } from "@/lib/spaces";

// Puerta de entrada de la app (instalada o después de ingresar): entra al
// último espacio usado (personal, estudio, organización o Faro Manager); sin
// uno guardado, al natural de la sesión. Sin sesión, al ingreso de clientes.
// Location relativo: funciona igual detrás del proxy de Easypanel.
export async function GET() {
  const to = await entryPath();
  return new Response(null, { status: 307, headers: { Location: to, "Cache-Control": "no-store" } });
}
