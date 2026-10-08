"use client";

import { m, useReducedMotion } from "motion/react";

type Tag = "h1" | "h2" | "h3" | "p" | "div";

/**
 * Revelado al hacer scroll para los títulos de sección: opacidad y 12 px de
 * desplazamiento, una sola vez. A propósito no se usa en tarjetas ni listas.
 */
export function Reveal({
  as = "h2",
  className,
  children,
  id,
}: {
  as?: Tag;
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp
      id={id}
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}
