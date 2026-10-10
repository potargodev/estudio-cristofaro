import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { deleteFaq, saveFaq } from "@/app/admin/actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, FormCheckbox } from "@/components/admin/ui";
import { getDb } from "@/db";
import { faqs as faqsTable } from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import type { Faq } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

function FaqFields({ faq }: { faq?: Faq }) {
  const k = faq?.id ?? "nueva";
  return (
    <>
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <AdminField label="Pregunta" htmlFor={`q-${k}`}>
        <Input id={`q-${k}`} name="question" required defaultValue={faq?.question} />
      </AdminField>
      <AdminField label="Respuesta" htmlFor={`a-${k}`}>
        <Textarea id={`a-${k}`} name="answer" required rows={3} defaultValue={faq?.answer} />
      </AdminField>
      <div className="flex flex-wrap items-end gap-4">
        <AdminField label="Orden" htmlFor={`p-${k}`}>
          <Input id={`p-${k}`} name="position" type="number" defaultValue={faq?.position ?? 0} className="w-24" />
        </AdminField>
        <FormCheckbox id={`published-${k}`} name="published" label="Publicada" defaultChecked={faq?.published ?? true} />
      </div>
    </>
  );
}

export default async function PreguntasAdminPage({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const { guardado, error } = await searchParams;
  const { studioId } = await requireStaff();
  const faqs: Faq[] = await getDb()
    .select()
    .from(faqsTable)
    .where(eq(faqsTable.studio_id, studioId))
    .orderBy(asc(faqsTable.position));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos" className="text-sm text-ink underline underline-offset-4 hover:text-rose-deep">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Preguntas frecuentes" />
      </div>
      {guardado && (
        <Notice>Cambios guardados.</Notice>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">Completá la pregunta y la respuesta.</Notice>
        </div>
      )}

      <div className="space-y-4">
        {faqs.map((f) => (
          <div key={f.id} className="border border-line bg-surface p-5">
            <form action={saveFaq} className="grid gap-3">
              <FaqFields faq={f} />
              <div className="flex gap-2">
                <SubmitButton>Guardar</SubmitButton>
              </div>
            </form>
            <form action={deleteFaq} className="mt-2">
              <input type="hidden" name="id" value={f.id} />
              <SubmitButton variant="danger" pendingText="Eliminando…" confirm="¿Eliminar esta pregunta?">
                Eliminar
              </SubmitButton>
            </form>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-[18px] font-medium">Agregar pregunta</h2>
      <form action={saveFaq} className="grid gap-3 border border-dashed border-line p-5">
        <FaqFields />
        <div>
          <SubmitButton>Agregar pregunta</SubmitButton>
        </div>
      </form>
    </div>
  );
}
