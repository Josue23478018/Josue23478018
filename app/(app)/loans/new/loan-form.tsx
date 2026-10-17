"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/ui";
import { buildSchedule, computeTotalDue, lastDueDate, type Frequency } from "@/lib/loans/calc";
import { CURRENCIES, formatDate, formatMoney } from "@/lib/format";
import type { Borrower } from "@/lib/loans/queries";
import { createLoan } from "../actions";

export function LoanForm({
  borrowers,
  today,
  defaultBorrowerId,
}: {
  borrowers: Borrower[];
  today: string;
  defaultBorrowerId?: string;
}) {
  const [state, formAction, pending] = useActionState(createLoan, {});
  const [borrowerMode, setBorrowerMode] = useState<"existing" | "new">(borrowers.length ? "existing" : "new");
  const [repaymentType, setRepaymentType] = useState<"single" | "installments">("single");
  const [preview, setPreview] = useState({
    principal: "",
    currency: "USD",
    start_date: today,
    interest_rate: "0",
    interest_period: "total" as "total" | "monthly",
    first_due_date: "",
    installment_frequency: "monthly" as Frequency,
    installment_count: "4",
  });
  const set = (k: keyof typeof preview) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setPreview((p) => ({ ...p, [k]: e.target.value }));

  // Vista previa del total y las cuotas con la misma lógica que usa el servidor.
  const principal = Number(preview.principal);
  const count = Number(preview.installment_count);
  const ready =
    principal > 0 &&
    preview.first_due_date >= preview.start_date &&
    (repaymentType === "single" || (Number.isInteger(count) && count >= 1 && count <= 360));
  const plan =
    repaymentType === "single"
      ? { type: "single" as const, firstDueDate: preview.first_due_date }
      : { type: "installments" as const, firstDueDate: preview.first_due_date, frequency: preview.installment_frequency, count };
  const total = ready
    ? computeTotalDue({
        principal,
        rate: Number(preview.interest_rate) || 0,
        period: preview.interest_period,
        startDate: preview.start_date,
        endDate: lastDueDate(plan),
      })
    : 0;
  const schedule = ready ? buildSchedule({ total, ...plan }) : [];

  return (
    <form action={formAction} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold">Persona</h2>
        {borrowers.length > 0 && (
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="borrower_mode" value="existing" checked={borrowerMode === "existing"} onChange={() => setBorrowerMode("existing")} />
              Existente
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="borrower_mode" value="new" checked={borrowerMode === "new"} onChange={() => setBorrowerMode("new")} />
              Nueva
            </label>
          </div>
        )}
        {borrowers.length === 0 && <input type="hidden" name="borrower_mode" value="new" />}
        {borrowerMode === "existing" ? (
          <Field label="Selecciona la persona">
            <select className="input" name="borrower_id" defaultValue={defaultBorrowerId} required>
              {borrowers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre">
              <input className="input" name="borrower_name" required maxLength={200} />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <input className="input" name="borrower_phone" type="tel" maxLength={50} />
            </Field>
            <Field label="Correo">
              <input className="input" name="borrower_email" type="email" maxLength={200} />
            </Field>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Préstamo</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monto prestado">
            <input className="input" name="principal" type="number" step="0.01" min="0.01" required value={preview.principal} onChange={set("principal")} />
          </Field>
          <Field label="Moneda">
            <select className="input" name="currency" value={preview.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del préstamo">
            <input className="input" name="start_date" type="date" required value={preview.start_date} onChange={set("start_date")} />
          </Field>
          <Field label="Interés (%)">
            <input className="input" name="interest_rate" type="number" step="0.01" min="0" required value={preview.interest_rate} onChange={set("interest_rate")} />
          </Field>
          <Field
            label="Tipo de interés"
            hint={preview.interest_period === "monthly" ? "Simple, por cada mes de plazo (fracción de mes cuenta como mes)" : "Se aplica una sola vez"}
          >
            <select className="input" name="interest_period" value={preview.interest_period} onChange={set("interest_period")}>
              <option value="total">Total (una vez)</option>
              <option value="monthly">Mensual</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Plan de pago</h2>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="repayment_type" value="single" checked={repaymentType === "single"} onChange={() => setRepaymentType("single")} />
            Pago único
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="repayment_type" value="installments" checked={repaymentType === "installments"} onChange={() => setRepaymentType("installments")} />
            En cuotas
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={repaymentType === "single" ? "Fecha de pago" : "Primera cuota"}>
            <input className="input" name="first_due_date" type="date" required min={preview.start_date} value={preview.first_due_date} onChange={set("first_due_date")} />
          </Field>
          {repaymentType === "installments" && (
            <>
              <Field label="Frecuencia">
                <select className="input" name="installment_frequency" value={preview.installment_frequency} onChange={set("installment_frequency")}>
                  <option value="weekly">Semanal</option>
                  <option value="biweekly">Quincenal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </Field>
              <Field label="Número de cuotas">
                <input className="input" name="installment_count" type="number" min="1" max="360" step="1" required value={preview.installment_count} onChange={set("installment_count")} />
              </Field>
            </>
          )}
        </div>
        <Field label="Notas">
          <textarea className="input" name="notes" rows={2} maxLength={500} />
        </Field>
      </section>

      {ready && (
        <section className="card space-y-2">
          <p className="text-sm text-muted">Total a cobrar</p>
          <p className="text-2xl font-semibold tabular-nums">{formatMoney(total, preview.currency)}</p>
          {schedule.length > 1 && (
            <ul className="max-h-48 overflow-y-auto text-sm text-muted">
              {schedule.map((s) => (
                <li key={s.number} className="flex justify-between py-0.5 tabular-nums">
                  <span>
                    Cuota {s.number} · {formatDate(s.due_date)}
                  </span>
                  <span>{formatMoney(s.amount_due, preview.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <FormMessage error={state.error} />
      <button className="btn" disabled={pending}>
        {pending ? "Guardando…" : "Guardar préstamo"}
      </button>
    </form>
  );
}
