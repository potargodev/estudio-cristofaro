import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "·";

/** Iniciales en un recuadro recto (organizaciones, personas) */
export function Avatar({ name, size = "md", tone = "light", className }: { name: string; size?: "sm" | "md" | "lg"; tone?: "light" | "dark"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center font-medium",
        size === "sm" ? "size-7 text-micro" : size === "lg" ? "size-14 text-title" : "size-9 text-meta",
        tone === "dark" ? "bg-paper/10 text-paper" : "border border-line bg-navy-soft text-ink",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
