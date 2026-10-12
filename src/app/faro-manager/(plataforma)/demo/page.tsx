import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { Eye } from "lucide-react";
import { viewAsAction } from "@/app/faro-manager/demo-actions";
import { DemoPanel } from "@/components/faro/DemoPanel";
import { Button, List, ListRow, Notice, PageHeader, SectionTitle } from "@/components/ds";
import { getDb } from "@/db";
import { studios, users } from "@/db/schema";
import { requireFaro } from "@/lib/auth";
import { DEMO_PROFILES, demoState } from "@/modules/demo";

const KIND = { studio: "Estudio", personal: "Autónomo", persona: "Persona" } as const;
const ROLE: Record<string, string> = { dueno: "Dueño", contador: "Contador", colaborador: "Colaborador", titular: "Titular", cliente: "Organización o empleado" };

export const metadata: Metadata = { title: "Demo" };

/** Datos de demostración: espacios marcados is_demo para mostrar y probar Faro sin tocar datos reales */
export default async function DemoPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireFaro();
  const { error } = await searchParams;
  const db = getDb();
  const owner = me.faroRole === "faro_owner";
  const state = await demoState(db);
  // «Ver como…»: solo usuarios activos de espacios de la demo
  const people =
    owner && state.loaded
      ? await db
          .select({ id: users.id, name: users.name, email: users.email, role: users.role, studio: studios.name, kind: studios.kind })
          .from(users)
          .innerJoin(studios, eq(studios.id, users.studioId))
          .where(and(eq(users.isDemo, true), eq(studios.is_demo, true), eq(users.active, true)))
          .orderBy(asc(studios.kind), asc(studios.name), asc(users.name))
      : [];
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
      {error && <Notice tone="error">{error}</Notice>}
      <DemoPanel loaded={state.loaded} owner={owner} />
      {people.length > 0 && (
        <section aria-labelledby="ver-como">
          <SectionTitle id="ver-como">Ver como…</SectionTitle>
          <p className="mb-3 text-ui text-muted">Entrá a la app con la sesión real de un usuario de la demo, sin contraseña ni segundo factor. Vale 2 horas, se ve una franja arriba todo el tiempo y volvés a tu usuario con un clic. Queda en la auditoría.</p>
          <List label="Usuarios de la demo">
            {people.map((u) => (
              <ListRow
                key={u.id}
                title={u.name}
                detail={`${ROLE[u.role] ?? u.role} · ${u.studio} (${KIND[u.kind]}) · ${u.email}`}
                aside={
                  <form action={viewAsAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <Button type="submit" variant="outline" size="sm">
                      <Eye aria-hidden /> Ver como
                    </Button>
                  </form>
                }
              />
            ))}
          </List>
        </section>
      )}
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
