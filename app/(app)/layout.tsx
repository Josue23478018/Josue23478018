import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { getUser } from "@/lib/supabase/server";

const NAV = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/loans", label: "Préstamos" },
  { href: "/borrowers", label: "Personas" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="font-semibold">
            Mis Préstamos
          </Link>
          <nav className="flex gap-4 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={signOut} className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{user?.email}</span>
            <button className="text-muted underline hover:text-foreground">Salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
