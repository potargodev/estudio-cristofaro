import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { DemoPanel } from "@/components/faro/DemoPanel";
import { getDb } from "@/db";
import { requireFaro } from "@/lib/auth";
import { DEMO_PROFILES, demoState } from "@/modules/demo";

export const metadata: Metadata = { title: "Demo" };

/** Datos de demostración: espacios marcados is_demo para mostrar y probar Faro sin tocar datos reales */
export default async function DemoPage() {
  const me = await requireFaro();
  const state = await demoState(getDb());
  return (
    <div className="grid gap-5">
      <PageHeader
        level={2}
        title="Demo"
        description="Un universo de prueba para mostrar y probar Faro: 3 estudios, 15 personas y autónomos, cajas, conexiones, la Red Contable y Flotas. Todo queda marcado como demo, con mails @demo.faro.local, y nunca se mezcla con datos reales."
        className="mb-0"
      />
      <p className="text-ui">
        {state.loaded ? (
          <>
            Hay una demo cargada: <strong className="num">{state.studios}</strong> espacios y <strong className="num">{state.users}</strong> usuarios.
          </>
        ) : (
          "No hay una demo cargada."
        )}
      </p>
      <DemoPanel loaded={state.loaded} owner={me.faroRole === "faro_owner"} />
      <section aria-labelledby="perfiles" className="rounded-md border border-line bg-surface p-4 sm:p-5">
        <h3 id="perfiles" className="text-title font-semibold">
          Un usuario por perfil
        </h3>
        <ul className="mt-3 grid gap-2 text-ui sm:grid-cols-2">
          {DEMO_PROFILES.map((p) => (
            <li key={p.key}>
              <strong>{p.label}:</strong> <span className="text-muted">{p.what}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-meta text-muted">Desde la consola de `web` en Easypanel: `node dist/demo.mjs seed` (carga y muestra las contraseñas), `node dist/demo.mjs reset` (borra) y `node dist/demo.mjs estado`.</p>
      </section>
    </div>
  );
}
