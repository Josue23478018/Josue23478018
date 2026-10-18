export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
          MP
        </span>
        <div>
          <p className="text-xl font-semibold tracking-tight">Mis Préstamos</p>
          <p className="text-sm text-muted">Registro personal de préstamos, abonos e intereses</p>
        </div>
      </div>
      <div className="card w-full max-w-sm space-y-6 sm:p-8">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted">Tus datos se guardan de forma privada en tu cuenta.</p>
    </main>
  );
}
