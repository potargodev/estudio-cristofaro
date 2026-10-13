import { AlertTriangle, Boxes, Download, PackageSearch, Store, Wallet } from "lucide-react";
import Link from "next/link";
import { adjustAction, conflictAction, connectStoreAction, countAction, depositAction, importProductsAction, linkListingAction, productAction, purchaseLinkAction, storeAction, unlinkedAction } from "@/app/stock-actions";
import { Feedback } from "@/components/app/Feedback";
import { Card, EmptyState, MetricCard, SubmitButton, Table, ToneBadge, ViewSwitch, chipClass } from "@/components/ds";
import { fieldClass } from "@/components/ds/primitives";
import { formatDate, formatMoney, todayAR } from "@/lib/format";
import { getSiteUrl } from "@/lib/runtime-config";
import { PLATFORMS } from "@/modules/stock/platforms";
import { MOVE_LABEL } from "@/modules/stock/core";
import type { ResolvedStock } from "@/modules/stock/scope";
import { cmvOf, deposits, inventory, listMovements, listProducts, listStores, listUnlinked, stockEnabled, storeView, unlinkedPurchases } from "@/modules/stock/server";
import { Scanner } from "./Scanner";

// Stock simple (§2.q etapa 7): la misma pantalla en la ficha de la
// organización (el estudio), en el portal (Empresa → Stock) y para el
// autónomo (Facturación → Stock). Faro es la fuente de verdad: las compras
// leídas suman, lo facturado y las ventas de tiendas restan, y la existencia
// se publica en las tiendas solo si se activa, sin pisar diferencias.

type SP = Record<string, string | undefined>;
const field = `mt-1 ${fieldClass}`;
const lbl = "text-meta text-muted";
const qtyFmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
const pesos = (n: number) => formatMoney(Math.round(n * 100));

function Hidden({ r }: { r: ResolvedStock }) {
  return (
    <>
      <input type="hidden" name="ambito" value={r.ambito} />
      <input type="hidden" name="org" value={r.ambito === "estudio" ? r.scope.organizationId : ""} />
    </>
  );
}

const VIEWS = [
  ["productos", "Productos"],
  ["movimientos", "Movimientos"],
  ["conteo", "Conteo"],
  ["tiendas", "Tiendas"],
  ["sin-vincular", "Sin vincular"],
  ["inventario", "Inventario"],
] as const;

export async function StockScreen({ r, sp }: { r: ResolvedStock; sp: SP }) {
  if (!(await stockEnabled(r.scope.studioId, r.scope.organizationId)))
    return (
      <EmptyState
        icon={Boxes}
        title="Stock no está activo"
        text={r.ambito === "estudio" ? "Activalo para esta organización en Resumen → Plan y módulos (viene con los planes Profesional y Avanzado)." : r.ambito === "personal" ? "Stock viene con Autónomos Pro." : "Pedile al estudio que lo active para tu empresa."}
        action={r.ambito === "estudio" ? { href: `/admin/organizaciones/${r.scope.organizationId}?tab=plan`, label: "Ir a Plan y módulos" } : undefined}
      />
    );
  const ver = VIEWS.some(([k]) => k === sp.ver) ? sp.ver! : "productos";
  const [unlinked, stores] = await Promise.all([listUnlinked(r.scope), listStores(r.scope)]);
  const href = (k: string) => `${r.base}${r.sep}ver=${k}`;
  return (
    <div className="grid gap-6">
      <Feedback sp={sp} />
      <ViewSwitch label="Stock" views={VIEWS.map(([k, label]) => ({ href: href(k), label, active: ver === k, count: k === "sin-vincular" ? unlinked.length : k === "tiendas" ? stores.length : undefined }))} />
      {ver === "movimientos" ? await Movements({ r }) : ver === "conteo" ? await Count({ r }) : ver === "tiendas" ? await Stores({ r, sp }) : ver === "sin-vincular" ? await Unlinked({ r }) : ver === "inventario" ? await Inventory({ r, sp }) : await Products({ r, sp })}
    </div>
  );
}

