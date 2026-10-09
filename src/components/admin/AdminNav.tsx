"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Resumen", exact: true },
  { href: "/admin/consultas", label: "Consultas" },
  { href: "/admin/clientes", label: "Clientes" },
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
            className={`whitespace-nowrap rounded-md px-3 py-2 text-[15px] ${
              active ? "bg-rose-light font-medium text-navy-deep" : "text-paper/80 hover:bg-paper/10 hover:text-paper"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
