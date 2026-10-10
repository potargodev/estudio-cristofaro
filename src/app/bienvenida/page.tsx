import { eq } from "drizzle-orm";
import { Building2, Check, FileUp, Handshake, Ship, UserPlus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FaroLogo } from "@/components/admin/kit/FaroLogo";
import { SubmitButton } from "@/components/admin/ui";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { getDb } from "@/db";
import { studios } from "@/db/schema";
import { getCurrentUser, requireTenantOwner } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { FILE_TEMPLATES } from "@/modules/industries/catalog";
import { saveWelcomeData, saveWelcomeIndustries } from "./actions";

export const metadata: Metadata = { title: "Bienvenida · Faro", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const field = "mt-1.5 h-11 w-full rounded-md border border-line bg-surface px-3 text-[15px] text-ink focus:border-navy focus:outline-none";
const label = "text-[13px] font-medium text-muted";

/**
 * Asistente de bienvenida del dueño de la cuenta: datos, rubros y por dónde
 * seguir. Estudio y autónomo hacen los tres pasos; la persona elige qué quiere
 * hacer primero. Después, la guía de primeros pasos sigue en la app.
 */
export default async function BienvenidaPage({ searchParams }: { searchParams: Promise<{ paso?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  if (user.role !== "dueno" && user.role !== "titular") redirect(homeFor(user.role));
  if (user.role === "dueno" && !user.twoFactorEnabled) redirect("/admin/seguridad");
  const me = await requireTenantOwner();
  const [t] = await getDb().select().from(studios).where(eq(studios.id, me.studioId));
  if (!t) redirect("/");
  const kind = t.kind;
  const steps = kind === "persona" ? ["Qué querés hacer", "Listo"] : ["Tus datos", kind === "studio" ? "Rubros que atendés" : "Tu actividad", "Por dónde seguir"];
  let paso = Math.min(steps.length, Math.max(1, Number(sp.paso) || 1));
  if (kind === "persona") paso = Number(sp.paso) >= 3 ? 2 : 1;
  const home = kind === "studio" ? "/admin" : "/personal";
  const first = me.name.split(" ")[0];
  const finalStep = paso === steps.length;

  return (
    <div className="app-ui min-h-dvh bg-canvas text-ink">
      <header className="keep-dark bg-night text-paper">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <FaroLogo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-paper/75 hover:text-paper" />
            <Link href={home} className="text-[13px] text-paper/75 underline-offset-4 hover:underline">
              Saltear por ahora
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-rose-deep">Bienvenida</p>
        <h1 className="mt-2 font-display text-[36px] leading-tight sm:text-[48px]">Hola, {first}.</h1>
        <p className="mt-2 max-w-xl text-[16px] text-muted">
          {kind === "studio" ? "Dejemos el estudio listo en tres pasos. Lo podés cambiar después." : kind === "personal" ? "Tres pasos y tu panel queda armado con tu CUIT y tu actividad." : "Contanos qué querés hacer primero y te llevamos ahí."}
        </p>

        <ol className="mt-8 flex flex-wrap gap-2" aria-label="Pasos">
          {steps.map((s, i) => (
            <li key={s} aria-current={i + 1 === paso ? "step" : undefined} className={cn("flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px]", i + 1 === paso ? "border-navy bg-navy text-paper" : i + 1 < paso ? "border-line bg-surface text-ink" : "border-line text-muted")}>
              <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", i + 1 < paso ? "bg-navy text-gold" : "border border-current")}>{i + 1 < paso ? <Check className="size-3" aria-hidden /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        {sp.error && (
          <p role="alert" className="mt-6 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-[14px] text-danger">
            {sp.error}
          </p>
        )}

        <section className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-7">
          {kind !== "persona" && paso === 1 && (
            <form action={saveWelcomeData} className="grid gap-4 sm:grid-cols-2">
              <label className={cn(label, "sm:col-span-2")}>
                {kind === "studio" ? "Nombre del estudio" : "Tu nombre (como querés que aparezca)"}
                <input name="name" defaultValue={t.name} required maxLength={120} className={field} />
              </label>
              {kind === "studio" && (
                <label className={cn(label, "sm:col-span-2")}>
                  Razón social
                  <input name="legal_name" defaultValue={t.legal_name ?? ""} maxLength={160} className={field} />
                </label>
              )}
              <label className={label}>
                CUIT{kind === "studio" && " (opcional)"}
                <input name="cuit" defaultValue={t.cuit ?? ""} required={kind === "personal"} inputMode="numeric" placeholder="20-12345678-9" className={field} />
              </label>
              <label className={label}>
                Condición fiscal
                <select name="tax_regime" defaultValue={t.tax_regime ?? (kind === "personal" ? "monotributo" : "responsable_inscripto")} className={field}>
                  <option value="monotributo">Monotributo</option>
                  <option value="responsable_inscripto">Responsable inscripto</option>
                  <option value="exento">Exento</option>
                </select>
              </label>
              <label className={cn(label, "sm:col-span-2")}>
                Domicilio fiscal (opcional)
                <input name="fiscal_address" defaultValue={t.fiscal_address ?? ""} maxLength={200} className={field} />
              </label>
              <div className="sm:col-span-2">
                <SubmitButton pendingText="Guardando…">Seguir</SubmitButton>
              </div>
            </form>
          )}

          {kind !== "persona" && paso === 2 && (
            <form action={saveWelcomeIndustries}>
              <fieldset>
                <legend className="text-[17px] font-semibold">{kind === "studio" ? "¿Con qué rubros trabajás?" : "¿En qué rubro trabajás?"}</legend>
                <p className="mt-1 text-[14px] text-muted">
                  {kind === "studio" ? "Elegí los que quieras. Al crear una organización, Faro te propone las obligaciones y documentos típicos de su rubro." : "Con eso te mostramos las obligaciones y los gastos típicos de tu actividad."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {FILE_TEMPLATES.map((x) => (
                    <label key={x.clave} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 has-[:checked]:border-navy has-[:checked]:bg-navy-soft">
                      <input type={kind === "studio" ? "checkbox" : "radio"} name="industries" value={x.clave} defaultChecked={t.industries.includes(x.clave)} className="mt-0.5 size-4 accent-navy" />
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium">{x.nombre}</span>
                        <span className="block text-[12px] text-muted">{x.descripcion}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <SubmitButton pendingText="Guardando…">Seguir</SubmitButton>
                <Link href="/bienvenida?paso=1" className="text-[14px] text-muted underline-offset-4 hover:underline">
                  Volver
                </Link>
              </div>
            </form>
          )}

          {kind === "persona" && paso === 1 && (
            <form action={saveWelcomeIndustries}>
              <fieldset>
                <legend className="text-[17px] font-semibold">¿Qué querés hacer primero?</legend>
                <div className="mt-4 grid gap-2">
                  {[
                    { v: "grupos", icon: Wallet, t: "Dividir gastos", d: "Un viaje, la casa, la oficina: cada uno ve cuánto debe." },
                    { v: "red", icon: Handshake, t: "Encontrar un contador", d: "Compará estudios verificados de la Red, con reseñas de clientes reales." },
                    { v: "flotas", icon: Ship, t: "Armar una Flota", d: "Con 3 a 20 personas, pidan juntos una propuesta a un estudio. Cada uno paga lo suyo." },
                  ].map((o, i) => (
                    <label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-4 has-[:checked]:border-navy has-[:checked]:bg-navy-soft">
                      <input type="radio" name="goal" value={o.v} defaultChecked={i === 0} className="mt-1 size-4 accent-navy" />
                      <o.icon className="mt-0.5 size-5 shrink-0 text-rose-deep" strokeWidth={1.5} aria-hidden />
                      <span>
                        <span className="block text-[15px] font-medium">{o.t}</span>
                        <span className="block text-[13px] text-muted">{o.d}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="mt-5">
                <SubmitButton pendingText="Guardando…">Seguir</SubmitButton>
              </div>
            </form>
          )}

          {finalStep && (
            <div>
              <h2 className="text-[20px] font-semibold">¡Listo! ¿Por dónde seguís?</h2>
              <p className="mt-1 text-[14px] text-muted">Tus primeros pasos quedan en el botón «Guía», arriba, y se marcan solos a medida que los hacés.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {(kind === "studio"
                  ? [
                      { href: "/admin/organizaciones/nueva", icon: Building2, t: "Crear la primera organización", d: "Con su rubro y sus CUIT." },
                      { href: "/admin/conexiones", icon: FileUp, t: "Importar clientes", d: "Desde Tango o desde un archivo." },
                      { href: "/admin/usuarios", icon: UserPlus, t: "Invitar a tu equipo", d: "Contadores y colaboradores." },
                    ]
                  : kind === "personal"
                    ? [
                        { href: "/personal", icon: Building2, t: "Ir a mi panel", d: "Tu CUIT, tus gastos y lo que viene." },
                        { href: "/grupos/nuevo", icon: Wallet, t: "Crear un grupo de gastos", d: "Con socios o clientes." },
                        { href: "/red", icon: Handshake, t: "Buscar un contador", d: "En la Red de estudios." },
                      ]
                    : [
                        { href: "/grupos/nuevo", icon: Wallet, t: "Crear un grupo de gastos", d: "Y sumar a quien quieras." },
                        { href: "/red", icon: Handshake, t: "Buscar un contador", d: "Estudios verificados, ranking neutral." },
                        { href: "/flotas", icon: Ship, t: "Armar una Flota", d: "Pidan una propuesta juntos." },
                      ]
                ).map((o) => (
                  <Link key={o.href} href={o.href} className="group rounded-md border border-line p-4 transition-colors hover:border-navy">
                    <span className="grid size-10 place-items-center rounded-md bg-navy text-gold">
                      <o.icon className="size-5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span className="mt-3 block text-[15px] font-medium group-hover:underline">{o.t}</span>
                    <span className="block text-[13px] text-muted">{o.d}</span>
                  </Link>
                ))}
              </div>
              <Link href={home} className="mt-6 inline-block text-[14px] font-medium underline-offset-4 hover:underline">
                Ir al inicio
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
