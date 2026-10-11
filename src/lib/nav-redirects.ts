// Rutas viejas → su nuevo lugar en el esqueleto de navegación
// (docs/faro-producto.md §2.o). Las usa next.config.ts (redirects) y el script
// que las verifica (scripts/verificar-redirecciones.mts). Nada se borró: todo
// cambió de lugar.

/** La ruta y todo lo que cuelga de ella */
function moved(from: string, to: string) {
  return [
    { source: from, destination: to },
    { source: `${from}/:path*`, destination: `${to}/:path*` },
  ];
}

export const NAV_REDIRECTS: { source: string; destination: string }[] = [
  // Espacio personal: "Contador" (/contador) junta tu conexión con un estudio, la Red y Flotas
  // La Red de estudios pasa a llamarse Red Contable (principios §15)
  ...moved("/red", "/red-contable"),
  // (las categorías de la ayuda no tienen página propia: solo se redirigen los artículos)
  { source: "/ayuda/red-de-estudios/:path*", destination: "/ayuda/red-contable/:path*" },
  // Un solo Vigía: el Asistente y las Aprobaciones son pestañas del Vigía del estudio
  { source: "/admin/asistente", destination: "/admin/vigia?tab=asistente" },
  { source: "/admin/aprobaciones", destination: "/admin/vigia?tab=propuestas" },
  // Estudio · Negocio: Comercial junta Consultas, Agenda y el Perfil en la Red
  ...moved("/admin/consultas", "/admin/comercial/consultas"),
  ...moved("/admin/agenda", "/admin/comercial/agenda"),
  ...moved("/admin/red", "/admin/comercial/red"),
  // Estudio · Configuración: una sola entrada con pestañas
  ...moved("/admin/usuarios", "/admin/configuracion/equipo"),
  ...moved("/admin/plan", "/admin/configuracion/plan"),
  ...moved("/admin/modulos", "/admin/configuracion/modulos"),
  ...moved("/admin/conexiones", "/admin/configuracion/conexiones"),
  ...moved("/admin/ia/configuracion", "/admin/configuracion/ia"),
  { source: "/admin/ia", destination: "/admin/configuracion/ia" },
  ...moved("/admin/rubros", "/admin/configuracion/rubros"),
  ...moved("/admin/contenidos", "/admin/configuracion/sitio"),
];
