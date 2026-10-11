// Rutas viejas → su nuevo lugar en el esqueleto de navegación
// (docs/faro-producto.md §2.o). Las usa next.config.ts (redirects) y el script
// que las verifica (scripts/verificar-redirecciones.mjs). Nada se borró: todo
// cambió de lugar.

export const NAV_REDIRECTS: { source: string; destination: string }[] = [
  // Espacio personal: "Contador" junta la Red de estudios, Flotas y tu estudio
  { source: "/contador", destination: "/red" },
];
