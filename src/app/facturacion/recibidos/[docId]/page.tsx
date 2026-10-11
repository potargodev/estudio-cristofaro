import { notFound } from "next/navigation";
import { LecturaReview } from "@/components/lectura/views";
import { resolveScope } from "@/modules/smart-docs/scope";
import { getDoc } from "@/modules/smart-docs/server";

export const metadata = { title: "Revisar documento" };

export default async function Page({ params, searchParams }: { params: Promise<{ docId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ docId }, sp] = await Promise.all([params, searchParams]);
  const r = await resolveScope("personal");
  const d = await getDoc(r.scope, docId);
  if (!d) notFound();
  return <LecturaReview r={r} d={d} sp={sp} />;
}
