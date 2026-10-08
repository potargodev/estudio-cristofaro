import type { Metadata } from "next";
import Link from "next/link";
import { deleteFaq, saveFaq } from "@/app/admin/actions";
import { AdminField, AdminPageHeader, Notice } from "@/components/admin/AdminField";
import { SubmitButton, adminInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth";
import type { Faq } from "@/lib/types";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

function FaqFields({ faq }: { faq?: Faq }) {
  const k = faq?.id ?? "nueva";
  return (
    <>
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <AdminField label="Pregunta" htmlFor={`q-${k}`}>
        <input id={`q-${k}`} name="question" required defaultValue={faq?.question} className={adminInput} />
      </AdminField>
      <AdminField label="Respuesta" htmlFor={`a-${k}`}>
        <textarea id={`a-${k}`} name="answer" required rows={3} defaultValue={faq?.answer} className={adminInput} />
      </AdminField>
      <div className="flex flex-wrap items-end gap-4">
        <AdminField label="Orden" htmlFor={`p-${k}`}>
          <input id={`p-${k}`} name="position" type="number" defaultValue={faq?.position ?? 0} className={`${adminInput} w-24`} />
        </AdminField>
        <label className="mb-2 flex items-center gap-2 text-[15px]">
          <input type="checkbox" name="published" defaultChecked={faq?.published ?? true} className="size-4 accent-[var(--color-navy)]" />
          Publicada
        </label>
      </div>
    </>
  );
}

export default async function PreguntasAdminPage({ searchParams }: { searchParams: Promise<{ guardado?: string; error?: string }> }) {
  const { guardado, error } = await searchParams;
  const { supabase } = await requireStaff();
  const { data } = await supabase.from("faqs").select("*").order("position");
  const faqs = (data ?? []) as Faq[];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/contenidos" className="text-sm text-rose-deep underline-offset-4 hover:underline">
        Contenidos
      </Link>
      <div className="mt-2">
        <AdminPageHeader title="Preguntas frecuentes" />
      </div>
      {guardado && (
        <div className="mb-4">
          <Notice>Cambios guardados.</Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="error">Completá la pregunta y la respuesta.</Notice>
        </div>
      )}

      <div className="space-y-4">
        {faqs.map((f) => (
          <div key={f.id} className="rounded-md border border-line bg-surface p-5">
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

      <h2 className="mb-3 mt-10 text-lg font-semibold">Agregar pregunta</h2>
      <form action={saveFaq} className="grid gap-3 rounded-md border border-dashed border-line p-5">
        <FaqFields />
        <div>
          <SubmitButton>Agregar pregunta</SubmitButton>
        </div>
      </form>
    </div>
  );
}
