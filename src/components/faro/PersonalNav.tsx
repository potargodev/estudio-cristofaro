"use client";

import { Bot, Home, KeyRound, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/personal", label: "Inicio", icon: Home, exact: true },
  { href: "/grupos", label: "Grupos de gastos", icon: Wallet },
  { href: "/admin/asistente", label: "Asistente IA", icon: Bot },
  { href: "/personal/cuenta", label: "Mi cuenta", icon: KeyRound },
];

export function PersonalNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const active = (i: (typeof ITEMS)[number]) => (i.exact ? pathname === i.href : pathname.startsWith(i.href));
  if (variant === "top")
    return (
      <nav aria-label="Faro Personal" className="hidden items-center gap-1 text-[14px] md:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={active(i) ? "page" : undefined} className={cn("px-3 py-2", active(i) ? "text-paper" : "text-paper/65 hover:text-paper")}>
            {i.label}
          </Link>
        ))}
      </nav>
    );
  return (
    <nav aria-label="Secciones" data-tour="nav" className="fixed inset-x-0 bottom-0 z-40 border-t border-paper/10 bg-night pb-[env(safe-area-inset-bottom)] text-paper md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link href={i.href} aria-current={active(i) ? "page" : undefined} className={cn("flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px]", active(i) ? "text-paper" : "text-paper/60")}>
              <i.icon className={cn("size-[22px]", active(i) && "text-gold")} strokeWidth={1.5} aria-hidden />
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
