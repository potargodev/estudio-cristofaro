// Modo claro / oscuro de la app: clave y script que lo aplica antes de pintar.
// Sin elección guardada, sigue al sistema.
export const THEME_KEY = "faro-tema";
export const themeScript = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.dataset.theme="dark"}catch(e){}`;
