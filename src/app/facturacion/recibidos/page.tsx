import { LecturaInbox } from "@/components/lectura/views";
import { getEntitlements } from "@/lib/faro/entitlements";
import { resolveScope } from "@/modules/smart-docs/scope";
import { availability, listDocs, monthCost } from "@/modules/smart-docs/server";

export const metadata = { title: "Comprobantes recibidos" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const r = await resolveScope("personal");
  const [docs, ready, cost, e] = await Promise.all([listDocs(r.scope, ["para_confirmar", "confirmado", "error"]), availability(r.scope.studioId), monthCost(r.scope.studioId), getEntitlements(r.scope.studioId)]);
  return <LecturaInbox r={r} sp={sp} docs={docs} ready={ready} usage={{ ...cost, limit: e?.limits.smartDocsPerMonth ?? null }} />;
}
