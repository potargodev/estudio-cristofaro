// Genera docs/guia-prueba-contadora.md desde la lista de la app
// (src/modules/simuladores/guia.ts), así la guía impresa y la checklist de
// Faro Manager son la misma. Uso: npm run guia
import { writeFileSync } from "node:fs";
import { GAPS, GUIDE } from "../src/modules/simuladores/guia.ts";

const areas = [...new Set(GUIDE.map((g) => g.area))];
let n = 0;
const out = [
  "# Guía de prueba para la contadora",
  "",
  "> Generada desde `src/modules/simuladores/guia.ts` con `npm run guia`: no editar a mano. La misma lista está en Faro Manager → Plataforma → Guía de prueba, donde cada recorrido guarda su estado y un comentario.",
  "",
  "**Antes de empezar.** Todo se prueba sobre la demo, con los servicios en **Simulador**: ARCA, Mercado Pago, WhatsApp, las tiendas, Xubio, Contabilium, Tango, los bancos y los mails están simulados dentro de Faro. Nada sale a internet ni tiene validez fiscal (las pantallas lo dicen arriba y los PDF llevan «SIN VALIDEZ FISCAL»). Faro nunca pide ni guarda la clave fiscal.",
  "",
  "**Cómo entrar.** El owner de Faro abre Faro Manager → Plataforma → Demo y usa «Ver como…» con el usuario que indica cada recorrido. Los controles de «el otro lado» (tirar ARCA, mandar una venta de una tienda, pagar un link, escribir por WhatsApp) están en **Simuladores** (link en la franja de arriba).",
  "",
  `Son ${GUIDE.length} recorridos de 2 a 5 minutos cada uno.`,
  "",
];
for (const a of areas) {
  out.push(`## ${a}`, "");
  for (const g of GUIDE.filter((x) => x.area === a)) {
    n++;
    out.push(`### ${n}. ${g.title}`, "", `**Con:** ${g.who}`, "", ...g.steps.map((s, i) => `${i + 1}. ${s}`), "", `**Tiene que pasar:** ${g.expect}`, "", "**Cómo te fue:** ☐ Anda bien ☐ Falla ☐ Tengo dudas — Comentario: ______________________", "");
  }
}
out.push("## Lo que Faro todavía no hace (para charlar)", "", "La pregunta es una sola: *¿qué tarea que hacés todos los meses con un cliente no está?*", "", ...GAPS.map((g, i) => `${i + 1}. ${g}`), "");
writeFileSync(new URL("../docs/guia-prueba-contadora.md", import.meta.url), out.join("\n"));
console.log(`docs/guia-prueba-contadora.md: ${GUIDE.length} recorridos.`);
