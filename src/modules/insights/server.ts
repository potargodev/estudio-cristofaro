import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { hasModule } from "@/lib/faro/entitlements";
import { lastMonths, series } from "./core";

// Indicadores (insights): tableros financieros y de gestión del estudio y de
// cada organización. Todo se calcula en el servidor con el estudio de la
// sesión; la organización se valida contra ese estudio antes de consultar.

const UUID = /^[0-9a-f-]{36}$/i;
type Row = { m: string; v: string | number | null };
const rows = async (q: ReturnType<typeof sql>) => (await getDb().execute(q)) as unknown as Row[];
const one = async <T>(q: ReturnType<typeof sql>) => ((await getDb().execute(q)) as unknown as T[])[0];

export const insightsEnabled = (studioId: string) => hasModule(studioId, "insights");

/** Facturación neta de ARCA (notas de crédito restan), en pesos */
const invoicedSql = (studioId: string, from: string, orgId?: string) => sql`
  select to_char(issue_date, 'YYYY-MM') m,
         sum(case when cbte_type in (3, 8, 13, 21) then -total else total end * coalesce(exchange_rate, 1)) v
  from invoices
  where studio_id = ${studioId} and status = 'autorizada' and issue_date >= ${from}::date
  ${orgId ? sql`and organization_id = ${orgId}` : sql``}
  group by 1`;

export async function studioInsights(studioId: string) {
  const months = lastMonths(12);
  const from = `${months[0]}-01`;
  const [orgs, invoiced, fees, feesPaid, obligationsDone, requestsMonthly, response, tasksOpen, newOrgs] = await Promise.all([
    one<{ activas: number; onboarding: number; pausadas: number }>(sql`
      select count(*) filter (where status = 'activa')::int activas, count(*) filter (where status = 'onboarding')::int onboarding, count(*) filter (where status = 'pausada')::int pausadas
      from organizations where studio_id = ${studioId}`),
    rows(invoicedSql(studioId, from)),
    one<{ pendiente: string | null; vencido: string | null }>(sql`
      select sum(amount) filter (where status = 'pendiente' and due_date >= current_date) pendiente,
             sum(amount) filter (where status = 'pendiente' and due_date < current_date) vencido
      from fee_charges where studio_id = ${studioId}`),
    rows(sql`select to_char(paid_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') m, sum(coalesce(paid_amount, amount)) / 100.0 v
             from fee_charges where studio_id = ${studioId} and status = 'pagado' and paid_at >= ${from}::date group by 1`),
    rows(sql`select to_char(due_date, 'YYYY-MM') m,
               round(100.0 * count(*) filter (where status in ('presentado', 'pagado')) / nullif(count(*), 0)) v
             from obligations where studio_id = ${studioId} and due_date >= ${from}::date and due_date <= current_date group by 1`),
    rows(sql`select to_char(created_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') m, count(*) v
             from requests where studio_id = ${studioId} and created_at >= ${from}::date group by 1`),
    one<{ horas: string | null }>(sql`
      select round(avg(extract(epoch from (r.first_reply - q.created_at)) / 3600)::numeric, 1) horas
      from requests q
      cross join lateral (select min(created_at) first_reply from request_messages where request_id = q.id and from_client = false) r
      where q.studio_id = ${studioId} and q.created_at >= now() - interval '90 days' and r.first_reply is not null`),
    one<{ abiertas: number; vencidas: number }>(sql`
      select count(*) filter (where status <> 'hecha')::int abiertas, count(*) filter (where status <> 'hecha' and due_date < current_date)::int vencidas
      from tasks where studio_id = ${studioId}`),
    rows(sql`select to_char(created_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM') m, count(*) v
             from organizations where studio_id = ${studioId} and created_at >= ${from}::date group by 1`),
  ]);
  return {
    months,
    orgs,
    invoiced: series(months, invoiced),
    feesPaid: series(months, feesPaid),
    feesPending: Number(fees.pendiente ?? 0) / 100,
    feesOverdue: Number(fees.vencido ?? 0) / 100,
    onTime: series(months, obligationsDone),
    requests: series(months, requestsMonthly),
    responseHours: response.horas == null ? null : Number(response.horas),
    tasks: tasksOpen,
    newOrgs: series(months, newOrgs),
  };
}

/** Indicadores de una organización (null si no es del estudio) */
export async function orgInsights(studioId: string, orgId: string) {
  if (!UUID.test(orgId)) return null;
  const org = await one<{ id: string } | undefined>(sql`select id from organizations where id = ${orgId} and studio_id = ${studioId}`);
  if (!org) return null;
  const months = lastMonths(12);
  const from = `${months[0]}-01`;
  const [sales, expenses, onTime, upcoming, fees, requestsOpen, staff] = await Promise.all([
    rows(invoicedSql(studioId, from, orgId)),
    rows(sql`select to_char(date, 'YYYY-MM') m, sum(amount) / 100.0 v from accounting_expenses
             where studio_id = ${studioId} and organization_id = ${orgId} and date >= ${from}::date group by 1`),
    rows(sql`select to_char(due_date, 'YYYY-MM') m,
               round(100.0 * count(*) filter (where status in ('presentado', 'pagado')) / nullif(count(*), 0)) v
             from obligations where studio_id = ${studioId} and organization_id = ${orgId} and due_date >= ${from}::date and due_date <= current_date group by 1`),
    one<{ n: number; monto: string | null }>(sql`
      select count(*)::int n, sum(amount) monto from obligations
      where studio_id = ${studioId} and organization_id = ${orgId} and status in ('pendiente', 'en_proceso') and due_date between current_date and current_date + 30`),
    one<{ pendiente: string | null; pagado: string | null }>(sql`
      select sum(amount) filter (where status = 'pendiente') pendiente, sum(coalesce(paid_amount, amount)) filter (where status = 'pagado' and paid_at >= ${from}::date) pagado
      from fee_charges where studio_id = ${studioId} and organization_id = ${orgId}`),
    one<{ n: number }>(sql`select count(*)::int n from requests where studio_id = ${studioId} and organization_id = ${orgId} and status <> 'resuelta'`),
    one<{ n: number }>(sql`select count(*)::int n from employees where studio_id = ${studioId} and organization_id = ${orgId} and active`),
  ]);
  const s = series(months, sales);
  const e = series(months, expenses);
  return {
    months,
    sales: s,
    expenses: e,
    result: s.map((x, i) => ({ m: x.m, v: x.v - e[i].v })),
    onTime: series(months, onTime),
    upcoming: { n: upcoming.n, amount: Number(upcoming.monto ?? 0) },
    feesPending: Number(fees.pendiente ?? 0) / 100,
    feesPaidYear: Number(fees.pagado ?? 0) / 100,
    requestsOpen: requestsOpen.n,
    employees: staff.n,
  };
}
