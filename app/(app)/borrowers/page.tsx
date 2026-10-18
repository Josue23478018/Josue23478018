import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { listBorrowers, listLoans } from "@/lib/loans/queries";
import { totalsByCurrency } from "@/lib/loans/calc";
import { formatMoney } from "@/lib/format";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

export default async function BorrowersPage() {
  const [borrowers, loans] = await Promise.all([listBorrowers(), listLoans()]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personas"
        description={borrowers.length > 0 ? `${borrowers.length} ${borrowers.length === 1 ? "persona" : "personas"}` : undefined}
      />
      {borrowers.length === 0 ? (
        <EmptyState
          title="Aún no hay personas"
          description="Las personas se agregan al registrar un préstamo."
          action={
            <Link href="/loans/new" className="btn">
              Registrar un préstamo
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {borrowers.map((b) => {
            const own = loans.filter((l) => l.borrower.id === b.id);
            const open = own.filter((l) => l.summary.status === "active" || l.summary.status === "overdue");
            const hasOverdue = own.some((l) => l.summary.status === "overdue");
            const balances = totalsByCurrency(open, "balance");
            return (
              <li key={b.id}>
                <Link href={`/borrowers/${b.id}`} className="card flex h-full flex-col gap-4 transition-colors hover:border-accent">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                      {initials(b.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{b.name}</p>
                      <p className="truncate text-sm text-muted">{[b.phone, b.email].filter(Boolean).join(" · ") || "Sin contacto"}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3 text-sm">
                    <span className="text-muted">
                      {own.length} {own.length === 1 ? "préstamo" : "préstamos"}
                      {hasOverdue && <span className="ml-2 font-medium text-danger">! con atraso</span>}
                    </span>
                    <span className="text-right">
                      <span className="block text-xs text-muted">Debe</span>
                      {balances.length === 0 ? (
                        <span className="num block font-semibold text-muted">—</span>
                      ) : (
                        balances.map(([cur, v]) => (
                          <span key={cur} className="num block font-semibold">
                            {formatMoney(v, cur)}
                          </span>
                        ))
                      )}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
