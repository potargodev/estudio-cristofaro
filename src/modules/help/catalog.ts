import RAW from "./articles.generated.json";

// Centro de ayuda: los artículos salen de docs/ayuda (compilados por
// scripts/ayuda.mjs). Sin base de datos: lo usan /ayuda, el botón "?" y la
// herramienta buscar_ayuda del Asistente y MCP.

export type HelpProfile = "persona" | "autonomo" | "estudio" | "organizacion" | "empleado" | "flota";

export interface HelpArticle {
  id: string;
  categoria: string;
  slug: string;
  titulo: string;
  resumen: string;
  perfiles: HelpProfile[];
  modulo: string;
  actualizado: string;
  relacionados: string[];
  body: string;
  text: string;
}

export const ARTICLES = RAW as HelpArticle[];

export const PROFILE_LABELS: Record<HelpProfile, string> = {
  persona: "Personas",
  autonomo: "Autónomos",
  estudio: "Estudios",
  organizacion: "Organizaciones",
  empleado: "Empleados",
  flota: "Flotas",
};

export const CATEGORIES: { key: string; name: string; icon: string; text: string }[] = [
  { key: "primeros-pasos", name: "Primeros pasos", icon: "Compass", text: "Crear la cuenta, planes y la guía." },
  { key: "organizaciones", name: "Organizaciones y equipo", icon: "Building2", text: "Invitaciones, roles y rubros." },
  { key: "vencimientos", name: "Vencimientos", icon: "CalendarClock", text: "El calendario fiscal, con alertas." },
  { key: "documentos", name: "Documentos", icon: "FileText", text: "Subir, ordenar y encontrar." },
  { key: "solicitudes", name: "Solicitudes", icon: "Inbox", text: "Consultas y pedidos al estudio." },
  { key: "grupos-de-gastos", name: "Grupos de gastos", icon: "Wallet", text: "Dividir, saldar y rendir." },
  { key: "ia", name: "IA y MCP", icon: "Sparkles", text: "El asistente y las aprobaciones." },
  { key: "conexiones", name: "Conexiones", icon: "Plug", text: "Tango, Xubio, Drive y archivos." },
  { key: "flotas", name: "Flotas", icon: "Ship", text: "Grupos informales que piden juntos." },
  { key: "red-de-estudios", name: "Red de estudios", icon: "Handshake", text: "Encontrar y elegir un estudio." },
];

export const categoryName = (k: string) => CATEGORIES.find((c) => c.key === k)?.name ?? k;

export const getArticle = (categoria: string, slug: string) => ARTICLES.find((a) => a.categoria === categoria && a.slug === slug) ?? null;

/** Relacionados: los que declara el artículo y, si faltan, otros de su categoría */
export function relatedOf(a: HelpArticle, max = 4) {
  const explicit = a.relacionados.map((id) => ARTICLES.find((x) => x.id === id)).filter((x): x is HelpArticle => !!x);
  const same = ARTICLES.filter((x) => x.categoria === a.categoria && x.id !== a.id && !explicit.includes(x));
  return [...explicit, ...same].slice(0, max);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Búsqueda simple por palabras (título pesa más que el resumen y el texto) */
export function searchArticles(query: string, perfil?: HelpProfile | null, max = 10) {
  const words = norm(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 2);
  const pool = perfil ? ARTICLES.filter((a) => a.perfiles.includes(perfil)) : ARTICLES;
  if (!words.length) return pool.slice(0, max);
  return pool
    .map((a) => {
      const t = norm(a.titulo);
      const r = norm(a.resumen);
      const x = norm(a.text);
      const score = words.reduce((s, w) => s + (t.includes(w) ? 6 : 0) + (r.includes(w) ? 3 : 0) + (x.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((p, q) => q.score - p.score)
    .slice(0, max)
    .map((x) => x.a);
}

export const articleUrl = (a: Pick<HelpArticle, "categoria" | "slug">) => `/ayuda/${a.categoria}/${a.slug}`;
