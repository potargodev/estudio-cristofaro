import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Servidor autocontenido para la imagen Docker (Easypanel)
  output: "standalone",
  // Metadatos (title, description) siempre en el <head>, también en páginas
  // dinámicas como /diagnostico: no los manda "en streaming".
  htmlLimitedBots: /.*/,
  // "radix-ui" reexporta todos los primitivos: importar solo lo que se usa en cada página
  experimental: {
    optimizePackageImports: ["radix-ui"],
    // Formularios con archivos (documentos, comprobantes, importación): hasta 10 MB + margen
    serverActions: { bodySizeLimit: "12mb" },
  },
  eslint: { ignoreDuringBuilds: true },
  // Fotos del hero y del equipo: AVIF/WebP en el tamaño justo para cada pantalla
  images: { formats: ["image/avif", "image/webp"], qualities: [70, 75, 80] },
  async redirects() {
    // URLs del sitio viejo → nuevas rutas
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/features.html", destination: "/servicios", permanent: true },
      { source: "/about.html", destination: "/equipo", permanent: true },
      { source: "/faq.html", destination: "/preguntas-frecuentes", permanent: true },
      { source: "/contact.html", destination: "/contacto", permanent: true },
      // Landings de segmentos viejos (el público pasó a ser PyMEs de servicios)
      { source: "/monotributistas", destination: "/#para-quien", permanent: true },
      { source: "/pymes-y-sociedades", destination: "/#para-quien", permanent: true },
      { source: "/emprendedores", destination: "/#para-quien", permanent: true },
      { source: "/empleadores", destination: "/servicios/laboral", permanent: true },
      // Los clientes pasaron a ser organizaciones (mismos ids)
      { source: "/admin/clientes", destination: "/admin/organizaciones", permanent: true },
      { source: "/admin/clientes/nuevo", destination: "/admin/organizaciones/nueva", permanent: true },
      { source: "/admin/clientes/:id", destination: "/admin/organizaciones/:id", permanent: true },
    ];
  },
};

export default nextConfig;
