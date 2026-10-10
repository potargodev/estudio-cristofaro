// PWA de Faro (personas y autónomos): se instala desde /faro, /ingresar o las
// pantallas personales (Vigía, Bitácora, Grupos). La web y el portal de
// Estudio Cristofaro siguen con su propio manifest (src/app/manifest.ts).
export const dynamic = "force-static";

export function GET() {
  const icon = (src: string, sizes: string, purpose = "any") => ({ src, sizes, type: "image/png", purpose });
  return new Response(
    JSON.stringify({
      id: "/faro-app",
      name: "Faro",
      short_name: "Faro",
      description: "Anotá tus gastos hablando con el Vigía, mirá tu Bitácora y dividí gastos con amigos.",
      lang: "es-AR",
      dir: "ltr",
      start_url: "/vigia?origen=app",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#1c2235",
      theme_color: "#1c2235",
      categories: ["finance", "productivity", "lifestyle"],
      icons: [icon("/icons/faro-192.png", "192x192"), icon("/icons/faro-512.png", "512x512"), icon("/icons/faro-maskable-512.png", "512x512", "maskable")],
      shortcuts: [
        { name: "Vigía", short_name: "Vigía", description: "Anotar un gasto", url: "/vigia?origen=atajo", icons: [{ src: "/icons/faro-copiloto-96.png", sizes: "96x96", type: "image/png" }] },
        { name: "Bitácora", url: "/bitacora", icons: [{ src: "/icons/faro-192.png", sizes: "192x192", type: "image/png" }] },
        { name: "Grupos de gastos", short_name: "Grupos", url: "/grupos", icons: [{ src: "/icons/faro-192.png", sizes: "192x192", type: "image/png" }] },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
