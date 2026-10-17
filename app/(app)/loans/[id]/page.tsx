import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import { getLoan } from "@/lib/loans/queries";
import { FREQUENCY_LABEL, formatDate, formatMoney, today } from "@/lib/format";
import { deleteLoan, deletePayment, resetPeriodRate, setCancelled } from "../actions";
import { PaymentForm } from "./payment-form";
import { RateForm } from "./rate-form";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const loan = await getLoan(id);
  if (!loan) notFound();

  const { summary } = loan;
  const money = (n: number) => formatMoney(n, loan.currency);
  const day = today();
  const allocations = new Map(summary.allocations.map((a) => [a.id, a]));
  const periods = [...summary.periods].reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/loans" className="text-sm text-muted hover:underline">
            ← Préstamos
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {loan.borrower.name} <StatusBadge status={summary.status} />
          </h1>
          <p className="text-sm text-muted">
            {[loan.borrower.phone, loan.borrower.email].filter(Boolean).join(" · ") || "Sin contacto"} ·{" "}
            <Link href={`/borrowers/${loan.borrower.id}`} className="underline">
              editar persona
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <form action={setCancelled}>
            <input type="hidden" name="id" value={loan.id} />
            <input type="hidden" name="cancel" value={loan.cancelled_at ? "false" : "true"} />
            <button className="btn-secondary">{loan.cancelled_at ? "Reactivar" : "Marcar cancelado"}</button>
          </form>
          <form action={deleteLoan}>
            <input type="hidden" name="id" value={loan.id} />
            <button className="btn-secondary text-red-700 dark:text-red-400">Eliminar</button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Principal pendiente", money(summary.principalOutstanding), `de ${money(loan.principal)} prestado`],
          ["Interés pendiente", money(summary.interestOutstanding), `${money(summary.interestCharged)} generado en total`],
          ["Saldo total", money(summary.balance), summary.overdueAmount > 0 ? `${money(summary.overdueAmount)} atrasado` : ""],
          ["Pagado", money(summary.paid), ""],
        ].map(([label, value, sub]) => (
          <div key={label} className="card">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
        ))}
      </div>

      <p className="text-sm text-muted">
        Prestado el {formatDate(loan.start_date)} · interés compuesto {FREQUENCY_LABEL[loan.period_frequency].toLowerCase()},{" "}
        {loan.default_rate}% por defecto
        {loan.due_date && <> · fecha límite {formatDate(loan.due_date)}</>}
        {loan.notes && <> · {loan.notes}</>}
      </p>

      {summary.next && (
        <p className="card text-sm">
          Próximo corte: <strong>{formatDate(summary.next.due_date)}</strong> (periodo {summary.next.number}, {summary.next.rate}%). Si no
          hay más abonos se cobrarán <strong className="tabular-nums">{money(summary.next.projectedInterest)}</strong> de interés.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Periodos</h2>
          <p className="text-xs text-muted">
            Puedes cambiar la tasa de cualquier periodo, pasado o futuro; los saldos se recalculan automáticamente.
          </p>
          {periods.length === 0 ? (
            <p className="text-sm text-muted">Sin periodos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 pr-2 font-medium">#</th>
                    <th className="py-1 pr-2 font-medium">Corte</th>
                    <th className="py-1 pr-2 font-medium">Tasa</th>
                    <th className="py-1 pr-2 font-medium">Saldo base</th>
                    <th className="py-1 font-medium">Interés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {periods.map((p) => (
                    <tr key={p.number} className={p.accrued ? "" : "text-muted"}>
                      <td className="py-2 pr-2">{p.number}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {formatDate(p.end)}
                        {!p.accrued && <span className="block text-xs">{p.end === summary.next?.due_date ? "próximo" : "futuro"}</span>}
                      </td>
                      <td className="py-2 pr-2">
                        <RateForm key={`${p.number}-${p.rate}`} loanId={loan.id} periodNumber={p.number} rate={p.rate} />
                        {p.overridden && (
                          <form action={resetPeriodRate}>
                            <input type="hidden" name="loan_id" value={loan.id} />
                            <input type="hidden" name="period_number" value={p.number} />
                            <button className="text-xs text-muted underline">usar {loan.default_rate}% por defecto</button>
                          </form>
                        )}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{p.base !== null ? money(p.base) : "—"}</td>
                      <td className="py-2 tabular-nums">{p.interest !== null ? money(p.interest) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Abonos</h2>
          <p className="text-xs text-muted">Cada abono cubre primero el interés pendiente; el resto reduce el principal.</p>
          {!loan.cancelled_at && summary.balance > 0 && (
            <PaymentForm loanId={loan.id} today={day} minDate={loan.start_date} suggested={summary.interestOutstanding || undefined} />
          )}
          {loan.payments.length === 0 ? (
            <p className="text-sm text-muted">Sin abonos registrados.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {loan.payments.map((p) => {
                const a = allocations.get(p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="font-medium tabular-nums">
                        {money(p.amount)} <span className="font-normal text-muted">· {formatDate(p.paid_at)}</span>
                      </p>
                      {a && (
                        <p className="text-xs text-muted tabular-nums">
                          {money(a.toInterest)} a interés · {money(a.toPrincipal)} a principal
                          {a.excess > 0 && <> · {money(a.excess)} de más</>}
                        </p>
                      )}
                      {p.note && <p className="text-xs text-muted">{p.note}</p>}
                    </div>
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-xs text-muted underline hover:text-red-700">Borrar</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
