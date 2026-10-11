import { MessageCircle, Palette } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge, Tag } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { SectionTabs } from "@/components/app/SectionTabs";
import { Feedback } from "@/components/app/Feedback";
import { WaCredentialFields } from "@/components/whatsapp/AccountForm";
import { domainAction, logoAction, saveBrandingAction, verifyDomainAction, waAccountAction, waPauseAction, waSyncAction } from "@/app/admin/avanzado-actions";
import { requireAdmin } from "@/lib/auth";
import { getSiteUrl } from "@/lib/runtime-config";
import { getBranding, whiteLabelEnabled } from "@/modules/white-label/server";
import { txtName } from "@/modules/white-label/core";
import { platformAccount, recentMessages, studioRow, templatesOf } from "@/modules/whatsapp/server";
import { hasModule } from "@/lib/faro/entitlements";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Avanzado" };

const field = `mt-1 ${fieldClass}`;
const when = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

function Locked({ what }: { what: string }) {
  return (
    <p className="rounded-md border border-line bg-surface p-4 text-ui text-muted">
      {what} viene con el plan Avanzado.{" "}
      <Link href="/admin/configuracion/plan" className="underline underline-offset-4">
        Ver planes
      </Link>
    </p>
  );
}

async function Marca({ studioId }: { studioId: string }) {
  if (!(await whiteLabelEnabled(studioId))) return <Locked what="La marca blanca" />;
  const b = await getBranding(studioId);
  const appHost = new URL(getSiteUrl()).host;
  return (
    <div className="grid gap-5">
      <Panel title="Marca del portal" icon={Palette}>
        <form action={saveBrandingAction} className="grid gap-4">
          <label className="flex items-center gap-2 text-ui">
            <input type="checkbox" name="enabled" defaultChecked={b?.enabled ?? false} /> Usar la marca del estudio en el portal de mis clientes
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-meta text-muted">
              Nombre que ven los clientes
              <input name="display_name" defaultValue={b?.display_name ?? ""} maxLength={80} placeholder="Como figura tu estudio" className={field} />
            </label>
            <label className="text-meta text-muted">
              Color principal (barra lateral)
              <input name="primary" type="color" defaultValue={b?.primary_color ?? "#0f1320"} className={`${field} p-1`} />
            </label>
            <label className="text-meta text-muted">
              Color de acento
              <input name="accent" type="color" defaultValue={b?.accent_color ?? "#c9a596"} className={`${field} p-1`} />
            </label>
          </div>
          <p className="text-meta text-muted">El portal siempre muestra «Con tecnología de Faro». Revisamos que el texto se lea sobre los colores que elijas.</p>
          <div>
            <SubmitButton>Guardar marca</SubmitButton>
          </div>
        </form>
      </Panel>
      <Panel title="Logo">
        <div className="flex flex-wrap items-center gap-4">
          {b?.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/marca/${studioId}/logo?v=${b.updated_at.getTime()}`} alt="Logo actual" className="h-14 w-auto rounded-md bg-night p-2" />
          ) : (
            <span className="text-ui text-muted">Sin logo: se muestra el sello.</span>
          )}
          <form action={logoAction} className="flex flex-wrap items-end gap-2">
            <label className="text-meta text-muted">
              PNG o JPG, hasta 1 MB (mejor horizontal y con fondo transparente)
              <input name="logo" type="file" accept=".png,.jpg,.jpeg" className="mt-1 block text-ui" />
            </label>
            <SubmitButton variant="secondary" pendingText="Subiendo…">Subir logo</SubmitButton>
          </form>
          {b?.logo_path && (
            <form action={logoAction}>
              <input type="hidden" name="op" value="quitar" />
              <SubmitButton variant="danger" pendingText="…">Quitar</SubmitButton>
            </form>
          )}
        </div>
      </Panel>
      <Panel title="Dominio propio" action={b?.custom_domain ? <StatusBadge status={b.domain_status === "verificado" ? "activa" : "pendiente"} label={b.domain_status === "verificado" ? "Verificado" : "Falta verificar"} /> : undefined}>
        <form action={domainAction} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-meta text-muted">
            Dominio para el portal de tus clientes
            <input name="domain" defaultValue={b?.custom_domain ?? ""} placeholder="portal.tuestudio.com.ar" className={field} />
          </label>
          <SubmitButton variant="secondary">{b?.custom_domain ? "Cambiar" : "Cargar dominio"}</SubmitButton>
        </form>
        {b?.custom_domain && b.domain_token && (
          <div className="mt-4 grid gap-2 text-ui">
            <p>Creá estos dos registros en el DNS de tu dominio:</p>
            <dl className="grid gap-1 rounded-md border border-line bg-canvas p-3 font-mono text-caption">
              <dt className="text-muted">CNAME</dt>
              <dd className="break-all">
                {b.custom_domain} → {appHost}
              </dd>
              <dt className="mt-2 text-muted">TXT</dt>
              <dd className="break-all">
                {txtName(b.custom_domain)} = {b.domain_token}
              </dd>
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <form action={verifyDomainAction}>
                <SubmitButton pendingText="Verificando…">Verificar</SubmitButton>
              </form>
              {b.domain_checked_at && <span className="text-meta text-muted">Último intento: {when.format(b.domain_checked_at)}</span>}
            </div>
            <p className="text-meta text-muted">Con el dominio verificado, el equipo de Faro activa el certificado seguro (HTTPS) y tus clientes entran al portal desde tu dirección.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

async function WhatsApp({ studioId }: { studioId: string }) {
  if (!(await hasModule(studioId, "whatsapp"))) return <Locked what="WhatsApp" />;
  const [row, faro, msgs] = await Promise.all([studioRow(studioId), platformAccount(), recentMessages(studioId, 15)]);
  const account = row?.mode === "propio" ? row : faro;
  const templates = account ? await templatesOf(account.id) : [];
  const webhook = `${getSiteUrl()}/api/whatsapp/webhook`;
  return (
    <div className="grid gap-5">
      <Panel title="Número de WhatsApp" icon={MessageCircle} action={row ? <StatusBadge status={row.status === "activa" ? "activa" : "pausada"} label={row.status === "activa" ? "Activo" : "Pausado"} /> : <Tag>Sin activar</Tag>}>
        <form action={waAccountAction} className="grid gap-4">
          <fieldset className="grid gap-2 text-ui">
            <legend className="mb-1 text-meta text-muted">¿Desde qué número salen los avisos?</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" value="compartido" defaultChecked={row?.mode !== "propio"} className="mt-1" />
              <span>
                Número de Faro {faro?.display_phone ? `(${faro.display_phone})` : ""} <span className="block text-meta text-muted">Listo para usar. Los mensajes llevan el nombre de tu estudio.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" value="propio" defaultChecked={row?.mode === "propio"} className="mt-1" />
              <span>
                Número propio del estudio <span className="block text-meta text-muted">Necesitás una cuenta de WhatsApp Business verificada por Meta.</span>
              </span>
            </label>
          </fieldset>
          <details open={row?.mode === "propio"} className="rounded-md border border-line p-3">
            <summary className="cursor-pointer text-ui font-medium">Datos del número propio</summary>
            <div className="mt-3 grid gap-3">
              <WaCredentialFields a={row?.mode === "propio" ? row : null} />
              <p className="text-meta text-muted">
                En Meta, configurá el webhook con la URL <span className="break-all font-mono text-caption text-ink">{webhook}</span>
                {row?.verify_token ? (
                  <>
                    {" "}y el token de verificación <span className="font-mono text-caption text-ink">{row.verify_token}</span>
                  </>
                ) : (
                  " (el token de verificación aparece al guardar)"
                )}
                , suscripto a «messages».
              </p>
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>{row ? "Guardar" : "Activar WhatsApp"}</SubmitButton>
          </div>
        </form>
        {row && (
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={waPauseAction}>
              <SubmitButton variant="secondary" pendingText="…">{row.status === "activa" ? "Pausar avisos" : "Reanudar avisos"}</SubmitButton>
            </form>
            {row.mode === "propio" && (
              <form action={waSyncAction}>
                <SubmitButton variant="secondary" pendingText="Sincronizando…">Sincronizar plantillas</SubmitButton>
              </form>
            )}
          </div>
        )}
        {account?.last_error && <p className="mt-3 text-meta text-[#8f2a1c]">Último error de WhatsApp: {account.last_error}</p>}
      </Panel>
      <Panel title="Plantillas aprobadas" bodyClassName="p-0">
        {templates.length === 0 ? (
          <p className="p-4 text-ui text-muted">{account ? "Todavía no hay plantillas sincronizadas." : "Activá WhatsApp para ver las plantillas."}</p>
        ) : (
          <ul className="divide-y divide-line text-ui">
            {templates.map((t) => (
              <li key={t.id} className="grid gap-1 px-4 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-meta">{t.name}</span>
                  <StatusBadge status={t.status === "APPROVED" ? "activa" : t.status === "REJECTED" ? "vencido" : "pendiente"} label={t.status === "APPROVED" ? "Aprobada" : t.status === "REJECTED" ? "Rechazada" : "En revisión de Meta"} />
                  {t.category && <Tag>{t.category.toLowerCase()}</Tag>}
                </span>
                <span className="text-muted">{t.body}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Últimos mensajes" bodyClassName="p-0">
        {msgs.length === 0 ? (
          <p className="p-4 text-ui text-muted">Todavía no salió ni entró ningún mensaje. Tus clientes verifican su número desde el portal (Mi cuenta → WhatsApp).</p>
        ) : (
          <ul className="divide-y divide-line text-meta">
            {msgs.map(({ m, org }) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="min-w-0">
                  {m.direction === "entrante" ? "← " : "→ "}
                  {org ?? "Sin organización"} · {m.template ?? m.kind} {m.body ? `· ${m.body.slice(0, 80)}` : ""}
                </span>
                <span className={m.status === "fallido" || m.status === "sin_contacto" ? "text-[#8f2a1c]" : "text-muted"}>
                  {m.status.replace("_", " ")} · {when.format(m.created_at)}
                  {m.error ? ` · ${m.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** Configuración → Avanzado: marca blanca y WhatsApp (plan Avanzado) */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const tab = sp.tab === "whatsapp" ? "whatsapp" : "marca";
  return (
    <div className="grid gap-4">
      <SectionTabs
        label="Opciones avanzadas"
        tabs={[
          { href: "/admin/configuracion/avanzado", label: "Marca blanca", icon: <Palette strokeWidth={1.5} aria-hidden />, active: tab === "marca" },
          { href: "/admin/configuracion/avanzado?tab=whatsapp", label: "WhatsApp", icon: <MessageCircle strokeWidth={1.5} aria-hidden />, active: tab === "whatsapp" },
        ]}
      />
      <Feedback sp={sp} />
      {tab === "marca" ? <Marca studioId={me.studioId} /> : <WhatsApp studioId={me.studioId} />}
    </div>
  );
}
