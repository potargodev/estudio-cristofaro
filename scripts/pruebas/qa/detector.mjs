// Detector de defectos visuales (QA visual al píxel). Se inyecta en la página
// (Playwright: page.evaluate(detect, opciones)) y devuelve los hallazgos de lo
// que se ve en ese momento: pantalla, menú abierto, diálogo, hover o foco.
// Sin dependencias: corre en el navegador. Un elemento intencional se excluye
// con el atributo data-qa-ignore (y queda explicado en docs/qa-visual.md).
//
// Mide:
// - scroll horizontal de la página y elementos que se salen de la pantalla;
// - elementos recortados por su contenedor (sin scroll) y texto cortado sin
//   puntos suspensivos (horizontal o vertical);
// - hermanos superpuestos en una fila o grilla, y menús, popovers, diálogos o
//   tooltips cortados por la pantalla, por un contenedor o tapados;
// - bordes de bloques hermanos desalineados (0,5 a 4 px) y espaciados fuera
//   de la escala (gap y padding de los contenedores con borde);
// - controles con alto o radio fuera del sistema, íconos desalineados con su
//   texto y bordes dobles (un borde pegado a otro);
// - elementos hermanos repetidos con el mismo contenido;
// - texto de menos de 12 px y contraste por debajo de AA.

