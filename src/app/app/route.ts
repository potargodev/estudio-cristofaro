import { getCurrentUser } from "@/lib/auth";

// Puerta de entrada de la app instalada: el estudio va al backoffice, los
// clientes a su portal y quien no tiene sesión, al ingreso de clientes.
// Location relativo: funciona igual detrás del proxy de Easypanel.
export async function GET() {
  const user = await getCurrentUser();
  const to = !user ? "/portal/login" : user.role === "cliente" ? "/portal" : "/admin";
  return new Response(null, { status: 307, headers: { Location: to, "Cache-Control": "no-store" } });
}