async function Products({ r, sp }: { r: ResolvedStock; sp: SP }) {
  const [list, deps] = await Promise.all([listProducts(r.scope, sp.q), deposits(r.scope)]);
  const value = list.reduce((a, x) => a + Math.max(0, x.qty) * x.avgCost, 0);
  const low = list.filter((x) => x.low);
  const edit = sp.editar ? list.find((x) => x.p.id === sp.editar)?.p : null;
  return (
    <>
      <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={Boxes} label="Productos" value={list.length} hint={`${deps.length} ${deps.length === 1 ? "depósito" : "depósitos"}`} />
        <MetricCard icon={Wallet} label="Valor (costo promedio)" value={value} display={pesos(value)} hint="Hoy, según los movimientos" />
        <MetricCard icon={AlertTriangle} label="Debajo del mínimo" value={low.length} hint={low.slice(0, 2).map((x) => x.p.description).join(", ") || "Ninguno"} />
      </section>
      <form className="flex flex-wrap items-end gap-2" action={r.base.split("?")[0]}>
        {r.ambito === "estudio" && <input type="hidden" name="tab" value="stock" />}
        <input type="hidden" name="ver" value="productos" />
        <label className={`${lbl} min-w-0 flex-1`}>
          Buscar
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Código, código de barras o descripción" className={field} />
        </label>
        <button className="h-(--control-h) rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">Buscar</button>
      </form>
      {list.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Todavía no hay productos" text="Cargalos de a uno, importalos de un Excel o CSV, o crealos desde una compra leída (Sin vincular)." />
      ) : (
        <Table label="Productos" minWidth={760}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              {deps.map((d) => (
                <th key={d.id} className="px-3 py-2 text-right font-medium">
                  {d.name}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2 text-right font-medium">Mínimo</th>
              <th className="px-3 py-2 text-right font-medium">Último costo</th>
              <th className="px-3 py-2 text-right font-medium">Precio</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.p.id} className="border-b border-line last:border-0">
                <td className="num whitespace-nowrap px-3 py-2">{x.p.code}</td>
                <td className="min-w-56 px-3 py-2">
                  {r.scope.canManage ? (
                    <Link href={`${r.base}${r.sep}ver=productos&editar=${x.p.id}#producto`} className="underline-offset-4 hover:underline">
                      {x.p.description}
                    </Link>
                  ) : (
                    x.p.description
                  )}
                  {x.low && (
                    <ToneBadge tone="progress" className="ml-2">
                      Bajo mínimo
                    </ToneBadge>
                  )}
                </td>
                {deps.map((d) => (
                  <td key={d.id} className="num px-3 py-2 text-right">
                    {qtyFmt(x.byDeposit[d.id] ?? 0)}
                  </td>
                ))}
                <td className="num px-3 py-2 text-right font-medium">{qtyFmt(x.qty)}</td>
                <td className="num px-3 py-2 text-right text-muted">{x.p.min_stock == null ? "—" : qtyFmt(Number(x.p.min_stock))}</td>
                <td className="num px-3 py-2 text-right">{pesos(x.lastCost)}</td>
                <td className="num px-3 py-2 text-right">{pesos(Number(x.p.price))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {r.scope.canManage && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="grid gap-4" id="producto">
            <p className="text-title font-semibold text-ink">{edit ? `Editar ${edit.description}` : "Nuevo producto"}</p>
            <form action={productAction} className="grid gap-3 sm:grid-cols-4">
              <Hidden r={r} />
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <label className={lbl}>
                Código
                <input name="code" required defaultValue={edit?.code ?? ""} className={field} />
              </label>
              <label className={lbl}>
                Código de barras
                <input name="barcode" defaultValue={edit?.barcode ?? ""} className={field} />
              </label>
              <label className={`${lbl} sm:col-span-2`}>
                Descripción
                <input name="description" required defaultValue={edit?.description ?? ""} className={field} />
              </label>
              <label className={lbl}>
                Unidad
                <input name="unit" defaultValue={edit?.unit ?? "unidad"} className={field} />
              </label>
              <label className={lbl}>
                Alícuota de IVA
                <select name="iva_rate" defaultValue={edit ? String(Number(edit.iva_rate)) : "21"} className={field}>
                  {["21", "10.5", "27", "5", "2.5", "0"].map((a) => (
                    <option key={a} value={a}>
                      {a.replace(".", ",")} %
                    </option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Costo
                <input name="cost" inputMode="decimal" defaultValue={edit ? String(Number(edit.cost)).replace(".", ",") : ""} className={field} />
              </label>
              <label className={lbl}>
                Precio de venta
                <input name="price" inputMode="decimal" defaultValue={edit ? String(Number(edit.price)).replace(".", ",") : ""} className={field} />
              </label>
              <label className={lbl}>
                Stock mínimo (alerta)
                <input name="min_stock" inputMode="decimal" defaultValue={edit?.min_stock == null ? "" : String(Number(edit.min_stock)).replace(".", ",")} className={field} />
              </label>
              <div className="sm:col-span-4">
                <SubmitButton pendingText="…">{edit ? "Guardar" : "Agregar"}</SubmitButton>
              </div>
            </form>
          </Card>
          <div className="grid content-start gap-3">
            <Card className="grid gap-2">
              <p className="text-title font-semibold text-ink">Importar del Excel o CSV</p>
              <p className="text-meta text-muted">Columnas: código, código de barras, descripción, unidad, alícuota, costo, precio, mínimo y existencia (opcional, como existencia inicial).</p>
              <form action={importProductsAction} className="flex flex-wrap items-end gap-2">
                <Hidden r={r} />
                <input name="file" type="file" accept=".xlsx,.csv,.txt" required className="min-w-0 text-ui" />
                <SubmitButton variant="secondary" pendingText="Importando…">
                  Importar
                </SubmitButton>
              </form>
            </Card>
            {deps.length < 3 && (
              <Card className="grid gap-2">
                <p className="text-title font-semibold text-ink">Depósitos ({deps.length} de 3)</p>
                <form action={depositAction} className="flex flex-wrap items-end gap-2">
                  <Hidden r={r} />
                  <label className={`${lbl} min-w-0 flex-1`}>
                    Nombre
                    <input name="name" required placeholder="Ej.: Local de Palermo" className={field} />
                  </label>
                  <SubmitButton variant="secondary" pendingText="…">
                    Agregar
                  </SubmitButton>
                </form>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

async function Movements({ r }: { r: ResolvedStock }) {
  const [rows, products, deps] = await Promise.all([listMovements(r.scope), listProducts(r.scope), deposits(r.scope)]);
  return (
    <>
      {r.scope.canManage && products.length > 0 && (
        <Card className="grid gap-2">
          <p className="text-title font-semibold text-ink">Ajuste manual</p>
          <form action={adjustAction} className="grid gap-2 sm:grid-cols-5">
            <Hidden r={r} />
            <label className={`${lbl} sm:col-span-2`}>
              Producto
              <select name="product_id" required className={field}>
                {products.map((x) => (
                  <option key={x.p.id} value={x.p.id}>
                    {x.p.code} · {x.p.description}
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Depósito
              <select name="deposit_id" className={field}>
                {deps.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={lbl}>
              Cantidad (+ suma, − resta)
              <input name="qty" inputMode="decimal" required className={field} />
            </label>
            <label className={lbl}>
              Motivo
              <input name="reason" required placeholder="Rotura, muestra, error de carga…" className={field} />
            </label>
            <div>
              <SubmitButton variant="secondary" pendingText="…">
                Registrar ajuste
              </SubmitButton>
            </div>
          </form>
        </Card>
      )}
      {rows.length === 0 ? (
        <p className="text-ui text-muted">Sin movimientos todavía.</p>
      ) : (
        <Table label="Movimientos" minWidth={720}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Producto</th>
              <th className="px-3 py-2 font-medium">Movimiento</th>
              <th className="px-3 py-2 font-medium">Depósito</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="px-3 py-2 text-right font-medium">Costo unitario</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, code, description, deposit }) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2 text-meta text-muted">{formatDate(m.at.toISOString().slice(0, 10), "numeric")}</td>
                <td className="px-3 py-2">
                  <span className="num text-muted">{code}</span> {description}
                </td>
                <td className="px-3 py-2">
                  {MOVE_LABEL[m.kind] ?? m.kind}
                  {m.reason && <span className="text-meta text-muted"> · {m.reason}</span>}
                </td>
                <td className="px-3 py-2">{deposit}</td>
                <td className={`num px-3 py-2 text-right ${Number(m.qty) < 0 ? "text-danger" : ""}`}>{Number(m.qty) > 0 ? "+" : ""}{qtyFmt(Number(m.qty))}</td>
                <td className="num px-3 py-2 text-right text-muted">{m.unit_cost == null ? "—" : pesos(Number(m.unit_cost))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function Count({ r }: { r: ResolvedStock }) {
  const [products, deps] = await Promise.all([listProducts(r.scope), deposits(r.scope)]);
  if (!r.scope.canManage) return <p className="text-ui text-muted">El conteo lo hace quien administra el stock.</p>;
  return (
    <Card className="grid gap-3">
      <p className="text-title font-semibold text-ink">Conteo físico</p>
      <p className="text-ui text-muted">Escaneá cada producto con la cámara del celular (o tipeá el código). Al cerrar, Faro compara lo contado con lo que debería haber y registra las diferencias como ajustes, con la auditoría.</p>
      <form action={countAction} className="grid gap-3">
        <Hidden r={r} />
        <label className={`${lbl} max-w-xs`}>
          Depósito
          <select name="deposit_id" className={field}>
            {deps.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <Scanner products={products.map((x) => ({ id: x.p.id, code: x.p.code, barcode: x.p.barcode, description: x.p.description }))} name="lines" />
        <div>
          <SubmitButton pendingText="Cerrando…" confirm="¿Cerrar el conteo? Las diferencias quedan como ajustes." confirmLabel="Cerrar conteo">
            Cerrar el conteo
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

async function Stores({ r, sp }: { r: ResolvedStock; sp: SP }) {
  const [stores, deps, products] = await Promise.all([listStores(r.scope), deposits(r.scope), listProducts(r.scope)]);
  const current = sp.tienda ? await storeView(r.scope, sp.tienda) : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {stores.map((st) => (
          <Link key={st.id} href={`${r.base}${r.sep}ver=tiendas&tienda=${st.id}`} aria-current={current?.st.id === st.id ? "page" : undefined} className={chipClass(current?.st.id === st.id)}>
            <Store className="size-3.5" aria-hidden /> {st.name}
            {st.sync_enabled && !st.paused && <span className="text-caption">· publicando</span>}
          </Link>
        ))}
      </div>
      {current ? (
        <StoreDetail r={r} v={current} products={products.map((x) => x.p)} />
      ) : (
        r.scope.canManage && (
          <Card className="grid gap-2">
            <p className="text-title font-semibold text-ink">Conectar una tienda</p>
            <p className="text-meta text-muted">Las ventas restan solas (sin contar dos veces). Publicar la existencia en la tienda está apagado hasta que lo actives, y solo publica lo vinculado.</p>
            <form action={connectStoreAction} className="grid gap-2 sm:grid-cols-4">
              <Hidden r={r} />
              <label className={lbl}>
                Plataforma
                <select name="platform" className={field}>
                  {Object.entries(PLATFORMS).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={lbl}>
                Nombre
                <input name="name" placeholder="Ej.: Tienda online" className={field} />
              </label>
              <label className={lbl}>
                Identificador de la tienda
                <input name="shop_id" required className={field} />
              </label>
              <label className={lbl}>
                Depósito que vende
                <select name="deposit_id" className={field}>
                  {deps.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <SubmitButton pendingText="Conectando…">Conectar</SubmitButton>
              </div>
            </form>
          </Card>
        )
      )}
      {!current && stores.length === 0 && !r.scope.canManage && <p className="text-ui text-muted">Sin tiendas conectadas.</p>}
    </>
  );
}

function StoreDetail({ r, v, products }: { r: ResolvedStock; v: NonNullable<Awaited<ReturnType<typeof storeView>>>; products: { id: string; code: string; description: string }[] }) {
  const { st } = v;
  const info = PLATFORMS[st.platform as keyof typeof PLATFORMS];
  const hidden = (
    <>
      <Hidden r={r} />
      <input type="hidden" name="store_id" value={st.id} />
    </>
  );
  return (
    <div className="grid gap-6">
      <Card className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-title font-semibold text-ink">
            {st.name} <span className="font-normal text-muted">· {info?.label} · {st.shop_id}</span>
          </p>
          {st.sync_enabled ? <ToneBadge tone={st.paused ? "neutral" : "ok"}>{st.paused ? "Publicación en pausa" : "Publica la existencia"}</ToneBadge> : <ToneBadge tone="neutral">No publica</ToneBadge>}
        </div>
        <p className="text-meta text-muted">
          Ventas: {info?.orders === "webhook" ? "llegan con el aviso de la tienda" : info?.orders === "consulta" ? "Faro las consulta cada 5 minutos" : "se importan por archivo"}. {info?.missing}
        </p>
        {info?.orders === "webhook" && (
          <p className="break-all text-meta text-muted">
            URL del aviso: <span className="num">{getSiteUrl()}/api/tiendas/webhook/{st.webhook_token}</span>
          </p>
        )}
        {st.last_error && <p className="text-meta text-danger">{st.last_error}</p>}
        {r.scope.canManage && (
          <div className="flex flex-wrap items-end gap-3">
            {info?.publish && (
              <form action={storeAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <input type="hidden" name="op" value="config" />
                <label className="flex items-center gap-2 text-ui">
                  <input type="checkbox" name="sync_enabled" defaultChecked={st.sync_enabled} className="size-4 accent-navy" /> Publicar la existencia
                </label>
                <label className={lbl}>
                  Margen de seguridad
                  <input name="margin" inputMode="decimal" defaultValue={String(Number(st.safety_margin))} className={`${field} w-28`} />
                </label>
                <label className="flex items-center gap-2 text-ui">
                  <input type="checkbox" name="paused" defaultChecked={st.paused} className="size-4 accent-navy" /> En pausa
                </label>
                <SubmitButton variant="secondary" pendingText="…">
                  Guardar
                </SubmitButton>
              </form>
            )}
            {info?.orders !== "importacion" && (
              <form action={storeAction}>
                {hidden}
                <input type="hidden" name="op" value="sync" />
                <SubmitButton variant="secondary" pendingText="…">
                  Traer publicaciones
                </SubmitButton>
              </form>
            )}
            {st.sync_enabled && !st.paused && (
              <form action={storeAction}>
                {hidden}
                <input type="hidden" name="op" value="publicar" />
                <SubmitButton variant="secondary" pendingText="Publicando…">
                  Publicar ahora
                </SubmitButton>
              </form>
            )}
            {info?.orders === "importacion" && (
              <form action={storeAction} encType="multipart/form-data" className="flex flex-wrap items-end gap-2">
                {hidden}
                <input type="hidden" name="op" value="ventas" />
                <input name="file" type="file" accept=".xlsx,.csv,.txt" required className="min-w-0 text-ui" />
                <SubmitButton variant="secondary" pendingText="Importando…">
                  Importar ventas
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </Card>

      {v.conflicts.length > 0 && (
        <Card className="grid gap-2 border-warn-line">
          <p className="flex items-center gap-2 text-title font-semibold text-ink">
            <AlertTriangle className="size-4 text-warn" aria-hidden /> Diferencias para revisar
          </p>
          <p className="text-meta text-muted">La tienda tiene otra existencia que la última que publicó Faro. No se pisó nada: elegí qué hacer.</p>
          <ul className="grid gap-2">
            {v.conflicts.map(({ c, title }) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-ui">
                <span>
                  {title}: Faro <span className="num">{qtyFmt(Number(c.faro_qty))}</span> · tienda <span className="num">{qtyFmt(Number(c.remote_qty))}</span>
                </span>
                {r.scope.canManage && (
                  <span className="flex flex-wrap gap-2">
                    {(["usar_faro", "ajustar_faro", "descartar"] as const).map((op) => (
                      <form key={op} action={conflictAction}>
                        {hidden}
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="op" value={op} />
                        <SubmitButton variant="secondary" pendingText="…">
                          {op === "usar_faro" ? "Publicar lo de Faro" : op === "ajustar_faro" ? "Ajustar Faro a la tienda" : "Descartar"}
                        </SubmitButton>
                      </form>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Table label="Publicaciones de la tienda" minWidth={720}>
        <thead>
          <tr className="border-b border-line text-meta text-muted">
            <th className="px-3 py-2 font-medium">Publicación</th>
            <th className="px-3 py-2 font-medium">Producto propio</th>
            <th className="px-3 py-2 text-right font-medium">En la tienda</th>
            <th className="px-3 py-2 text-right font-medium">Publicado por Faro</th>
          </tr>
        </thead>
        <tbody>
          {v.listings.map(({ l, code, description }) => (
            <tr key={l.id} className="border-b border-line align-top last:border-0">
              <td className="px-3 py-2">
                {l.title}
                {l.sku && <span className="num block text-meta text-muted">SKU {l.sku}</span>}
              </td>
              <td className="px-3 py-2">
                {r.scope.canManage ? (
                  <form action={linkListingAction} className="flex flex-wrap items-center gap-2">
                    {hidden}
                    <input type="hidden" name="listing_id" value={l.id} />
                    <label className="sr-only" htmlFor={`p-${l.id}`}>
                      Producto propio de {l.title}
                    </label>
                    <select id={`p-${l.id}`} name="product_id" defaultValue={l.product_id ?? l.suggested_product_id ?? ""} className={`${fieldClass} h-(--control-h-sm) max-w-56`}>
                      <option value="">Sin vincular</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.description}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingText="…">
                      {l.product_id ? "Cambiar" : "Vincular"}
                    </SubmitButton>
                  </form>
                ) : (
                  (description ?? "Sin vincular")
                )}
                {l.product_id ? <span className="mt-1 block text-meta text-muted">{l.linked_by === "sku" ? "Vinculado por el código" : l.linked_by === "aprendido" ? "Aprendido de un vínculo anterior" : `Vinculado a mano${code ? ` (${code})` : ""}`}</span> : l.suggestion_reason ? <span className="mt-1 block text-meta text-warn">Sugerencia: {l.suggestion_reason}</span> : null}
              </td>
              <td className="num px-3 py-2 text-right">{l.remote_qty == null ? "—" : qtyFmt(Number(l.remote_qty))}</td>
              <td className="num px-3 py-2 text-right">{l.last_published_qty == null ? "—" : qtyFmt(Number(l.last_published_qty))}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid content-start gap-2">
          <p className="text-title font-semibold text-ink">Pedidos recibidos</p>
          {v.orders.length === 0 ? (
            <p className="text-meta text-muted">Sin pedidos todavía.</p>
          ) : (
            <ul className="grid gap-1 text-meta">
              {v.orders.map((o) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span>
                    Pedido <span className="num">{o.external_id}</span> · {o.status} · {o.via}
                  </span>
                  <span className="text-muted">{formatDate(o.received_at.toISOString().slice(0, 10), "numeric")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="grid content-start gap-2">
          <p className="text-title font-semibold text-ink">Registro de publicaciones</p>
          {v.publications.length === 0 ? (
            <p className="text-meta text-muted">Faro todavía no publicó nada en esta tienda.</p>
          ) : (
            <ul className="grid gap-1 text-meta">
              {v.publications.map(({ p, title }) => (
                <li key={p.id}>
                  <span className={p.status === "ok" ? "" : p.status === "conflicto" ? "text-warn" : "text-danger"}>{p.status === "ok" ? "Publicado" : p.status === "conflicto" ? "Diferencia" : `Error (intento ${p.attempts})`}</span> · {title}: <span className="num">{qtyFmt(Number(p.qty))}</span>
                  {p.error && <span className="text-muted"> · {p.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function Unlinked({ r }: { r: ResolvedStock }) {
  const [sales, purchases, products] = await Promise.all([listUnlinked(r.scope), unlinkedPurchases(r.scope), listProducts(r.scope)]);
  const options = products.map((x) => x.p);
  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-labelledby="ventas-sv">
        <h2 id="ventas-sv" className="text-title font-semibold text-ink">
          Ventas sin vincular
        </h2>
        <p className="text-meta text-muted">No descuentan hasta que digas a qué producto corresponden. Al vincular, Faro descuenta y lo recuerda para la próxima.</p>
        {sales.length === 0 ? (
          <p className="text-ui text-muted">No hay ventas sin vincular.</p>
        ) : (
          <ul className="grid gap-2">
            {sales.map(({ u, store }) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-ui">
                <span>
                  {u.title} <span className="text-meta text-muted">· {qtyFmt(Number(u.qty))} · {u.source_type === "tienda" ? (store ?? "Tienda") : "Factura"}</span>
                </span>
                {r.scope.canManage && (
                  <form action={unlinkedAction} className="flex flex-wrap items-center gap-2">
                    <Hidden r={r} />
                    <input type="hidden" name="id" value={u.id} />
                    <select name="product_id" aria-label={`Producto de ${u.title}`} className={`${fieldClass} h-(--control-h-sm) max-w-56`}>
                      <option value="">Ignorar (no es de stock)</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.description}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingText="…">
                      Guardar
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid gap-2" aria-labelledby="compras-sv">
        <h2 id="compras-sv" className="text-title font-semibold text-ink">
          Compras sin vincular
        </h2>
        <p className="text-meta text-muted">Ítems de compras leídas que todavía no suman al stock. Vinculalos a un producto o crealo desde la compra; Faro aprende el código del proveedor.</p>
        {purchases.length === 0 ? (
          <p className="text-ui text-muted">No hay compras sin vincular.</p>
        ) : (
          <ul className="grid gap-2">
            {purchases.slice(0, 60).map((x) => (
              <li key={`${x.docId}-${x.line}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-ui">
                <span>
                  {x.description}
                  <span className="text-meta text-muted">
                    {" "}
                    · {qtyFmt(x.qty)} · {x.supplier ?? "Proveedor"}
                    {x.code ? ` · código ${x.code}` : ""}
                  </span>
                  {x.suggestion && <span className="block text-meta text-warn">Sugerencia: {x.suggestion.reason}</span>}
                </span>
                {r.scope.canManage && (
                  <form action={purchaseLinkAction} className="flex flex-wrap items-center gap-2">
                    <Hidden r={r} />
                    <input type="hidden" name="doc_id" value={x.docId} />
                    <input type="hidden" name="line" value={x.line} />
                    <select name="product_id" defaultValue={x.suggestion?.productId ?? ""} aria-label={`Producto de ${x.description}`} className={`${fieldClass} h-(--control-h-sm) max-w-56`}>
                      <option value="">Crear el producto</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.description}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingText="…">
                      Sumar al stock
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

async function Inventory({ r, sp }: { r: ResolvedStock; sp: SP }) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? "") ? sp.fecha! : todayAR();
  const method = sp.metodo === "ultimo" ? "ultimo" : "promedio";
  const [inv, c] = await Promise.all([inventory(r.scope, date, method), cmvOf(r.scope, `${date.slice(0, 4)}-01-01`, date)]);
  const csv = `/api/stock/inventario?${new URLSearchParams({ ...(r.ambito === "personal" ? {} : { org: r.scope.organizationId }), fecha: date, metodo: method })}`;
  const rows = inv.rows.filter((x) => x.qty !== 0);
  return (
    <>
      <form className="flex flex-wrap items-end gap-2" action={r.base.split("?")[0]}>
        {r.ambito === "estudio" && <input type="hidden" name="tab" value="stock" />}
        <input type="hidden" name="ver" value="inventario" />
        <label className={lbl}>
          Al
          <input name="fecha" type="date" defaultValue={date} className={field} />
        </label>
        <label className={lbl}>
          Valuación
          <select name="metodo" defaultValue={method} className={field}>
            <option value="promedio">Promedio ponderado</option>
            <option value="ultimo">Último costo</option>
          </select>
        </label>
        <button className="h-(--control-h) rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">Ver</button>
        <a href={csv} className="inline-flex h-(--control-h) items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-ui hover:border-muted">
          <Download className="size-4" aria-hidden /> Exportar CSV
        </a>
      </form>
      <section aria-label="Resumen del inventario" className="grid gap-3 sm:grid-cols-2">
        <MetricCard icon={Wallet} label={`Inventario al ${formatDate(date, "numeric")}`} value={inv.total} display={pesos(inv.total)} hint={method === "ultimo" ? "Por último costo" : "Por costo promedio ponderado"} />
        <MetricCard icon={Boxes} label={`CMV estimado ${date.slice(0, 4)}`} value={c.total} display={pesos(c.total)} hint={`${qtyFmt(c.units)} unidades vendidas al ${formatDate(date, "numeric")}. Estimación de gestión.`} />
      </section>
      {rows.length === 0 ? (
        <p className="text-ui text-muted">Sin existencia a esa fecha.</p>
      ) : (
        <Table label="Inventario valorizado" minWidth={640}>
          <thead>
            <tr className="border-b border-line text-meta text-muted">
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 text-right font-medium">Existencia</th>
              <th className="px-3 py-2 text-right font-medium">Costo unitario</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.productId} className="border-b border-line last:border-0">
                <td className="num whitespace-nowrap px-3 py-2">{x.code}</td>
                <td className="px-3 py-2">{x.description}</td>
                <td className="num px-3 py-2 text-right">
                  {qtyFmt(x.qty)} <span className="text-meta text-muted">{x.unit}</span>
                </td>
                <td className="num px-3 py-2 text-right">{pesos(x.unitCost)}</td>
                <td className="num px-3 py-2 text-right">{pesos(x.value)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-meta text-muted">Valuación de gestión según los movimientos cargados en Faro. Esto no reemplaza el criterio de un contador.</p>
    </>
  );
}
