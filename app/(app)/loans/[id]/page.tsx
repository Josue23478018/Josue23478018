import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink, EmptyState, Metric, PageHeader, StatusBadge } from "@/components/ui";
import { getLoan, toLoanInput } from "@/lib/loans/queries";
import { FREQUENCY_LABEL, formatDate, formatMoney, today } from "@/lib/format";
import { deleteLoan, deletePayment, setCancelled } from "../actions";
import { PaymentForm } from "./payment-form";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const loan = await getLoan(id, 0);
  if (!loan) notFound();

  const { summary } = loan;
  const money = (n: number) => formatMoney(n, loan.currency);
  const day = today();
  const allocations = new Map(summary.allocations.map((a) => [a.id, a]));
  const contact = [loan.borrower.phone, loan.borrower.email].filter(Boolean).join(" · ") || "Sin contacto";
  const canPay = !loan.cancelled_at && summary.balance > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        back={<BackLink href="/loans">Préstamos</BackLink>}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 break-words">{loan.borrower.name}</span>
            <StatusBadge status={summary.status} />
          </span>
        }
        description={
          <>
            {contact} ·{" "}
            <Link href={`/borrowers/${loan.borrower.id}`} className="link">
              Editar persona
            </Link>
          </>
        }
        actions={
          <>
            <form action={setCancelled} className="flex-1 sm:flex-none">
              <input type="hidden" name="id" value={loan.id} />
              <input type="hidden" name="cancel" value={loan.cancelled_at ? "false" : "true"} />
              <button className="btn-secondary w-full">{loan.cancelled_at ? "Reactivar" : "Marcar cancelado"}</button>
            </form>
            <form action={deleteLoan} className="flex-1 sm:flex-none">
              <input type="hidden" name="id" value={loan.id} />
              <ConfirmButton
                className="btn-danger w-full"
                message={`¿Eliminar el préstamo de ${loan.borrower.name}? Se borrarán también sus abonos y tasas. Esta acción no se puede deshacer.`}
              >
                Eliminar
              </ConfirmButton>
            </form>
          </>
        }
      />

      {summary.overdueAmount > 0 && (
        <p role="status" className="flex gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span aria-hidden="true" className="font-bold">
            !
          </span>
          <span>
            Este préstamo tiene <strong className="tabular-nums">{money(summary.overdueAmount)}</strong> atrasado.
          </span>
        </p>
      )}

      <section aria-labelledby="resumen" className="space-y-3">
        <h2 id="resumen" className="sr-only">
          Resumen del préstamo
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Metric label="Capital pendiente" value={money(summary.principalOutstanding)} sub={`de ${money(loan.principal)} prestado`} />
          <Metric label="Interés pendiente" value={money(summary.interestOutstanding)} sub={`${money(summary.interestCharged)} generado en total`} />
          <Metric
            label="Total adeudado"
            value={money(summary.balance)}
            tone={summary.status === "overdue" ? "danger" : "primary"}
            sub="Capital + interés pendiente"
          />
          <Metric label="Pagado" value={money(summary.paid)} sub={`${loan.payments.length} ${loan.payments.length === 1 ? "abono" : "abonos"}`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {summary.next ? (
          <div className="card border-accent/40 bg-accent/5">
            <p className="eyebrow">Próximo corte</p>
            <p className="mt-2 text-sm">
              El <strong>{formatDate(summary.next.due_date)}</strong> vence el periodo actual y empieza el periodo {summary.next.number} al{" "}
              <strong className="tabular-nums">{summary.next.rate}%</strong>. Si no hay más abonos a capital, se cobrarán
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{money(summary.next.projectedInterest)}</p>
            <p className="text-xs text-muted">de interés en ese periodo</p>
          </div>
        ) : (
          <div className="card">
            <p className="eyebrow">Próximo corte</p>
            <p className="mt-2 text-sm text-muted">No hay cortes pendientes para este préstamo.</p>
          </div>
        )}
        <dl className="card grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-1">
          <div>
            <dt className="text-xs text-muted">Fecha del préstamo</dt>
            <dd className="font-medium">{formatDate(loan.start_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Interés</dt>
            <dd className="font-medium">
              {FREQUENCY_LABEL[loan.period_frequency]}, <span className="tabular-nums">{loan.default_rate}%</span> por defecto
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Fecha límite</dt>
            <dd className="font-medium">{loan.due_date ? formatDate(loan.due_date) : "Sin fecha límite"}</dd>
          </div>
          {loan.notes && (
            <div className="col-span-2 lg:col-span-1">
              <dt className="text-xs text-muted">Notas</dt>
              <dd className="break-words">{loan.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      <section aria-labelledby="abono" className="card space-y-4">
        <div className="space-y-1">
          <h2 id="abono" className="h2">
            Registrar abono
          </h2>
          <p className="text-sm text-muted">Cada abono cubre primero el interés pendiente; el resto reduce el capital.</p>
        </div>
        {canPay ? (
          <PaymentForm
            paymentsCount={loan.payments.length}
            loanId={loan.id}
            loan={toLoanInput(loan)}
            currency={loan.currency}
            today={day}
            suggested={summary.interestOutstanding || undefined}
          />
        ) : (
          <EmptyState
            compact
            title={loan.cancelled_at ? "Préstamo cancelado" : "Préstamo pagado por completo"}
            description={
              loan.cancelled_at ? "Reactívalo para volver a registrar abonos." : "No queda saldo pendiente, así que no hace falta registrar más abonos."
            }
          />
        )}
      </section>

      <section aria-labelledby="historial" className="card space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="historial" className="h2">
            Historial de abonos
          </h2>
          <span className="text-sm text-muted">{loan.payments.length}</span>
        </div>
        {loan.payments.length === 0 ? (
          <EmptyState compact title="Sin abonos registrados" description="Los abonos que registres aparecerán aquí con su desglose." />
        ) : (
          <>
            {/* Celular: tarjetas */}
            <ul className="space-y-3 lg:hidden">
              {loan.payments.map((p) => {
                const a = allocations.get(p.id);
                return (
                  <li key={p.id} className="panel space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold tracking-tight tabular-nums">{money(p.amount)}</p>
                        <p className="text-sm text-muted">{formatDate(p.paid_at)}</p>
                      </div>
                      <form action={deletePayment}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton
                          className="btn-danger btn-sm min-h-11"
                          aria-label={`Borrar abono de ${money(p.amount)} del ${formatDate(p.paid_at)}`}
                          message={`¿Borrar el abono de ${money(p.amount)} del ${formatDate(p.paid_at)}? Los saldos se recalcularán.`}
                        >
                          Borrar
                        </ConfirmButton>
                      </form>
                    </div>
                    {a && (
                      <>
                        <dl className="grid grid-cols-2 gap-2 text-sm">
                          {(
                            [
                              ["A interés", a.toInterest],
                              ["A capital", a.toPrincipal],
                              ["Interés pendiente", a.interestOutstanding],
                              ["Capital pendiente", a.principalOutstanding],
                            ] as const
                          ).map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-surface px-3 py-2">
                              <dt className="text-xs text-muted">{label}</dt>
                              <dd className="num text-left font-medium">{money(value)}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
                          <span className="text-muted">Total adeudado tras el abono</span>
                          <span className="num font-semibold">{money(a.totalOwed)}</span>
                        </div>
                        {a.excess > 0 && (
                          <p className="flex items-baseline justify-between gap-3 text-sm font-medium text-danger">
                            <span>! Pagado de más</span>
                            <span className="num">{money(a.excess)}</span>
                          </p>
                        )}
                      </>
                    )}
                    {p.note && <p className="text-sm break-words text-muted">{p.note}</p>}
                  </li>
                );
              })}
            </ul>

            {/* Escritorio: tabla */}
            <div className="-mx-6 hidden overflow-x-auto lg:block">
              <table className="table">
                <caption className="sr-only">Historial de abonos con su desglose</caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col" className="num">
                      Monto
                    </th>
                    <th scope="col" className="num">
                      A interés
                    </th>
                    <th scope="col" className="num">
                      A capital
                    </th>
                    <th scope="col" className="num">
                      Interés pend.
                    </th>
                    <th scope="col" className="num">
                      Capital pend.
                    </th>
                    <th scope="col" className="num">
                      Total adeudado
                    </th>
                    <th scope="col">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loan.payments.map((p) => {
                    const a = allocations.get(p.id);
                    return (
                      <tr key={p.id}>
                        <td className="whitespace-nowrap">
                          {formatDate(p.paid_at)}
                          {p.note && <span className="block max-w-48 truncate text-xs text-muted" title={p.note}>{p.note}</span>}
                          {a && a.excess > 0 && (
                            <span className="block text-xs font-medium text-danger">! {money(a.excess)} de más</span>
                          )}
                        </td>
                        <td className="num font-semibold">{money(p.amount)}</td>
                        <td className="num">{a ? money(a.toInterest) : "—"}</td>
                        <td className="num">{a ? money(a.toPrincipal) : "—"}</td>
                        <td className="num text-muted">{a ? money(a.interestOutstanding) : "—"}</td>
                        <td className="num text-muted">{a ? money(a.principalOutstanding) : "—"}</td>
                        <td className="num font-medium">{a ? money(a.totalOwed) : "—"}</td>
                        <td className="text-right">
                          <form action={deletePayment}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmButton
                              className="btn-danger btn-sm"
                              aria-label={`Borrar abono de ${money(p.amount)} del ${formatDate(p.paid_at)}`}
                              message={`¿Borrar el abono de ${money(p.amount)} del ${formatDate(p.paid_at)}? Los saldos se recalcularán.`}
                            >
                              Borrar
                            </ConfirmButton>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

    </div>
  );
}
