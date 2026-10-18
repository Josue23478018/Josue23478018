"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Resumen", icon: "M3 12h4v8H3zM10 4h4v16h-4zM17 9h4v11h-4z" },
  { href: "/loans", label: "Préstamos", icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
  { href: "/borrowers", label: "Personas", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación horizontal para escritorio, dentro del encabezado. */
export function TopNav() {
  const isActive = useActive();
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
      {NAV.map((n) => {
        const active = isActive(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-accent/10 text-accent" : "text-muted hover:bg-subtle hover:text-foreground"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra de pestañas fija abajo en celular. */
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-accent" : "text-muted"}`}
              >
                <Icon d={n.icon} />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
