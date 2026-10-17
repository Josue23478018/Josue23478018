"use client";

import { useActionState } from "react";
import { setPeriodRate } from "../actions";

export function RateForm({ loanId, periodNumber, rate }: { loanId: string; periodNumber: number; rate: number }) {
  const [state, formAction, pending] = useActionState(setPeriodRate, {});
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="loan_id" value={loanId} />
      <input type="hidden" name="period_number" value={periodNumber} />
      <input
        className="input w-20 px-2 py-1 tabular-nums"
        name="rate"
        type="number"
        step="0.01"
        min="0"
        max="1000"
        required
        defaultValue={rate}
        aria-label={`Tasa del periodo ${periodNumber}`}
      />
      <span className="text-muted">%</span>
      <button className="text-xs text-accent underline disabled:opacity-50" disabled={pending}>
        {pending ? "…" : "Guardar"}
      </button>
      {state.error && <span className="text-xs text-red-700 dark:text-red-400">{state.error}</span>}
    </form>
  );
}
