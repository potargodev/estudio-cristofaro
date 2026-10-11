import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BusinessBoxView } from "@/components/cajas/BusinessBoxView";
import { isMonth, monthOf } from "@/modules/bitacora/catalog";
import { requireUser } from "@/modules/bitacora/session";
import { boxFor } from "@/modules/cajas/server";

export const metadata: Metadata = { title: "Caja" };

/** Una caja: solo la ven sus integrantes (un ID ajeno da 404) */
export default async function CajaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireUser();
  const r = await boxFor(me.id, id);
  if (!r) notFound();
  if (r.box.kind === "personal") redirect("/bitacora");
  const month = isMonth(sp.mes) ? sp.mes! : monthOf();
  if (r.box.kind === "negocio") return <BusinessBoxView me={me} box={r.box} month={month} sp={sp} />;
  notFound();
}
