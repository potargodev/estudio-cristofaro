import { CheckCircle2, Circle, KeyRound, Receipt, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import { onboardingAction } from "@/app/facturacion/actions";
import { Feedback } from "@/components/app/Feedback";
import { Panel, SubmitButton, chipClass, fieldClass } from "@/components/ds";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { onboardingState, type IssuerScope } from "@/modules/arca/server";

// Empezar a facturar (§2.p, B10): tres pasos, uno detrás del otro. 1) los
// datos de la CUIT, 2) la delegación del servicio a Faro (se prueba trayendo
// los puntos de venta) y 3) una factura de prueba en homologación, sin validez
// fiscal. Faro nunca pide ni guarda la clave fiscal.

export async function OnboardingView({ scope, sp }: { scope: IssuerScope; sp: Record<string, string | undefined> }) {
  const st = await onboardingState(scope);
  const hidden = scope.kind === "studio" ? { org: scope.organizationId, cuit: scope.cuit } : {};
  const steps = [st.cuitOk, st.delegated, !!st.test];
  const current = steps.findIndex((x) => !x);
  const Hidden = () => (
    <>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
  const Mark = ({ i }: { i: number }) => (steps[i] ? <CheckCircle2 className="size-5 text-ok" aria-label="Listo" /> : <Circle className={cn("size-5", current === i ? "text-ink" : "text-muted")} aria-label={current === i ? "Paso actual" : "Pendiente"} />);
  return (
    <div className="grid max-w-2xl gap-5">
      <Feedback sp={sp} />
      <ol className="flex flex-wrap gap-2" aria-label="Pasos">
        {["Tu CUIT", "Delegación", "Factura de prueba"].map((l, i) => (
          <li key={l} className={chipClass(current === i)}>
            {i + 1}. {l}
            {steps[i] ? " ✓" : ""}
          </li>
        ))}
      </ol>

      <Panel title="1. Tu CUIT y tus datos" icon={KeyRound} action={<Mark i={0} />}>
        {!/^\d{11}$/.test(scope.cuit) ? (
          <p className="text-ui text-muted">{scope.kind === "studio" ? "Cargá la CUIT en los datos de la organización (razones sociales) y volvé." : "Tu cuenta no tiene CUIT: cargala en tus datos."}</p>
        ) : (
          <form action={onboardingAction} className="grid gap-3">
            <Hidden />
            <input type="hidden" name="op" value="datos" />
            <p className="text-ui">
              CUIT <span className="num">{formatCuit(scope.cuit)}</span>
            </p>
            <label className="text-meta text-muted">
              Razón social o nombre
              <input name="business_name" required defaultValue={st.settings.business_name} className={cn(fieldClass, "mt-1")} />
            </label>
            <label className="text-meta text-muted">
              Condición frente al IVA
              <select name="iva_condition" defaultValue={st.settings.iva_condition} className={cn(fieldClass, "mt-1")}>
                <option value="monotributo">Monotributo</option>
                <option value="responsable_inscripto">Responsable inscripto</option>
                <option value="exento">Exento</option>
              </select>
            </label>
            <label className="text-meta text-muted">
              Domicilio comercial (sale en la factura)
              <input name="address" defaultValue={st.settings.address ?? ""} className={cn(fieldClass, "mt-1")} />
            </label>
            <div>
              <SubmitButton variant={st.cuitOk ? "secondary" : "primary"}>{st.cuitOk ? "Actualizar" : "Guardar y seguir"}</SubmitButton>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="2. Delegá la factura electrónica en Faro" icon={ShieldCheck} action={<Mark i={1} />}>
        <div className="grid gap-3">
          <ol className="grid list-decimal gap-1 pl-5 text-ui">
            <li>Entrá a ARCA con tu clave fiscal (vos, no Faro: Faro nunca la pide ni la guarda).</li>
            <li>En «Administrador de Relaciones de Clave Fiscal», adherí el servicio «Facturación electrónica» y delegalo en Faro.</li>
            <li>En «Administración de puntos de venta», creá un punto de venta «RECE para aplicativo y web services» (si no tenés).</li>
          </ol>
          <Link href="/ayuda/facturacion/delegar-en-faro" className="text-ui underline underline-offset-4">
            Paso a paso con imágenes
          </Link>
          {st.delegated && <p className="text-ui text-ok">Puntos de venta: {st.points.filter((p) => !p.blocked).map((p) => p.number).join(", ")}</p>}
          <form action={onboardingAction}>
            <Hidden />
            <input type="hidden" name="op" value="delegacion" />
            <SubmitButton variant={st.delegated ? "secondary" : "primary"} pendingText="Consultando a ARCA…">
              {st.delegated ? "Volver a probar" : "Ya delegué: probar"}
            </SubmitButton>
          </form>
        </div>
      </Panel>

      <Panel title="3. Una factura de prueba" icon={Receipt} action={<Mark i={2} />}>
        <div className="grid gap-3">
          <p className="text-ui text-muted">Faro emite una factura de $ 1 en homologación (el ambiente de prueba de ARCA, sin validez fiscal) para comprobar que todo funciona. No queda en tus libros.</p>
          {st.test && (
            <p className="text-ui text-ok">
              Autorizada en homologación{st.test.cae ? ` con el CAE ${st.test.cae}` : ""}.
            </p>
          )}
          <form action={onboardingAction}>
            <Hidden />
            <input type="hidden" name="op" value="prueba" />
            <SubmitButton variant={st.test ? "secondary" : "primary"} pendingText="Emitiendo en homologación…">
              {st.test ? "Probar de nuevo" : "Emitir la factura de prueba"}
            </SubmitButton>
          </form>
        </div>
      </Panel>

      {steps.every(Boolean) && (
        <Link href={`${scope.base}/rapida`} className={cn(chipClass(true), "w-fit")}>
          <Zap className="size-4" aria-hidden /> Listo: hacé tu primera factura
        </Link>
      )}
    </div>
  );
}
