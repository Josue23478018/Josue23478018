"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { previewPayment, type LoanInput } from "@/lib/loans/calc";
import { addPayment, type FormState } from "../actions";

const NEXT_PERIOD_LABEL = {
  weekly: "de la siguiente semana",
  biweekly: "de la siguiente quincena",
  monthly: "del siguiente mes",
} as const;

export function PaymentForm({
  loanId,
  loan,
  currency,
  today,
  suggested,
}: {
  loanId: string;
  loan: LoanInput;
  currency: string;
  today: string;
  suggested?: number;
}) {
  const [state, formAction, pending] = useActionState(addPayment, {});
  const initial = { amount: suggested !== undefined ? String(suggested) : "", paidAt: today, note: "" };
  const [fields, setFields] = useState(initial);
  // Tasa escrita por el usuario, ligada al periodo para el que la escribió.
  const [rateInput, setRateInput] = useState<{ period: number; value: string } | null>(null);

  // Tras registrar un pago se limpian los campos (ajuste de estado durante el render).
  const [lastState, setLastState] = useState<FormState>(state);
  if (state !== lastState) {
    setLastState(state);
    if (state.message) {
      setFields(initial);
      setRateInput(null);
    }
  }

  const money = (n: number) => formatMoney(n, currency);
  const amount = fields.amount.trim() === "" ? Number.NaN : Number(fields.amount);
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(fields.paidAt) ? fields.paidAt : today;
  const base = previewPayment(loan, { amount, paid_at: paidAt }, today);
  const rateText = rateInput?.period === base.next.number ? rateInput.value : String(base.next.configuredRate);
  const rate = rateText.trim() === "" ? Number.NaN : Number(rateText);
  const preview = Number.isFinite(rate) && rate >= 0 ? previewPayment(loan, { amount, paid_at: paidAt }, today, rate) : base;
  const a = preview.allocation;
  const exceeds = preview.reason === "exceeds_debt";

  return (
    <form action={formAction} className="space-y-3 rounded-md bg-background p-3">
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className="input"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="Monto"
          aria-label="Monto"
          value={fields.amount}
          onChange={(e) => setFields({ ...fields, amount: e.target.value })}
        />
        <input
          className="input"
          name="paid_at"
          type="date"
          required
          min={loan.start_date}
          aria-label="Fecha del pago"
          value={fields.paidAt}
          onChange={(e) => setFields({ ...fields, paidAt: e.target.value })}
        />
        <button className="btn" disabled={pending || exceeds}>
          {pending ? "…" : "Registrar pago"}
        </button>
      </div>
      <input
        className="input"
        name="note"
        maxLength={500}
        placeholder="Nota (opcional)"
        aria-label="Nota"
        value={fields.note}
        onChange={(e) => setFields({ ...fields, note: e.target.value })}
      />
      <label className="block text-sm">
        <span className="text-muted">Tasa {NEXT_PERIOD_LABEL[loan.frequency]} (%)</span>
        <input
          className="input mt-1"
          name="next_rate"
          type="number"
          step="0.01"
          min="0"
          max="1000"
          value={rateText}
          onChange={(e) => setRateInput({ period: base.next.number, value: e.target.value })}
        />
      </label>

      {exceeds && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          El abono supera la deuda total a esa fecha. Máximo: {money(preview.maxAmount)}
        </p>
      )}
      {preview.valid && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
          {(
            [
              ["A interés", money(a.toInterest)],
              ["A capital", money(a.toPrincipal)],
              ["Interés pendiente", money(a.interestOutstanding)],
              ["Saldo pendiente (capital)", money(a.principalOutstanding)],
              ["Total adeudado tras el abono", money(a.totalOwed)],
              [
                `Periodo ${preview.next.number} (desde ${formatDate(preview.next.start)}) al ${preview.next.rate}%`,
                money(preview.next.projectedInterest),
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <FormMessage {...state} />
    </form>
  );
}
