"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/ui";
import { computeLoan, cutDate, type Frequency } from "@/lib/loans/calc";
import { CURRENCIES, FREQUENCY_LABEL, formatDate, formatMoney } from "@/lib/format";
import type { Borrower } from "@/lib/loans/queries";
import { createLoan } from "../actions";

const PREVIEW_PERIODS = 6;
const PERIOD_NOUN: Record<Frequency, string> = { weekly: "semana", biweekly: "quincena", monthly: "mes" };

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
  const [values, setValues] = useState({
    principal: "",
    currency: "USD",
    start_date: today,
    default_rate: "10",
    period_frequency: "biweekly" as Frequency,
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((p) => ({ ...p, [k]: e.target.value }));

  // Proyección sin abonos, con la misma lógica que usa el servidor.
  const principal = Number(values.principal);
  const rate = Number(values.default_rate);
  const ready = principal > 0 && rate >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(values.start_date);
  const projection = ready
    ? computeLoan(
        {
          principal,
          start_date: values.start_date,
          frequency: values.period_frequency,
          default_rate: rate,
          rates: [],
          payments: [],
          due_date: null,
          cancelled_at: null,
        },
        cutDate(values.start_date, values.period_frequency, PREVIEW_PERIODS),
      ).periods
    : [];
  const noun = PERIOD_NOUN[values.period_frequency];

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
            <input className="input" name="principal" type="number" step="0.01" min="0.01" required value={values.principal} onChange={set("principal")} />
          </Field>
          <Field label="Moneda">
            <select className="input" name="currency" value={values.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha del préstamo">
            <input className="input" name="start_date" type="date" required value={values.start_date} onChange={set("start_date")} />
          </Field>
          <Field label="Periodo de interés">
            <select className="input" name="period_frequency" value={values.period_frequency} onChange={set("period_frequency")}>
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Tasa por ${noun} (%)`} hint="Podrás cambiarla en cada periodo desde el detalle">
            <input className="input" name="default_rate" type="number" step="0.01" min="0" max="1000" required value={values.default_rate} onChange={set("default_rate")} />
          </Field>
          <Field label="Fecha límite (opcional)" hint="Si pasa y queda saldo, se marca atrasado">
            <input className="input" name="due_date" type="date" min={values.start_date} />
          </Field>
        </div>
        <Field label="Notas">
          <textarea className="input" name="notes" rows={2} maxLength={500} />
        </Field>
      </section>

      {projection.length > 0 && (
        <section className="card space-y-2">
          <p className="text-sm font-medium">Proyección si no recibe abonos</p>
          <p className="text-xs text-muted">
            El interés se cobra al cierre de cada {noun} solo sobre el capital pendiente. El interés no pagado se acumula aparte y no genera más interés.
          </p>
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-medium">Corte</th>
                <th className="py-1 font-medium">Capital</th>
                <th className="py-1 font-medium">Interés</th>
                <th className="py-1 font-medium">Interés acumulado</th>
              </tr>
            </thead>
            <tbody>
              {projection.map((p, i) => (
                <tr key={p.number}>
                  <td className="py-0.5">{formatDate(p.end)}</td>
                  <td className="py-0.5">{formatMoney(p.base!, values.currency)}</td>
                  <td className="py-0.5">{formatMoney(p.interest!, values.currency)}</td>
                  <td className="py-0.5">
                    {formatMoney(projection.slice(0, i + 1).reduce((sum, q) => sum + q.interest!, 0), values.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <FormMessage error={state.error} />
      <button className="btn" disabled={pending}>
        {pending ? "Guardando…" : "Guardar préstamo"}
      </button>
    </form>
  );
}
