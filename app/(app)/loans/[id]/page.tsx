import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import { getLoan } from "@/lib/loans/queries";
import { FREQUENCY_LABEL, formatDate, formatMoney, today } from "@/lib/format";
import { deleteLoan, deletePayment, setCancelled } from "../actions";
import { PaymentForm } from "./payment-form";

export default async function LoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const loan = await getLoan(id);
  if (!loan) notFound();

  const { summary } = loan;
  const money = (n: number) => formatMoney(n, loan.currency);
  const day = today();

  // Estado de cada cuota aplicando los pagos en orden.
  let remainingPaid = summary.paid;
  const rows = loan.installments.map((inst) => {
    const covered = Math.min(inst.amount_due, Math.max(0, remainingPaid));
    remainingPaid = Math.round((remainingPaid - covered) * 100) / 100;
    const pending = Math.round((inst.amount_due - covered) * 100) / 100;
    const state = pending === 0 ? "Pagada" : inst.due_date < day ? "Vencida" : covered > 0 ? "Parcial" : "Pendiente";
    return { ...inst, pending, state };
  });

  const plan =
    loan.repayment_type === "single"
      ? `Pago único el ${formatDate(loan.installments[0].due_date)}`
      : `${loan.installment_count} cuotas · ${FREQUENCY_LABEL[loan.installment_frequency!]}`;
  const interest =
    loan.interest_rate === 0 ? "Sin interés" : `${loan.interest_rate}% ${loan.interest_period === "monthly" ? "mensual" : "total"}`;

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
          ["Prestado", money(loan.principal)],
          ["Total a cobrar", money(summary.total)],
          ["Pagado", money(summary.paid)],
          ["Saldo", money(summary.balance)],
        ].map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted">
        Prestado el {formatDate(loan.start_date)} · {interest} · {plan}
        {loan.notes && <> · {loan.notes}</>}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Calendario</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-medium">#</th>
                <th className="py-1 font-medium">Vence</th>
                <th className="py-1 font-medium">Monto</th>
                <th className="py-1 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{r.number}</td>
                  <td className="py-2">{formatDate(r.due_date)}</td>
                  <td className="py-2 tabular-nums">{money(r.amount_due)}</td>
                  <td className={`py-2 ${r.state === "Vencida" ? "text-red-700 dark:text-red-400" : r.state === "Pagada" ? "text-muted" : ""}`}>
                    {r.state}
                    {r.state === "Parcial" || r.state === "Vencida" ? ` (${money(r.pending)})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Pagos recibidos</h2>
          {!loan.cancelled_at && summary.balance > 0 && <PaymentForm loanId={loan.id} today={day} suggested={summary.nextDue?.remaining} />}
          {loan.payments.length === 0 ? (
            <p className="text-sm text-muted">Sin pagos registrados.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {loan.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium tabular-nums">{money(p.amount)}</p>
                    <p className="text-muted">
                      {formatDate(p.paid_at)}
                      {p.note && ` · ${p.note}`}
                    </p>
                  </div>
                  <form action={deletePayment}>
                    <input type="hidden" name="id" value={p.id} />
                    <button className="text-xs text-muted underline hover:text-red-700">Borrar</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
