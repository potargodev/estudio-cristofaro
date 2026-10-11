import { asc, eq } from "drizzle-orm";
import { deleteStudioMpAction, saveSettingsAction, saveStudioMpAction } from "@/app/admin/honorarios-actions";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { MpAccountForm } from "@/components/cobros/MpAccountForm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { getBillingSettings } from "@/modules/billing/fees";
import { accountSummary, notificationUrl } from "@/modules/billing/mp";

export const metadata = { title: "Configuración de honorarios" };
const field = "mt-1 block h-9 w-full rounded-md border border-line bg-surface px-2 text-[14px] text-ink";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireOperator();
  const [s, mp, orgs] = await Promise.all([getBillingSettings(me.studioId), accountSummary(me.studioId), getDb().select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.studio_id, me.studioId)).orderBy(asc(organizations.name))]);
  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      <section aria-label="Mercado Pago" className="grid gap-2">
        <h2 className="text-[16px] font-semibold">Mercado Pago del estudio</h2>
        <MpAccountForm summary={mp} save={saveStudioMpAction} remove={deleteStudioMpAction} webhookUrl={notificationUrl(me.studioId)} canEdit={me.role === "dueno"} />
      </section>
      <form action={saveSettingsAction} className="grid gap-3 rounded-md border border-line bg-surface p-4">
        <h2 className="text-[16px] font-semibold">Cobros y facturas</h2>
        <label className="text-[13px] text-muted">
          Organización que representa al estudio para facturar por ARCA
          <select name="issuer" defaultValue={s.issuer_organization_id ?? ""} className={field}>
            <option value="">Sin facturar desde Faro</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <span className="mt-1 block text-[12px]">Cargá el estudio como una organización con su CUIT, delegá el servicio de facturación en Faro y traé sus puntos de venta (pestaña ARCA). Las facturas se emiten con confirmación.</span>
        </label>
        <label className="text-[13px] text-muted sm:w-48">
          Día de vencimiento de los abonos
          <input name="due_day" type="number" min={1} max={28} defaultValue={s.due_day} className={field} />
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" name="reminders" defaultChecked={s.reminders} /> Recordatorios automáticos (3 días antes, el día del vencimiento y a los 3, 7 y 15 días)
        </label>
        <div>
          <SubmitButton pendingText="…">Guardar</SubmitButton>
        </div>
      </form>
    </div>
  );
}
