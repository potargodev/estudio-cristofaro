import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    // URLs del sitio viejo → nuevas rutas
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/features.html", destination: "/servicios", permanent: true },
      { source: "/about.html", destination: "/equipo", permanent: true },
      { source: "/faq.html", destination: "/preguntas-frecuentes", permanent: true },
      { source: "/contact.html", destination: "/contacto", permanent: true },
    ];
  },
};

export default nextConfig;
