import { cn } from "@/lib/utils";

type Tag = "h1" | "h2" | "p" | "span" | "div";

/**
 * Titular que entra con máscara solo con CSS: cada palabra sube desde abajo
 * (110% → 0) con un escalonado corto, así que se lee como una entrada línea por
 * línea y empieza en el primer cuadro, sin esperar JavaScript (no demora el
 * LCP). `intro`: anima solo durante la intro de la home (clase .intro).
 * Con reduced-motion queda fijo.
 */
export function MaskText({
  as: Tag = "h1",
  children,
  className,
  id,
  intro = false,
  ...rest
}: { as?: Tag; children: string; className?: string; id?: string; intro?: boolean } & React.HTMLAttributes<HTMLElement>) {
  const words = children.split(/\s+/).filter(Boolean);
  return (
    <Tag id={id} className={cn(intro ? "mask-intro" : "mask-text", className)} {...rest}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="mw">
            <span className="mw-in" style={{ "--i": i } as React.CSSProperties}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
