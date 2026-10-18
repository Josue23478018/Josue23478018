"use client";

import { useActionState } from "react";
import { setPeriodRate } from "../actions";

export function RateForm({ loanId, periodNumber, rate }: { loanId: string; periodNumber: number; rate: number }) {
  const [state, formAction, pending] = useActionState(setPeriodRate, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="loan_id" value={loanId} />
      <input type="hidden" name="period_number" value={periodNumber} />
      <span className="relative inline-block w-28">
        <input
          className="input pr-8 text-right tabular-nums"
          name="rate"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          max="1000"
          required
          defaultValue={rate}
          aria-label={`Tasa del periodo ${periodNumber} (%)`}
          aria-invalid={state.error ? true : undefined}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
          %
        </span>
      </span>
      <button className="btn-secondary px-3" disabled={pending} aria-label={`Guardar tasa del periodo ${periodNumber}`}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
      {state.error && (
        <span role="alert" className="w-full text-xs text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
