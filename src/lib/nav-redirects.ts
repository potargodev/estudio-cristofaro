// Rutas viejas → su nuevo lugar en el esqueleto de navegación
// (docs/faro-producto.md §2.o). Las usa next.config.ts (redirects) y el script
// que las verifica (scripts/verificar-redirecciones.mjs). Nada se borró: todo
// cambió de lugar.

export const NAV_REDIRECTS: { source: string; destination: string }[] = [
  // Espacio personal: "Contador" junta la Red de estudios, Flotas y tu estudio
  { source: "/contador", destination: "/red" },
  // Un solo Vigía: el Asistente y las Aprobaciones son pestañas del Vigía del estudio
  { source: "/admin/asistente", destination: "/admin/vigia?tab=asistente" },
  { source: "/admin/aprobaciones", destination: "/admin/vigia?tab=propuestas" },
];
