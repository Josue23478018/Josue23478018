import Link from "next/link";
import { EmptyState, PageHeader, STATUS_LABEL, StatusBadge } from "@/components/ui";
import type { LoanStatus } from "@/lib/loans/calc";
import { listLoans } from "@/lib/loans/queries";
import { formatDate, formatMoney } from "@/lib/format";

const FILTERS: (LoanStatus | "all")[] = ["all", "active", "overdue", "paid", "cancelled"];

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const all = await listLoans();
  const loans = all.filter((l) => status === "all" || l.summary.status === status);
  const filterLabel = status === "all" ? "" : (STATUS_LABEL[status as LoanStatus] ?? status).toLowerCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Préstamos"
        description={
          all.length === 0
            ? "Registra tu primer préstamo para empezar."
            : `${loans.length} ${loans.length === 1 ? "préstamo" : "préstamos"}${filterLabel ? ` · ${filterLabel}` : ""}`
        }
        actions={
          <Link href="/loans/new" className="btn w-full sm:w-auto">
            Nuevo préstamo
          </Link>
        }
      />

      {all.length > 0 && (
        <nav aria-label="Filtrar por estado" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex w-max gap-2">
            {FILTERS.map((f) => {
              const active = status === f;
              return (
                <li key={f}>
                  <Link
                    href={f === "all" ? "/loans" : `/loans?status=${f}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors sm:min-h-9 ${active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface text-muted hover:text-foreground"}`}
                  >
                    {f === "all" ? "Todos" : STATUS_LABEL[f]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {all.length === 0 ? (
        <EmptyState
          title="Aún no tienes préstamos"
          description="Cuando registres un préstamo verás aquí el saldo, el interés pendiente y el próximo vencimiento de cada uno."
          action={
            <Link href="/loans/new" className="btn">
              Registrar el primero
            </Link>
          }
        />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No hay préstamos con este filtro"
          description={`Ningún préstamo está ${filterLabel || "en este estado"} ahora mismo.`}
          action={
            <Link href="/loans" className="btn-secondary">
              Ver todos
            </Link>
          }
        />
      ) : (
        <>
          {/* Celular: tarjetas */}
          <ul className="space-y-3 md:hidden">
            {loans.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/loans/${l.id}`}
                  className={`card block transition-colors hover:border-accent ${l.summary.status === "overdue" ? "border-l-4 border-l-danger" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{l.borrower.name}</p>
                    <StatusBadge status={l.summary.status} />
                  </div>
                  <p className="eyebrow mt-4">Saldo total</p>
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(l.summary.balance, l.currency)}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Interés pendiente</dt>
                      <dd className="font-medium tabular-nums">{formatMoney(l.summary.interestOutstanding, l.currency)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-xs text-muted">Próximo vencimiento</dt>
                      <dd className="font-medium">{l.summary.next ? formatDate(l.summary.next.due_date) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Prestado</dt>
                      <dd className="tabular-nums">{formatMoney(l.principal, l.currency)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla */}
          <div className="card hidden overflow-x-auto p-0 md:block sm:p-0">
            <table className="table">
              <caption className="sr-only">Lista de préstamos</caption>
              <thead>
                <tr>
                  <th scope="col">Persona</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Prestado
                  </th>
                  <th scope="col" className="num">
                    Interés pendiente
                  </th>
                  <th scope="col" className="num">
                    Saldo total
                  </th>
                  <th scope="col" className="num">
                    Próximo vencimiento
                  </th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-subtle/60">
                    <td>
                      <Link href={`/loans/${l.id}`} className="font-medium text-foreground underline-offset-2 hover:text-accent hover:underline">
                        {l.borrower.name}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={l.summary.status} />
                    </td>
                    <td className="num text-muted">{formatMoney(l.principal, l.currency)}</td>
                    <td className="num">{formatMoney(l.summary.interestOutstanding, l.currency)}</td>
                    <td className="num font-semibold">{formatMoney(l.summary.balance, l.currency)}</td>
                    <td className="num">{l.summary.next ? formatDate(l.summary.next.due_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
