import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { BottomNav, TopNav } from "@/components/nav";
import { getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="min-h-screen">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
              MP
            </span>
            Mis Préstamos
          </Link>
          <TopNav />
          <form action={signOut} className="ml-auto flex min-w-0 items-center gap-3 text-sm">
            {user?.email && <span className="hidden max-w-56 truncate text-muted lg:inline">{user.email}</span>}
            <button className="btn-secondary btn-sm min-h-11 sm:min-h-9">Salir</button>
          </form>
        </div>
      </header>
      <main id="contenido" className="mx-auto max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
