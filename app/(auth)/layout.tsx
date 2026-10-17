export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold">Mis Préstamos</h1>
        {children}
      </div>
    </main>
  );
}
