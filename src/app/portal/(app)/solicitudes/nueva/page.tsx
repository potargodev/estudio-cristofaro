import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/admin/ui";
import { FileField } from "@/components/portal/FileField";
import { Card, PageTitle } from "@/components/portal/ui";
import { requireClient } from "@/lib/auth";
import { REQUEST_TYPES } from "@/lib/portal-types";
import { createRequest } from "../../../actions";

export const metadata: Metadata = { title: "Nueva solicitud" };

const field = "mt-1.5 w-full rounded-md border border-line bg-surface px-3 text-[15px]";

export default async function NuevaSolicitudPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireClient();
  const { error } = await searchParams;
  return (
    <>
      <Link href="/portal/solicitudes" className="link-underline text-sm text-rose-deep">
        Solicitudes
      </Link>
      <div className="mt-2">
        <PageTitle title="Nueva solicitud" intro="Te respondemos en menos de 24 horas hábiles." />
      </div>
      <Card className="max-w-2xl">
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error === "campos" ? "Completá el asunto y el mensaje." : error}
          </p>
        )}
        <form action={createRequest} className="grid gap-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium">
              Tipo
            </label>
            <select id="type" name="type" defaultValue="consulta" className={`${field} h-11`}>
              {Object.entries(REQUEST_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subject" className="block text-sm font-medium">
              Asunto
            </label>
            <input id="subject" name="subject" required maxLength={140} className={`${field} h-11`} />
          </div>
          <div>
            <label htmlFor="body" className="block text-sm font-medium">
              Mensaje
            </label>
            <textarea id="body" name="body" required rows={6} maxLength={5000} className={`${field} py-2.5`} />
          </div>
          <FileField id="file" label="Adjunto (opcional)" />
          <div>
            <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
