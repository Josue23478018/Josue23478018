"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { previewPayment, type LoanInput } from "@/lib/loans/calc";
import { addPayment, type FormState } from "../actions";

const NEXT_PERIOD_LABEL = {
  weekly: "de la siguiente semana",
  biweekly: "de la siguiente quincena",
  monthly: "del siguiente mes",
} as const;

function BreakdownCard({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${emphasis ? "border-accent/40 bg-accent/5" : "border-border bg-surface"}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 tabular-nums break-words ${emphasis ? "text-xl font-semibold tracking-tight" : "text-base font-semibold"}`}>{value}</dd>
    </div>
  );
}

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
  const nextLabel = NEXT_PERIOD_LABEL[loan.frequency];

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      <input type="hidden" name="loan_id" value={loanId} />

      <div className="space-y-4 lg:col-start-1 lg:row-start-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Monto del abono"
            suffix={currency}
            hint={suggested !== undefined ? `Sugerido: ${money(suggested)} (interés pendiente)` : undefined}
          >
            <input
              className={`input pr-16 tabular-nums ${exceeds ? "border-danger focus:border-danger focus:ring-danger/25" : ""}`}
              name="amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              aria-invalid={exceeds || undefined}
              aria-describedby={exceeds ? "abono-excede" : undefined}
              value={fields.amount}
              onChange={(e) => setFields({ ...fields, amount: e.target.value })}
            />
          </Field>
          <Field label="Fecha del abono">
            <input
              className="input"
              name="paid_at"
              type="date"
              required
              min={loan.start_date}
              max={today}
              value={fields.paidAt}
              onChange={(e) => setFields({ ...fields, paidAt: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label={`Tasa ${nextLabel}`}
          suffix="%"
          hint={`Periodo ${base.next.number}, empieza el ${formatDate(base.next.start)}. Se guarda junto con el abono.`}
        >
          <input
            className="input pr-10 tabular-nums"
            name="next_rate"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="1000"
            value={rateText}
            onChange={(e) => setRateInput({ period: base.next.number, value: e.target.value })}
          />
        </Field>
        <Field label="Nota (opcional)">
          <input
            className="input"
            name="note"
            maxLength={500}
            placeholder="Ej.: transferencia, efectivo…"
            value={fields.note}
            onChange={(e) => setFields({ ...fields, note: e.target.value })}
          />
        </Field>
      </div>

      <div aria-live="polite" className="panel space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-sm font-semibold">Desglose del abono</h3>
          <p className="text-xs text-muted">
            Adeudado al {formatDate(paidAt)}: <span className="font-medium text-foreground tabular-nums">{money(preview.owedAtDate)}</span>
          </p>
        </div>

        {preview.valid ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              <BreakdownCard label="A interés" value={money(a.toInterest)} />
              <BreakdownCard label="A capital" value={money(a.toPrincipal)} />
              <BreakdownCard label="Interés pendiente" value={money(a.interestOutstanding)} />
              <BreakdownCard label="Saldo pendiente (capital)" value={money(a.principalOutstanding)} />
            </dl>
            <dl className="grid gap-3">
              <BreakdownCard label="Total adeudado tras el abono" value={money(a.totalOwed)} emphasis />
              <div className="rounded-lg border border-border bg-surface px-3 py-3">
                <dt className="text-xs text-muted">
                  Interés {nextLabel} · periodo {preview.next.number}, desde {formatDate(preview.next.start)}, al{" "}
                  <span className="font-medium text-foreground tabular-nums">{preview.next.rate}%</span>
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums">{money(preview.next.projectedInterest)}</dd>
                <dd className="text-xs text-muted">Si no hay más abonos a capital.</dd>
              </div>
            </dl>
          </>
        ) : exceeds ? (
          <p className="text-sm text-muted">Ajusta el monto para ver cómo se reparte el abono.</p>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            Escribe un monto para ver cuánto va a interés y cuánto a capital.
          </p>
        )}
      </div>

      <div className="space-y-3 lg:col-start-1 lg:row-start-2">
        {exceeds && (
          <div id="abono-excede" role="alert" className="flex gap-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <span aria-hidden="true" className="font-bold">
              !
            </span>
            <div>
              <p className="font-semibold">El abono supera la deuda total a esa fecha.</p>
              <p>
                Máximo permitido: <strong className="tabular-nums">{money(preview.maxAmount)}</strong>
              </p>
            </div>
          </div>
        )}
        <FormMessage {...state} />
        <button className="btn w-full sm:w-auto" disabled={pending || exceeds}>
          {pending ? "Registrando…" : "Registrar abono"}
        </button>
      </div>
    </form>
  );
}
