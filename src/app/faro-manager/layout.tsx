import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { FaroManagerShell } from "@/components/faro/FaroManagerShell";
import { Toaster } from "@/components/ui/sonner";
import { getDb } from "@/db";
import { plan_requests } from "@/db/schema";
import { moderationCounts } from "@/modules/red/server";
import { requireFaro } from "@/lib/auth";
import { signOut } from "../admin/actions";

export const metadata: Metadata = { title: { default: "Faro Manager", template: "%s · Faro Manager" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Faro Manager: solo el nivel plataforma (faro_owner y faro_support, con 2FA) */
export default async function FaroManagerLayout({ children }: { children: React.ReactNode }) {
  const faro = await requireFaro();
  const [[req], red] = await Promise.all([getDb().select({ n: count() }).from(plan_requests).where(and(eq(plan_requests.status, "pendiente"))), moderationCounts()]);
  return (
    <>
      <FaroManagerShell user={{ name: faro.name, email: faro.email, role: faro.faroRole! }} badges={{ requests: req?.n ?? 0, verifications: red.licenses + red.reviews }} signOut={signOut}>
        {children}
      </FaroManagerShell>
      <Toaster position="top-center" />
    </>
  );
}
