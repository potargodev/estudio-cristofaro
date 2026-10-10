import { parseAmount } from "@/modules/bitacora/catalog";

// Modo básico del Vigía (sin IA configurada): entiende frases simples de
// texto como «5000 nafta y 3200 en el chino» o «ayer cobré 200k de sueldo».
// Devuelve entradas con la forma de crear_movimiento; lo demás, a mano.

const KEYWORDS: [RegExp, string][] = [
  [/super|chino|almac|verduler|carnicer|coto|carrefour|dia\b|jumbo|disco|vea/, "Supermercado"],
  [/delivery|rappi|pedidos ?ya|pizza|empanada|cafe|almuerzo|cena|comida|burger|helado|kiosco/, "Comida y delivery"],
  [/nafta|ypf|shell|axion|sube|uber|cabify|didi|taxi|remis|colectivo|tren|subte|peaje|estacionamiento/, "Transporte"],
  [/luz|gas\b|agua|internet|expensas|alquiler|edenor|edesur|metrogas|aysa|telefono|celular/, "Casa y servicios"],
  [/farmacia|medic|prepaga|osde|swiss|dentista|consulta|remedio/, "Salud"],
  [/cine|bar|boliche|teatro|recital|salida|cerveza|birra|entrada/, "Salidas"],
  [/netflix|spotify|disney|hbo|max\b|youtube|icloud|google one|chatgpt|suscrip|amazon prime|paramount/, "Suscripciones"],
  [/ropa|zapatilla|remera|pantalon|campera|zara|calzado/, "Ropa"],
  [/curso|libro|colegio|facultad|universidad|cuota escolar|udemy|educacion/, "Educación"],
];
const INCOME = /\b(cobr[eé]|cobro|sueldo|ingreso|me pagaron|me transfirieron|honorarios|aguinaldo|venta|vend[ií])\b/;
const METHODS: [RegExp, string][] = [
  [/mercado ?pago|\bmp\b/, "mercado_pago"],
  [/efectivo|cash/, "efectivo"],
  [/debito|débito/, "debito"],
  [/credito|crédito|tarjeta/, "credito"],
  [/transferencia|transferi/, "transferencia"],
];
const STOPWORDS = new Set("de del en el la los las un una por pague gaste con para al y me hoy ayer anteayer cobre cobro pesos mangos usd u$s us$ dolares efectivo debito credito tarjeta transferencia mp".split(" "));

const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface BasicEntry {
  tipo: "gasto" | "ingreso";
  monto: number;
  moneda: "ARS" | "USD";
  fecha?: string;
  categoria?: string;
  descripcion: string;
  medio_pago?: string;
}

function shift(today: string, days: number) {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseBasic(text: string, today: string): BasicEntry[] {
  const all = n(text);
  const date = /\banteayer\b/.test(all) ? shift(today, 2) : /\bayer\b/.test(all) ? shift(today, 1) : undefined;
  const out: BasicEntry[] = [];
  for (const raw of text.split(/\n|;|,(?!\d)|\s+y\s+|\s+mas\s+|\s+más\s+/i)) {
    const seg = raw.trim();
    const m = seg.match(/(?:US\$|u\$s|\$)?\s?(\d[\d.,]*k?)/i);
    if (!m) continue;
    const cents = parseAmount(m[1]);
    if (!cents) continue;
    const s = n(seg);
    const usd = /usd|u\$s|us\$|dolar/.test(s);
    const tipo = INCOME.test(s) ? "ingreso" : "gasto";
    const rest = seg.replace(m[0], " ");
    const words = n(rest.replace(/mercado ?pago/i, " "))
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w));
    const desc = words.join(" ");
    const orig = rest
      .replace(/mercado ?pago/i, " ")
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(n(w)));
    const nice = orig.join(" ");
    const cat = tipo === "ingreso" ? "Ingresos" : KEYWORDS.find(([re]) => re.test(desc))?.[1];
    const method = METHODS.find(([re]) => re.test(s))?.[1];
    out.push({
      tipo,
      monto: cents / 100,
      moneda: usd ? "USD" : "ARS",
      ...(date ? { fecha: date } : {}),
      ...(cat ? { categoria: cat } : {}),
      descripcion: (nice ? nice[0].toUpperCase() + nice.slice(1) : tipo === "ingreso" ? "Ingreso" : "Gasto").slice(0, 160),
      ...(method ? { medio_pago: method } : {}),
    });
  }
  return out.slice(0, 10);
}
