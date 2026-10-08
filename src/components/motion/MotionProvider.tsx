"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

// Carga solo las funciones de animación que usamos (componentes `m.*`) y respeta
// prefers-reduced-motion. Cada componente además muestra directo el estado final
// cuando el usuario pide menos movimiento (ver useReducedMotion en cada uno).
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
