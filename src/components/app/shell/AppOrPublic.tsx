import { PublicShell } from "@/components/app/PublicShell";
import { getCurrentUser } from "@/lib/auth";
import { AppFrame } from "./AppFrame";
import type { Space } from "./spaces";

/** Páginas que se leen sin cuenta (Ayuda, Red, Legal): con sesión, dentro del marco de la app */
export async function AppOrPublic({ sub, home, wide, space, children }: { sub: string; home: string; wide?: boolean; space?: Space; children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (user) return <AppFrame space={space}>{children}</AppFrame>;
  return (
    <PublicShell sub={sub} home={home} wide={wide}>
      {children}
    </PublicShell>
  );
}
