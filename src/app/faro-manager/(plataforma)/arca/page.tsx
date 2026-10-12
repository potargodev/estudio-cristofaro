import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/facturacion/views";
import { requireFaro } from "@/lib/auth";
import { ARCA_ENVS, arcaUrls, formatCuit, usingMock, type ArcaEnv } from "@/modules/arca/config";
import { activeEnv, credentialSummary } from "@/modules/arca/credentials";
import { deleteArcaCredentialAction, saveArcaCredentialAction, setArcaEnvAction, testArcaAction } from "../../arca-actions";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "ARCA" };

const field = `mt-1 py-2 ${fieldClass}`;

/** Certificado de la CUIT operadora de Faro por ambiente, ambiente activo y prueba de conexión */
export default async function ArcaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [env, creds] = await Promise.all([activeEnv(), credentialSummary()]);
  return (
    <div className="grid gap-5">
      <PageHeader level={2} title="ARCA" description="Faro factura y consulta el padrón por web services oficiales, con el certificado de su CUIT y la delegación de cada contribuyente." className="mb-0" />
      <Feedback sp={sp} />
      {usingMock() && <p className="rounded-md border border-[#e3cf9f] bg-[#fbf5e6] px-4 py-2.5 text-meta text-[#7a5410]">Las URLs apuntan al simulador (ARCA_*_URL). Nada de lo que se emita tiene validez.</p>}
      <form action={setArcaEnvAction} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface p-4">
        <p className="mr-auto text-body">
          Ambiente activo: <strong>{ARCA_ENVS[env].label}</strong>
        </p>
        {owner && (
          <>
            <select name="environment" defaultValue={env} className="h-(--control-h) rounded-md border border-line bg-surface px-2 text-ui">
              <option value="homologacion">Homologación</option>
              <option value="produccion">Producción</option>
            </select>
            <SubmitButton variant="secondary" confirm="Cambiar el ambiente afecta a todas las cuentas que facturan con Faro. ¿Seguro?" pendingText="…">
              Cambiar
            </SubmitButton>
          </>
        )}
      </form>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["homologacion", "produccion"] as ArcaEnv[]).map((e) => {
          const c = creds.find((x) => x.environment === e);
          const urls = arcaUrls(e);
          return (
            <section key={e} className="grid content-start gap-3 rounded-md border border-line bg-surface p-4" aria-labelledby={`env-${e}`}>
              <h3 id={`env-${e}`} className="text-lead font-semibold">
                {ARCA_ENVS[e].label}
              </h3>
              {c ? (
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-ui">
                  <dt className="text-muted">CUIT operadora</dt>
                  <dd className="num">{formatCuit(c.cuit)}</dd>
                  <dt className="text-muted">Certificado</dt>
                  <dd>{c.subject}</dd>
                  <dt className="text-muted">Vence</dt>
                  <dd className={c.notAfter && c.notAfter.getTime() - Date.now() < 30 * 86400000 ? "text-danger" : ""}>{formatDate(c.notAfter, "numeric")}</dd>
                  <dt className="text-muted">Última prueba</dt>
                  <dd className={c.lastTestOk === false ? "text-danger" : c.lastTestOk ? "text-[#1f5f36]" : ""}>{c.lastTestAt ? `${formatDate(c.lastTestAt, "numericTime")} · ${c.lastTestDetail}` : "Sin probar"}</dd>
                </dl>
              ) : (
                <p className="text-ui text-muted">Sin certificado cargado.</p>
              )}
              <details className="text-caption text-muted">
                <summary className="cursor-pointer">URLs</summary>
                <p className="mt-1 break-all">WSAA {urls.wsaa}</p>
                <p className="break-all">WSFE {urls.wsfe}</p>
                <p className="break-all">Constancia {urls.padron}</p>
              </details>
              {c && (
                <div className="flex flex-wrap gap-2">
                  <form action={testArcaAction}>
                    <input type="hidden" name="environment" value={e} />
                    <SubmitButton pendingText="Probando…">Probar la conexión</SubmitButton>
                  </form>
                  {owner && (
                    <form action={deleteArcaCredentialAction}>
                      <input type="hidden" name="environment" value={e} />
                      <SubmitButton variant="danger" confirm="¿Eliminar el certificado de este ambiente?" pendingText="…">
                        Eliminar
                      </SubmitButton>
                    </form>
                  )}
                </div>
              )}
              {owner && (
                <details>
                  <summary className="cursor-pointer text-ui font-medium">{c ? "Reemplazar el certificado" : "Cargar el certificado"}</summary>
                  <form action={saveArcaCredentialAction} encType="multipart/form-data" className="mt-3 grid gap-2">
                    <input type="hidden" name="environment" value={e} />
                    <label className="text-meta">
                      CUIT operadora
                      <input name="cuit" required inputMode="numeric" defaultValue={c?.cuit ?? ""} className={field} />
                    </label>
                    <label className="text-meta">
                      Certificado (.crt o .pem)
                      <input name="cert_file" type="file" accept=".crt,.pem,.cer" className="mt-1 block text-meta" />
                    </label>
                    <textarea name="cert" rows={3} placeholder="…o pegá el -----BEGIN CERTIFICATE-----" className={field} />
                    <label className="text-meta">
                      Clave privada (.key)
                      <input name="key_file" type="file" accept=".key,.pem" className="mt-1 block text-meta" />
                    </label>
                    <textarea name="key" rows={3} placeholder="…o pegá el -----BEGIN PRIVATE KEY-----" className={field} />
                    <p className="text-caption text-muted">Se guardan cifrados con ENCRYPTION_KEY y nunca vuelven al navegador. Cómo generarlos: Centro de ayuda → Facturación → Certificado de homologación.</p>
                    <div>
                      <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
                    </div>
                  </form>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
