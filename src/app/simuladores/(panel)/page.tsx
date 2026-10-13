import type { Metadata } from "next";
import Link from "next/link";
import { Database, FlaskConical, Landmark, Mail, ScrollText, ShoppingBag, Wallet } from "lucide-react";
import { arcaSimAction, connectSimAction, otherSideSimAction, storeSaleAction } from "@/app/simuladores/actions";
import { Feedback } from "@/components/app/Feedback";
import { EmptyState, List, ListRow, Panel, SubmitButton, Tag, ToneBadge, fieldClass } from "@/components/ds";
import { requireTenant } from "@/lib/auth";
import { formatAmount, formatDate } from "@/lib/format";
import { formatCuit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MODES, SERVICES, type Service } from "@/modules/simuladores/core";
import { panelData } from "@/modules/simuladores/panel";

export const metadata: Metadata = { title: "Panel" };

const TONE = { real: "neutral", prueba: "info", simulador: "gold" } as const;
const PREF_STATUS: Record<string, string> = { pendiente: "Esperando el pago", pagado: "Pagado", rechazado: "Rechazado", pending: "Esperando la adhesión", authorized: "Adherida", cancelled: "Cancelada" };

/** Panel de simuladores del espacio de la sesión */
export default async function SimuladoresPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireTenant();
  const sp = await searchParams;
  const d = await panelData(me.studioId);
  const on = (k: Service) => d.modes[k] === "simulador";
  const any = (Object.keys(SERVICES) as Service[]).some(on);
  const Off = ({ k }: { k: Service }) => <p className="text-ui text-muted">{SERVICES[k].label} está en modo {MODES[d.modes[k]]}: este simulador no se usa.</p>;
  const mails = d.events.filter((e) => e.service === "mail");

  return (
    <div className="grid gap-5">
      <Feedback sp={sp} />
      {!any && <EmptyState icon={FlaskConical} title="Ningún servicio está en modo Simulador" text="Los modos los cambia el equipo de Faro (Faro Manager → Plataforma → Integraciones). En la demo, todo arranca en Simulador." />}

      <Panel title="Modo de cada servicio" icon={Database}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(SERVICES) as Service[]).map((k) => (
            <li key={k} className="flex items-center justify-between gap-3 text-ui">
              <span className="min-w-0 truncate">{SERVICES[k].label}</span>
              <ToneBadge tone={TONE[d.modes[k]]}>{MODES[d.modes[k]]}</ToneBadge>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="ARCA" icon={Landmark} action={on("arca") ? <ToneBadge tone={d.outage ? "danger" : "ok"}>{d.outage ? "Caído" : "Funcionando"}</ToneBadge> : undefined}>
        {!on("arca") ? (
          <Off k="arca" />
        ) : (
          <div className="grid gap-3">
            <p className="text-ui text-muted">ARCA simulado autoriza con CAE que empiezan con 7, valida la numeración, los totales y las letras, y responde el padrón con cualquier CUIT. Para probar la cola: tiralo, emití (queda pendiente) y volvelo a levantar.</p>
            <p className="text-meta text-muted">CUIT del espacio: {d.cuits.length ? `${d.cuits.slice(0, 4).map((c) => formatCuit(c)).join(" · ")}${d.cuits.length > 4 ? ` y ${d.cuits.length - 4} más` : ""}` : "todavía ninguna"}</p>
            <div className="flex flex-wrap gap-2">
              {(d.outage ? [["vuelta", "Volver a levantar ARCA"]] : [["caida", "Tirar ARCA"]]).concat([["corte", "Cortar la próxima respuesta"]]).map(([op, label]) => (
                <form key={op} action={arcaSimAction}>
                  <input type="hidden" name="op" value={op} />
                  <SubmitButton variant={op === "caida" ? "primary" : "secondary"}>{label}</SubmitButton>
                </form>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Mercado Pago" icon={Wallet}>
        {!on("mercadopago") ? (
          <Off k="mercadopago" />
        ) : d.prefs.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin links de pago todavía" text="Cuando Faro arme un link de cobro (honorarios, una factura o una suscripción), aparece acá para pagarlo o rechazarlo." />
        ) : (
          <List label="Links de pago simulados">
            {d.prefs.slice(0, 15).map((p) => (
              <ListRow key={p.id} title={p.title} detail={`${PREF_STATUS[p.status] ?? p.status} · ${formatDate(p.updated, "shortTime")}`} aside={<span className="flex items-center gap-3"><span className="num">{formatAmount(p.amount)}</span><Link href={`/simuladores/mercadopago/${p.id}`} className="text-ui underline underline-offset-4">Abrir</Link></span>} />
            ))}
          </List>
        )}
      </Panel>

      <Panel title="Tiendas online" icon={ShoppingBag}>
        <div id="tiendas" />
        {!on("tiendas") ? (
          <Off k="tiendas" />
        ) : d.stores.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="Sin tiendas conectadas" text="Conectá una tienda desde Stock de una organización (cualquier plataforma): en modo Simulador usa la tienda simulada, con 4 publicaciones de ejemplo." />
        ) : (
          <form action={storeSaleAction} className="grid gap-3 sm:grid-cols-2">
            <label className="text-meta text-muted">
              Tienda
              <select name="store" className={cn(fieldClass, "mt-1")}>
                {d.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.platform})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted">
              Qué pasa
              <select name="status" className={cn(fieldClass, "mt-1")}>
                <option value="paid">Una venta pagada</option>
                <option value="refunded">Una devolución (con el número de pedido)</option>
                <option value="cancelled">Una cancelación (con el número de pedido)</option>
              </select>
            </label>
            <label className="text-meta text-muted">
              Cantidad
              <input name="qty" inputMode="numeric" defaultValue="1" className={cn(fieldClass, "num mt-1")} />
            </label>
            <label className="text-meta text-muted">
              Precio unitario final
              <input name="price" inputMode="decimal" defaultValue="12100" className={cn(fieldClass, "num mt-1")} />
            </label>
            <label className="text-meta text-muted">
              DNI o CUIT del comprador (opcional)
              <input name="doc" inputMode="numeric" className={cn(fieldClass, "mt-1")} />
            </label>
            <label className="text-meta text-muted">
              Número de pedido (para devolver uno)
              <input name="order" placeholder="SIM-…" className={cn(fieldClass, "mt-1")} />
            </label>
            <input type="hidden" name="buyer" value="Comprador de prueba" />
            <div className="sm:col-span-2">
              <SubmitButton>Mandar a Faro</SubmitButton>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="Xubio, Contabilium y Tango" icon={Database}>
        <div id="sistemas" className="grid gap-4">
          {(["xubio", "contabilium", "tango"] as const).map((k) => {
            const connected = k === "tango" ? d.tango?.startsWith("sim://") : d.simulated.some((c) => c.connector === k);
            return (
              <div key={k} className="flex flex-wrap items-center justify-between gap-3 text-ui">
                <span>
                  {k === "xubio" ? "Xubio" : k === "contabilium" ? "Contabilium" : "Tango"} · <span className="text-muted">{on(k) ? (connected ? "conectado al simulador" : "sin conectar") : `modo ${MODES[d.modes[k]]}`}</span>
                </span>
                {on(k) && !connected && (me.role === "dueno" || me.role === "titular") && (
                  <form action={connectSimAction}>
                    <input type="hidden" name="connector" value={k} />
                    <SubmitButton variant="secondary">Conectar el simulado</SubmitButton>
                  </form>
                )}
              </div>
            );
          })}
          {(on("xubio") || on("contabilium") || on("tango")) && (
            <form action={otherSideSimAction} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <p className="text-ui text-muted sm:col-span-2">«El otro lado»: alguien carga o cambia algo directo en el sistema. Faro lo ve en la próxima sincronización y, si choca con lo que hay en Faro, lo deja como conflicto sin pisar nada.</p>
              <label className="text-meta text-muted">
                Sistema
                <select name="service" className={cn(fieldClass, "mt-1")}>
                  {(["xubio", "contabilium", "tango"] as const).filter(on).map((k) => (
                    <option key={k} value={k}>
                      {k === "xubio" ? "Xubio" : k === "contabilium" ? "Contabilium" : "Tango"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-meta text-muted">
                Qué pasa
                <select name="kind" className={cn(fieldClass, "mt-1")}>
                  <option value="venta">Una venta nueva</option>
                  <option value="compra">Una compra nueva (Xubio y Contabilium)</option>
                  <option value="cliente">Un cliente nuevo (Xubio y Contabilium)</option>
                  <option value="modificar_cliente">Cambian el nombre de un cliente (Contabilium)</option>
                  <option value="modificar">Cambian el último comprobante (Tango)</option>
                  <option value="fallar">Las 2 próximas escrituras fallan (Tango)</option>
                </select>
              </label>
              <label className="text-meta text-muted">
                Nombre o razón social
                <input name="name" defaultValue="Cliente de prueba SRL" className={cn(fieldClass, "mt-1")} />
              </label>
              <label className="text-meta text-muted">
                CUIT
                <input name="cuit" inputMode="numeric" defaultValue="30712345678" className={cn(fieldClass, "mt-1")} />
              </label>
              <label className="text-meta text-muted">
                Importe final
                <input name="amount" inputMode="decimal" defaultValue="121000" className={cn(fieldClass, "num mt-1")} />
              </label>
              <div className="self-end">
                <SubmitButton>Cargar del otro lado</SubmitButton>
              </div>
            </form>
          )}
        </div>
      </Panel>

      <Panel title="Banco" icon={Landmark}>
        {!on("banco") ? (
          <Off k="banco" />
        ) : (
          <div className="grid gap-3">
            <p className="text-ui text-muted">Un extracto en CSV con los cobros de las facturas autorizadas de la organización (uno de cada cuatro con centavos de diferencia), comisiones e impuesto al débito y al crédito. Importalo en la conciliación bancaria de la organización.</p>
            {d.orgs.length === 0 ? (
              <p className="text-ui text-muted">Este espacio no tiene organizaciones.</p>
            ) : (
              <form action="/api/simuladores/extracto" method="get" className="flex flex-wrap items-end gap-2">
                <label className="w-full min-w-0 text-meta text-muted sm:w-auto">
                  Organización
                  <select name="org" className={cn(fieldClass, "mt-1 w-full sm:w-auto")}>
                    {d.orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton variant="secondary">Bajar el extracto</SubmitButton>
              </form>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Mails que hubieran salido" icon={Mail}>
        {mails.length === 0 ? (
          <p className="text-ui text-muted">Ninguno todavía. En la demo (y mientras falte el SMTP) los mails no salen: quedan acá.</p>
        ) : (
          <List label="Mails simulados">
            {mails.slice(0, 15).map((e) => (
              <ListRow key={e.id} title={e.summary} detail={formatDate(e.created_at, "shortTime")} />
            ))}
          </List>
        )}
      </Panel>

      <Panel title="Bitácora de los simuladores" icon={ScrollText}>
        {d.events.length === 0 ? (
          <p className="text-ui text-muted">Todavía no pasó nada en los simuladores de este espacio.</p>
        ) : (
          <List label="Bitácora">
            {d.events.slice(0, 30).map((e) => (
              <ListRow key={e.id} title={e.summary} detail={formatDate(e.created_at, "shortTime")} aside={<Tag>{e.service}</Tag>} />
            ))}
          </List>
        )}
      </Panel>
    </div>
  );
}
