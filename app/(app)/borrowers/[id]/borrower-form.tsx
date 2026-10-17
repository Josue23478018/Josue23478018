"use client";

import { useActionState } from "react";
import { Field, FormMessage } from "@/components/ui";
import type { Borrower } from "@/lib/loans/queries";
import { updateBorrower } from "../actions";

export function BorrowerForm({ borrower }: { borrower: Borrower }) {
  const [state, formAction, pending] = useActionState(updateBorrower, {});
  return (
    <form action={formAction} className="card space-y-4">
      <input type="hidden" name="id" value={borrower.id} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nombre">
          <input className="input" name="name" required maxLength={200} defaultValue={borrower.name} />
        </Field>
        <Field label="Teléfono / WhatsApp">
          <input className="input" name="phone" type="tel" maxLength={50} defaultValue={borrower.phone ?? ""} />
        </Field>
        <Field label="Correo">
          <input className="input" name="email" type="email" maxLength={200} defaultValue={borrower.email ?? ""} />
        </Field>
      </div>
      <Field label="Notas">
        <textarea className="input" name="notes" rows={2} maxLength={500} defaultValue={borrower.notes ?? ""} />
      </Field>
      <FormMessage {...state} />
      <button className="btn" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