export function detect(opts = {}) {
  const W = innerWidth;
  const H = innerHeight;
  const out = [];
  const MIN_FONT = opts.minFont ?? 11.95;
  const SPACING = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128]);
  // La app (.app-ui) y la web pública (dirección «Precisión») tienen su propia escala
  const APP = { heights: new Set([32, 36, 44]), radii: [0, 6] };
  const WEB = { heights: new Set([44, 48]), radii: [0, 2] };
  const scale = (e) => (e.closest(".app-ui") ? APP : WEB);

  const cs = (e) => getComputedStyle(e);
  const ignored = (e) => !!e.closest("[data-qa-ignore],.sr-only,svg,script,style,noscript,template,canvas,video,iframe,[aria-hidden=true]:not(html):not(body)");
  const visible = (e) => {
    const s = cs(e);
    if (s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden") return false;
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) if (parseFloat(cs(n).opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const sel = (e) => {
    const parts = [];
    for (let x = e, i = 0; x && x !== document.body && i < 4; x = x.parentElement, i++) {
      let p = x.tagName.toLowerCase();
      if (x.id) p += `#${x.id}`;
      else {
        const c = [...x.classList].filter((k) => /^[a-z][\w-]*$/i.test(k)).slice(0, 2);
        if (c.length) p += `.${c.join(".")}`;
      }
      parts.unshift(p);
    }
    return parts.join(" > ");
  };
  const text = (e) => (e.getAttribute?.("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 50);
  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  const push = (tipo, e, detalle = "") => out.push({ tipo, sel: e ? sel(e) : "", texto: e ? text(e) : "", detalle });
  const inFixedHidden = (e) => {
    // Paneles fuera de la pantalla a propósito (drawer cerrado, transform fuera)
    for (let n = e; n; n = n.parentElement) {
      const s = cs(n);
      if ((s.position === "fixed" || s.position === "absolute") && s.transform !== "none") {
        const r = n.getBoundingClientRect();
        if (r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) return true;
      }
    }
    return false;
  };

  const all = [...document.querySelectorAll("body *")].filter((e) => !ignored(e) && visible(e) && !inFixedHidden(e));

  // ── Scroll horizontal ──
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) push("scroll horizontal", null, `${sw} px en ${W} px`);

  // ── Contenedor que recorta y salida de la pantalla ──
  const clipOf = (e) => {
    for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const s = cs(p);
      if (s.overflowX !== "visible" || s.overflowY !== "visible" || s.contain.includes("paint")) return p;
      if (s.position === "fixed") return null;
    }
    return null;
  };
  const scrolls = (s) => /(auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`);
  for (const e of all) {
    if (!(ownText(e) || e.matches("button,a,input,select,textarea,[role=button],img"))) continue;
    const r = e.getBoundingClientRect();
    const c = clipOf(e);
    if (!c) {
      if (r.right > W + 1 || r.left < -1) push("se sale de la pantalla", e, `${Math.round(r.left)}…${Math.round(r.right)} en ${W}`);
      continue;
    }
    const s = cs(c);
    if (scrolls(s)) continue;
    // Un texto dentro de una línea que termina en puntos suspensivos está cortado a propósito
    if (s.textOverflow === "ellipsis" && c.contains(e) && r.left < c.getBoundingClientRect().right) continue;
    const cr = c.getBoundingClientRect();
    // Del todo afuera es un carrusel o un panel escondido a propósito; a medias, un recorte
    const outside = r.left >= cr.right - 0.5 || r.right <= cr.left + 0.5 || r.top >= cr.bottom - 0.5 || r.bottom <= cr.top + 0.5;
    if (outside) continue;
    if (r.right > cr.right + 1.5 || r.left < cr.left - 1.5) push("recortado por su contenedor", e, `${Math.round(r.right - cr.right)} px afuera de ${sel(c)}`);
    else if (r.bottom > cr.bottom + 1.5 && r.top < cr.bottom) push("recortado abajo", e, `${Math.round(r.bottom - cr.bottom)} px`);
  }

  // ── Texto cortado sin puntos suspensivos ──
  for (const e of all) {
    if (!ownText(e)) continue;
    const s = cs(e);
    const clamped = s.webkitLineClamp && s.webkitLineClamp !== "none";
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) {
      if (s.overflowX === "hidden" || s.overflowX === "clip") {
        if (s.textOverflow !== "ellipsis") push("texto cortado sin puntos suspensivos", e, `${e.scrollWidth} px en ${e.clientWidth} px`);
      } else if (s.overflowX === "visible" && s.whiteSpace.includes("nowrap") && !e.matches("input,select,textarea")) {
        push("texto que se sale de su caja", e, `${e.scrollWidth} px en ${e.clientWidth} px`);
      }
    }
    if (!clamped && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0 && (s.overflowY === "hidden" || s.overflowY === "clip") && !e.matches("input,select,textarea")) {
      push("texto cortado abajo", e, `${e.scrollHeight} px en ${e.clientHeight} px`);
    }
  }

  // ── Superpuestos (hermanos en fila o grilla) ──
  const flow = (e) => {
    const p = cs(e).position;
    return p === "static" || p === "relative";
  };
  const containers = all.filter((e) => /flex|grid/.test(cs(e).display));
  for (const c of containers) {
    const kids = [...c.children].filter((k) => !ignored(k) && visible(k) && flow(k));
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[j].getBoundingClientRect();
        const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // Superposición buscada: márgenes negativos (avatares apilados) o una capa con z-index
        const neg = [kids[i], kids[j]].some((k) => ["marginLeft", "marginRight", "marginTop", "marginBottom"].some((m) => parseFloat(cs(k)[m]) < 0) || cs(k).zIndex !== "auto");
        if (ix > 2 && iy > 2 && !neg) push("superpuestos", kids[j], `con ${sel(kids[i])} (${Math.round(ix)}×${Math.round(iy)} px)`);
      }
  }

  // ── Menús, popovers, diálogos y tooltips: completos y arriba de todo ──
  const floating = all.filter((e) => e.matches("[role=menu],[role=listbox],[role=dialog],[role=alertdialog],[role=tooltip],[data-radix-popper-content-wrapper] > *,[data-popover]"));
  // Con un diálogo modal abierto, lo que queda debajo está tapado a propósito
  const modal = [...document.querySelectorAll("[aria-modal=true]")].find((m) => m.getBoundingClientRect().width > 0);
  for (const f of floating) {
    if (modal && !modal.contains(f) && !f.contains(modal)) continue;
    const r = f.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) push("flotante cortado por la pantalla", f, `${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)} en ${W}×${H}`);
    const c = clipOf(f);
    if (c && !scrolls(cs(c))) {
      const cr = c.getBoundingClientRect();
      if (r.left < cr.left - 1 || r.right > cr.right + 1 || r.top < cr.top - 1 || r.bottom > cr.bottom + 1) push("flotante recortado por un contenedor", f, sel(c));
    }
    const pts = [
      [r.left + r.width / 2, r.top + Math.min(r.height / 2, 20)],
      [r.left + 8, r.bottom - 8],
      [r.right - 8, r.top + 8],
    ];
    // elementFromPoint saltea lo que tiene pointer-events: none (los tooltips): se prende un momento para medir
    const prevPE = f.style.pointerEvents;
    f.style.pointerEvents = "auto";
    const tops = pts.map(([x, y]) => (x < 0 || y < 0 || x > W || y > H ? null : document.elementFromPoint(x, y)));
    f.style.pointerEvents = prevPE;
    for (const top of tops) {
      if (top && !f.contains(top) && !top.closest("[data-qa-ignore]")) {
        push("flotante tapado", f, `por ${sel(top)}`);
        break;
      }
    }
  }

  // ── Alineación de bloques hermanos ──
  for (const c of containers) {
    const s = cs(c);
    const kids = [...c.children].filter((k) => !ignored(k) && visible(k) && flow(k));
    if (kids.length < 2) continue;
    const rects = kids.map((k) => k.getBoundingClientRect());
    const row = s.display.includes("grid") || (s.display.includes("flex") && !s.flexDirection.startsWith("column"));
    // Fila: los bordes de arriba de bloques con borde o fondo (tarjetas, campos, botones)
    const block = (k) => {
      const ks = cs(k);
      return !k.matches("input[type=checkbox],input[type=radio]") && (parseFloat(ks.borderTopWidth) > 0 || (ks.backgroundColor !== "rgba(0, 0, 0, 0)" && ks.backgroundColor !== "transparent"));
    };
    if (row && (s.alignItems === "normal" || s.alignItems === "stretch" || s.alignItems === "start" || s.alignItems === "flex-start")) {
      for (let i = 1; i < rects.length; i++) {
        if (!block(kids[i]) || !block(kids[i - 1])) continue;
        const d = Math.abs(rects[i].top - rects[i - 1].top);
        if (d > 0.5 && d <= 4) push("bordes desalineados", kids[i], `${d.toFixed(1)} px contra ${sel(kids[i - 1])}`);
      }
    }
    if (!row || s.display.includes("grid")) {
      // Columna: los bordes izquierdos de bloques con borde
      const boxed = kids.filter((k) => parseFloat(cs(k).borderLeftWidth) > 0);
      for (let i = 1; i < boxed.length; i++) {
        const d = Math.abs(boxed[i].getBoundingClientRect().left - boxed[i - 1].getBoundingClientRect().left);
        if (d > 0.5 && d <= 4) push("bordes desalineados", boxed[i], `${d.toFixed(1)} px a la izquierda`);
      }
    }
    for (const g of [s.rowGap, s.columnGap]) {
      const v = parseFloat(g);
      if (Number.isFinite(v) && !SPACING.has(Math.round(v * 2) / 2)) push("espaciado fuera de escala", c, `gap ${v} px`);
    }
  }
  for (const e of all) {
    const s = cs(e);
    if (!(parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0)) continue;
    for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
      const v = parseFloat(s[k]);
      if (!SPACING.has(Math.round(v * 2) / 2)) {
        push("espaciado fuera de escala", e, `${k} ${v} px`);
        break;
      }
    }
  }

  // ── Controles: alto, radio, íconos y bordes dobles ──
  const controls = all.filter((e) => e.matches("button,a[role=button],input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]):not([type=file]):not([type=color]),select,[data-slot=button]"));
  for (const e of controls) {
    const r = e.getBoundingClientRect();
    const s = cs(e);
    const labelled = e.matches("input,select") || (e.textContent.trim().length > 1 && !e.closest("table,[role=menu],[role=listbox],[role=tablist],nav,[data-free]"));
    const h = Math.round(r.height);
    const boxed = parseFloat(s.borderTopWidth) > 0 || (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent");
    const sc = scale(e);
    if (labelled && boxed && h < 60 && !e.matches("[data-free]") && !sc.heights.has(h)) push("alto de control fuera del sistema", e, `${h} px (${[...sc.heights].join("/")})`);
    const rad = parseFloat(s.borderTopLeftRadius);
    if (boxed && !sc.radii.includes(Math.round(rad)) && rad < Math.min(r.height, r.width) / 2 - 1 && !e.matches("[data-free]")) push("radio fuera del sistema", e, `${rad} px (${sc.radii.join("/")})`);
    // Ícono contra el texto
    const svg = e.querySelector(":scope > svg, :scope > span > svg");
    const tn = [...e.querySelectorAll("*"), e].flatMap((x) => [...x.childNodes]).find((n) => n.nodeType === 3 && n.textContent.trim());
    if (svg && tn && !e.matches("[data-free]") && cs(e).display.includes("flex") && !cs(e).flexDirection.startsWith("column")) {
      const range = document.createRange();
      range.selectNodeContents(tn);
      const tr = range.getBoundingClientRect();
      const ir = svg.getBoundingClientRect();
      if (tr.height && ir.height && Math.abs(tr.top + tr.height / 2 - (ir.top + ir.height / 2)) > 2.5) push("ícono desalineado con el texto", e, `${(tr.top + tr.height / 2 - (ir.top + ir.height / 2)).toFixed(1)} px`);
    }
  }
  const bordered = (e) => {
    const s = cs(e);
    return ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none") && !/rgba\(\d+, \d+, \d+, 0\)/.test(s.borderTopColor);
  };
  for (const e of all) {
    if (!bordered(e)) continue;
    const p = e.parentElement;
    if (!p || !bordered(p)) continue;
    const a = e.getBoundingClientRect();
    const b = p.getBoundingClientRect();
    if (Math.abs(a.left - b.left) < 4 && Math.abs(a.right - b.right) < 4 && Math.abs(a.top - b.top) < 4 && Math.abs(a.bottom - b.bottom) < 4) push("borde doble", e, `dentro de ${sel(p)}`);
  }
  // Bloques con borde en la app: un solo radio, 6 px (salvo filas de tablas o listas dentro de un contenedor con borde)
  for (const e of all) {
    if (!e.closest(".app-ui") || e.matches("table,thead,tbody,tr,td,th,hr,input,select,textarea,button,img,[data-free]") || e.closest("[data-free]")) continue;
    if (!bordered(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width >= W - 2 || r.height < 24) continue;
    const rad = Math.round(parseFloat(cs(e).borderTopLeftRadius));
    if (rad === 6 || rad >= Math.min(r.width, r.height) / 2 - 1 || rad === 10) continue;
    let inBox = false;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (bordered(p) && parseFloat(cs(p).borderTopLeftRadius) > 0 && cs(p).overflow !== "visible") inBox = true;
    if (!inBox) push("radio fuera del sistema", e, `${rad} px en un bloque con borde (6)`);
  }
  const focus = document.activeElement;
  // Un campo enfocado (con mouse o teclado) muestra su anillo pegado al borde, no separado
  if (focus && focus.matches("input,select,textarea") && focus.matches(":focus-visible") && bordered(focus)) {
    const s = cs(focus);
    if (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && parseFloat(s.outlineOffset) > 0) push("borde doble", focus, "borde + anillo de foco separado");
  }

  // ── Repetidos ──
  const seen = new Set();
  for (const c of all) {
    const kids = [...c.children].filter((k) => visible(k) && !ignored(k));
    if (kids.length < 2 || c.matches("tr,tbody,thead,select,datalist,ol,[role=listbox],svg")) continue;
    const by = new Map();
    for (const k of kids) {
      // El contenido incluye los valores de los campos (dos filas de un formulario con datos distintos no son repetidas)
      const vals = [...k.querySelectorAll("input,select,textarea")].map((x) => x.value).join("|");
      const t = `${(k.textContent || "").trim().replace(/\s+/g, " ")}${vals ? ` [${vals}]` : ""}`;
      if (t.length < 12 || k.matches("td,th,option,[role=gridcell]")) continue;
      const key = `${k.tagName}|${t}`;
      if (by.has(key) && !seen.has(key)) {
        seen.add(key);
        push("repetido", k, `«${t.slice(0, 50)}» dos veces`);
      }
      by.set(key, k);
    }
  }

  // ── Texto chico y contraste ──
  const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgb = (c) => {
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = "#000";
    cv.fillStyle = c;
    cv.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = cv.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const lum = ([r, g, b]) => [r, g, b].map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const mix = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const bgOf = (e) => {
    const stack = [];
    for (let n = e; n; n = n.parentElement) {
      const s = cs(n);
      if (s.backgroundImage !== "none" && !s.backgroundImage.startsWith("url(")) return null;
      if (s.backgroundImage.startsWith("url(")) return null;
      const c = rgb(s.backgroundColor);
      if (c[3] > 0.02) stack.push(c);
      if (c[3] > 0.98) break;
    }
    let acc = [255, 255, 255, 1];
    if (!stack.length || stack[stack.length - 1][3] <= 0.98) acc = rgb(cs(document.body).backgroundColor);
    for (let i = stack.length - 1; i >= 0; i--) acc = mix(stack[i], acc);
    return acc;
  };
  for (const e of all) {
    if (!ownText(e) || e.closest("[disabled],[aria-disabled=true],input,select,textarea,option")) continue;
    const s = cs(e);
    const size = parseFloat(s.fontSize);
    if (size < MIN_FONT) push("texto de menos de 12 px", e, `${size} px`);
    const fg = rgb(s.color);
    let op = 1;
    for (let n = e; n; n = n.parentElement) op *= parseFloat(cs(n).opacity);
    const bg = bgOf(e);
    if (!bg) continue;
    const f = mix([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const [a, b] = [lum(f), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const large = size >= 24 || (size >= 18.66 && parseInt(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5) - 0.05) push("contraste bajo (AA)", e, `${ratio.toFixed(2)}:1`);
  }

  // Uno por tipo y elemento
  const uniq = new Map();
  for (const i of out) uniq.set(`${i.tipo}|${i.sel}|${i.texto}`, i);
  return [...uniq.values()];
}
