import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/** Cliente con la sesión del usuario (backoffice). Respeta RLS. */
export async function createSessionClient() {
  if (!url || !anonKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      },
    },
  });
}

/** Cliente anónimo sin cookies (web pública, permite render estático). */
export function createPublicClient() {
  if (!url || !anonKey) return null;
  return createJsClient(url, anonKey, { auth: { persistSession: false } });
}

/** Cliente con service role. Solo para el servidor (alta de consultas desde la web). */
export function createServiceClient() {
  if (!url || !serviceKey) return null;
  return createJsClient(url, serviceKey, { auth: { persistSession: false } });
}
