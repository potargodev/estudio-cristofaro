// Modo claro / oscuro de la app: clave y script que lo aplica antes de pintar.
// Sin elección guardada («Sistema»), sigue al sistema y cambia con él.
const THEME_KEY = "faro-tema";
export const themeScript = `try{var k="${THEME_KEY}",q=matchMedia("(prefers-color-scheme: dark)"),f=function(){var t=localStorage.getItem(k),d=t==="dark"||(t!=="light"&&q.matches),e=document.documentElement;if(d)e.dataset.theme="dark";else delete e.dataset.theme};f();q.addEventListener("change",f)}catch(e){}`;

export type ThemeChoice = "light" | "dark" | "system";

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Guarda la elección (Sistema = sin elección guardada) y la aplica ya */
export function applyTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {}
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}
