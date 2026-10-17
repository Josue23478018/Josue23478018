import Link from "next/link";
import { StatusBadge } from "@/components/ui";
import { addDays } from "@/lib/loans/calc";
import { listLoans, type LoanWithSummary } from "@/lib/loans/queries";
import { formatDate, formatMoney, today } from "@/lib/format";

const UPCOMING_DAYS = 7;

// Suma montos agrupados por moneda (no se mezclan monedas distintas).
function totalsByCurrency(loans: LoanWithSummary[], pick: (l: LoanWithSummary) => number) {
  const totals = new Map<string, number>();
  for (const l of loans) totals.set(l.currency, (totals.get(l.currency) ?? 0) + pick(l));
  return [...totals.entries()].filter(([, v]) => v > 0);
}

function Stat({ label, values }: { label: string; values: [string, number][] }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      {values.length === 0 ? (
        <p className="mt-1 text-2xl font-semibold">—</p>
      ) : (
        values.map(([cur, v]) => (
          <p key={cur} className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMoney(v, cur)}
          </p>
        ))
      )}
    </div>
  );
}

function LoanRow({ loan, detail }: { loan: LoanWithSummary; detail: string }) {
  return (
    <li>
      <Link href={`/loans/${loan.id}`} className="flex items-center justify-between gap-3 py-3 hover:opacity-80">
        <div>
          <p className="font-medium">{loan.borrower.name}</p>
          <p className="text-sm text-muted">{detail}</p>
        </div>
        <StatusBadge status={loan.summary.status} />
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const loans = await listLoans();
  const open = loans.filter((l) => l.summary.status === "active" || l.summary.status === "overdue");
  const overdue = open.filter((l) => l.summary.status === "overdue");
  const limit = addDays(today(), UPCOMING_DAYS);
  const upcoming = open
    .filter((l) => l.summary.next && l.summary.next.due_date <= limit)
    .sort((a, b) => a.summary.next!.due_date.localeCompare(b.summary.next!.due_date));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <Link href="/loans/new" className="btn">
          Nuevo préstamo
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pendiente por cobrar" values={totalsByCurrency(open, (l) => l.summary.balance)} />
        <Stat label="Interés pendiente" values={totalsByCurrency(open, (l) => l.summary.interestOutstanding)} />
        <Stat label="Atrasado" values={totalsByCurrency(overdue, (l) => l.summary.overdueAmount)} />
        <Stat label="Cobrado en total" values={totalsByCurrency(loans, (l) => l.summary.paid)} />
      </div>

      <section className="card">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Atrasados ({overdue.length})</h2>
        {overdue.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ningún préstamo atrasado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {overdue.map((l) => (
              <LoanRow
                key={l.id}
                loan={l}
                detail={`${formatMoney(l.summary.overdueAmount, l.currency)} atrasado · saldo ${formatMoney(l.summary.balance, l.currency)}`}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">Cortes de interés en los próximos {UPCOMING_DAYS} días ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ningún corte esta semana.</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((l) => (
              <LoanRow
                key={l.id}
                loan={l}
                detail={`Corte ${formatDate(l.summary.next!.due_date)} · interés ${formatMoney(l.summary.next!.projectedInterest, l.currency)} (${l.summary.next!.rate}%) · saldo ${formatMoney(l.summary.balance, l.currency)}`}
              />
            ))}
          </ul>
        )}
      </section>

      {loans.length === 0 && (
        <p className="text-center text-muted">
          Aún no tienes préstamos.{" "}
          <Link href="/loans/new" className="text-accent underline">
            Registra el primero
          </Link>
          .
        </p>
      )}
    </div>
  );
}
