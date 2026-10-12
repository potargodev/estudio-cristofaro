import type { NextConfig } from "next";
import { NAV_REDIRECTS } from "./src/lib/nav-redirects";

// Cabeceras de seguridad para todas las respuestas. La CSP deja scripts y
// estilos inline (los necesita Next sin nonce), pero ningún script, frame,
// formulario de terceros ni <object>; la app solo se embebe a sí misma (Vigía).
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // El Vigía graba audio y la lectura usa la cámara del celular (input file): solo este sitio
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Servidor autocontenido para la imagen Docker (Easypanel)
  output: "standalone",
  // Metadatos (title, description) siempre en el <head>, también en páginas
  // dinámicas como /diagnostico: no los manda "en streaming".
  htmlLimitedBots: /.*/,
  // pdf.js (unpdf) carga sus partes en runtime: se usa desde node_modules sin empaquetarlo
  serverExternalPackages: ["unpdf"],
  // "radix-ui" reexporta todos los primitivos: importar solo lo que se usa en cada página
  experimental: {
    optimizePackageImports: ["radix-ui"],
    // Formularios con archivos (documentos, comprobantes, importación): hasta 10 MB + margen
    serverActions: { bodySizeLimit: "12mb" },
  },
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
      // Tango pasó al hub de Conexiones
      { source: "/admin/integraciones", destination: "/admin/conexiones/tango", permanent: true },
      { source: "/admin/integraciones/tango/clientes", destination: "/admin/conexiones/tango/clientes", permanent: true },
      // El Copiloto pasó a llamarse Vigía
      { source: "/copiloto", destination: "/vigia", permanent: true },
      { source: "/copiloto/:path*", destination: "/vigia/:path*", permanent: true },
      { source: "/ayuda/copiloto/copiloto", destination: "/ayuda/vigia/vigia", permanent: true },
      // Gastos compartidos pasó a llamarse Grupos de gastos (§2.e): los links viejos siguen andando
      { source: "/gastos", destination: "/grupos", permanent: true },
      { source: "/gastos/:path*", destination: "/grupos/:path*", permanent: true },
      // Rutas del panel del estudio con el nombre de la visión de Faro (/estudio/…)
      { source: "/estudio", destination: "/admin", permanent: false },
      { source: "/estudio/:path*", destination: "/admin/:path*", permanent: false },
      // Esqueleto de navegación (§2.o): cada cosa en su nuevo lugar
      ...NAV_REDIRECTS.map((r) => ({ ...r, permanent: false })),
    ];
  },
};

export default nextConfig;
