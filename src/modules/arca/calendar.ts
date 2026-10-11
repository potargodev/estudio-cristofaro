// Calendario personal de vencimientos según CUIT y régimen. Fechas de
// referencia por terminación de CUIT (las del cronograma general de ARCA);
// si cae sábado o domingo pasa al día hábil siguiente. Los feriados no se
// contemplan: la pantalla avisa que se verifique en el calendario oficial.

export interface TaxProfileInput {
  cuit: string;
  regime: "monotributo" | "responsable_inscripto";
  iibb: "simplificado" | "local" | "convenio" | "exento";
  autonomos: boolean;
}

export interface Deadline {
  tax: string;
  period: string;
  dueDate: string;
  note: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function businessDay(y: number, m: number, d: number) {
  const date = new Date(y, m - 1, d);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return iso(date);
}

/** Día del mes por terminación de CUIT (tramos del cronograma general) */
export function dayByCuit(cuit: string, table: [number, number, number, number, number]) {
  const last = Number(cuit.slice(-1));
  return table[Math.min(4, Math.floor(last / 2))];
}

/** Vencimientos de los próximos `months` meses desde `from` */
export function deadlines(p: TaxProfileInput, from = new Date(), months = 6): Deadline[] {
  const out: Deadline[] = [];
  for (let i = 0; i < months; i++) {
    const y = new Date(from.getFullYear(), from.getMonth() + i, 1).getFullYear();
    const m = new Date(from.getFullYear(), from.getMonth() + i, 1).getMonth() + 1;
    const prev = new Date(y, m - 2, 1);
    const prevPeriod = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
    const period = `${y}-${pad(m)}`;
    if (p.regime === "monotributo") {
      out.push({ tax: "Monotributo", period, dueDate: businessDay(y, m, 20), note: "Cuota mensual (impositivo, jubilación y obra social)." });
      if (m === 2 || m === 8) out.push({ tax: "Recategorización de monotributo", period: m === 2 ? `${y - 1}-12` : `${y}-06`, dueDate: businessDay(y, m, 5), note: "Revisá tu categoría con lo facturado en los últimos 12 meses (el semáforo te dice cuál te corresponde)." });
    } else {
      out.push({ tax: "IVA", period: prevPeriod, dueDate: businessDay(y, m, dayByCuit(p.cuit, [18, 19, 20, 21, 22])), note: "Declaración jurada y pago del mes anterior." });
      if (m === 6) out.push({ tax: "Ganancias y Bienes Personales (DDJJ anual)", period: `${y - 1}`, dueDate: businessDay(y, m, dayByCuit(p.cuit, [11, 11, 12, 12, 13])), note: "Declaraciones juradas anuales de personas humanas." });
    }
    if (p.autonomos) out.push({ tax: "Autónomos", period, dueDate: businessDay(y, m, dayByCuit(p.cuit, [5, 5, 6, 6, 7])), note: "Aporte mensual de autónomos." });
    if (p.iibb === "local" || p.iibb === "convenio") out.push({ tax: p.iibb === "convenio" ? "IIBB Convenio Multilateral" : "Ingresos Brutos", period: prevPeriod, dueDate: businessDay(y, m, dayByCuit(p.cuit, [13, 14, 15, 16, 17])), note: "Anticipo mensual. La fecha exacta depende de tu jurisdicción." });
  }
  return out.filter((d) => d.dueDate >= iso(from)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
