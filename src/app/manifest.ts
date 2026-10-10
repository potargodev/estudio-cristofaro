import type { MetadataRoute } from "next";

// App instalable (PWA): Android, iPhone/iPad, Windows y Mac. Abre en /app, que
// lleva a cada uno a lo suyo (portal del cliente o backoffice del estudio).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: "Estudio Cristofaro",
    short_name: "Cristofaro",
    description: "Tu empresa al día: vencimientos, documentos, sueldos y consultas con tu contador.",
    lang: "es-AR",
    dir: "ltr",
    start_url: "/app?origen=app",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    background_color: "#1c2235",
    theme_color: "#1c2235",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Vencimientos", url: "/portal/vencimientos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Nueva solicitud", url: "/portal/solicitudes/nueva", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Agendar una llamada", url: "/agendar", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
