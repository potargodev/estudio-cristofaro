"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Resumen", exact: true },
  { href: "/admin/consultas", label: "Consultas" },
  { href: "/admin/agenda", label: "Agenda" },
  { href: "/admin/organizaciones", label: "Organizaciones" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/contenidos", label: "Contenidos" },
  { href: "/admin/usuarios", label: "Usuarios", adminOnly: true },
  { href: "/admin/integraciones", label: "Integraciones", adminOnly: true },
];

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Backoffice" className="flex gap-1 overflow-x-auto md:flex-col">
      {items
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b px-3 py-2 text-[15px] transition-colors md:border-b-0 md:border-l ${
              active ? "border-rose-light bg-paper/[0.04] text-paper" : "border-transparent text-paper/65 hover:text-paper"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
