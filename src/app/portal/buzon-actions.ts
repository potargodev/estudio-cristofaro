"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { hasModule } from "@/lib/faro/entitlements";
import { fileFromForm } from "@/lib/uploads";
import { readUpload, SmartDocError } from "@/modules/smart-docs/server";

// Comprobantes que manda el cliente desde el portal (§2.p, B8): entran al
// buzón del estudio para revisar. La organización sale de la sesión.

const BACK = "/portal/comprobantes";
const go = (q: Record<string, string>): never => redirect(`${BACK}?${new URLSearchParams(q)}`);

export async function sendReceiptAction(fd: FormData) {
  const me = await requireMember("documentos.subir");
  if (!(await hasModule(me.studioId, "smart_docs"))) go({ error: "Tu estudio todavía no recibe comprobantes por acá. Mandalos por Documentos." });
  const file = fileFromForm(fd, "file");
  if (!file) go({ error: "Elegí el PDF o la foto del comprobante." });
  try {
    await readUpload({ studioId: me.studioId, organizationId: me.organizationId, ownerUserId: null, scope: "organizacion", canConfirm: false }, me, file!, "portal");
  } catch (e) {
    if (e instanceof SmartDocError) go({ error: e.message });
    throw e;
  }
  revalidatePath(BACK);
  go({ ok: "¡Recibido! El estudio lo revisa y te avisamos acá en qué quedó." });
}
