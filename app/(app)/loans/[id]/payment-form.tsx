"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/ui";
import { addPayment } from "../actions";

export function PaymentForm({
  loanId,
  today,
  minDate,
  suggested,
}: {
  loanId: string;
  today: string;
  minDate: string;
  suggested?: number;
}) {
  const [state, formAction, pending] = useActionState(addPayment, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md bg-background p-3">
      <input type="hidden" name="loan_id" value={loanId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input className="input" name="amount" type="number" step="0.01" min="0.01" required placeholder="Monto" defaultValue={suggested} aria-label="Monto" />
        <input className="input" name="paid_at" type="date" required min={minDate} defaultValue={today} aria-label="Fecha del pago" />
        <button className="btn" disabled={pending}>
          {pending ? "…" : "Registrar pago"}
        </button>
      </div>
      <input className="input" name="note" maxLength={500} placeholder="Nota (opcional)" aria-label="Nota" />
      <FormMessage {...state} />
    </form>
  );
}
