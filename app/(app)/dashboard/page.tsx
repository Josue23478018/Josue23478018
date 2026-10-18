import Link from "next/link";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { addDays, totalsByCurrency } from "@/lib/loans/calc";
import { listLoans, type LoanWithSummary } from "@/lib/loans/queries";
import { formatDate, formatMoney, today } from "@/lib/format";

const UPCOMING_DAYS = 7;

function Stat({ label, values, tone = "default" }: { label: string; values: [string, number][]; tone?: "default" | "danger" | "primary" }) {
  const toneClass = tone === "primary" ? "border-accent/40 bg-accent/5" : tone === "danger" && values.length > 0 ? "border-danger/40 bg-danger/5" : "";
  return (
    <div className={`card min-w-0 ${toneClass}`}>
      <p className="eyebrow">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-xl font-semibold text-muted sm:text-2xl">—</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {values.map(([cur, v]) => (
            <li
              key={cur}
              className={`text-xl font-semibold tracking-tight tabular-nums break-words sm:text-2xl ${tone === "danger" ? "text-danger" : ""}`}
            >
              {formatMoney(v, cur)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LoanRow({
  loan,
  amountLabel,
  amount,
  detail,
}: {
  loan: LoanWithSummary;
  amountLabel: string;
  amount: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={`/loans/${loan.id}`}
        className="-mx-2 flex min-h-14 items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-subtle"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{loan.borrower.name}</p>
            <StatusBadge status={loan.summary.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted">{detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted">{amountLabel}</p>
          <p className="num font-semibold">{amount}</p>
        </div>
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
      <PageHeader
        title="Resumen"
        description={`${open.length} ${open.length === 1 ? "préstamo abierto" : "préstamos abiertos"}`}
        actions={
          <Link href="/loans/new" className="btn w-full sm:w-auto">
            Nuevo préstamo
          </Link>
        }
      />

      {loans.length === 0 ? (
        <EmptyState
          title="Aún no tienes préstamos"
          description="Registra tu primer préstamo y aquí verás cuánto te deben, el interés pendiente y lo que vence pronto."
          action={
            <Link href="/loans/new" className="btn">
              Registrar el primero
            </Link>
          }
        />
      ) : (
        <>
          <section aria-label="Totales" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Stat label="Pendiente por cobrar" values={totalsByCurrency(open, "balance")} tone="primary" />
            <Stat label="Interés pendiente" values={totalsByCurrency(open, "interestOutstanding")} />
            <Stat label="Atrasado" values={totalsByCurrency(overdue, "overdueAmount")} tone="danger" />
            <Stat label="Cobrado en total" values={totalsByCurrency(loans, "paid")} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="atrasados" className={`card space-y-2 ${overdue.length > 0 ? "border-danger/40" : ""}`}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="atrasados" className={`h2 ${overdue.length > 0 ? "text-danger" : ""}`}>
                  Atrasados
                </h2>
                <span className="text-sm text-muted">{overdue.length}</span>
              </div>
              {overdue.length === 0 ? (
                <EmptyState compact title="Todo al día" description="Ningún préstamo está atrasado." />
              ) : (
                <ul className="divide-y divide-border">
                  {overdue.map((l) => (
                    <LoanRow
                      key={l.id}
                      loan={l}
                      amountLabel="Atrasado"
                      amount={formatMoney(l.summary.overdueAmount, l.currency)}
                      detail={`Saldo ${formatMoney(l.summary.balance, l.currency)}`}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="proximos" className="card space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="proximos" className="h2">
                  Vencen en {UPCOMING_DAYS} días
                </h2>
                <span className="text-sm text-muted">{upcoming.length}</span>
              </div>
              {upcoming.length === 0 ? (
                <EmptyState compact title="Nada vence esta semana" description="Los cortes de los próximos días aparecerán aquí." />
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((l) => (
                    <LoanRow
                      key={l.id}
                      loan={l}
                      amountLabel="Interés pendiente"
                      amount={formatMoney(l.summary.interestOutstanding, l.currency)}
                      detail={`Vence ${formatDate(l.summary.next!.due_date)} · saldo ${formatMoney(l.summary.balance, l.currency)}`}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
