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
        cutDate(values.start_date, values.period_frequency, PREVIEW_PERIODS - 1),
      ).periods
    : [];
  const noun = PERIOD_NOUN[values.period_frequency];

  const segment = (active: boolean) =>
    `flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"}`;

  return (
    <form action={formAction} className="space-y-6">
      <section aria-labelledby="persona" className="card space-y-4">
        <h2 id="persona" className="h2">
          Persona
        </h2>
        {borrowers.length > 0 && (
          <fieldset>
            <legend className="sr-only">¿A quién le prestas?</legend>
            <div className="flex gap-1 rounded-lg border border-border bg-subtle p-1">
              <label className={segment(borrowerMode === "existing")}>
                <input
                  type="radio"
                  className="sr-only"
                  name="borrower_mode"
                  value="existing"
                  checked={borrowerMode === "existing"}
                  onChange={() => setBorrowerMode("existing")}
                />
                Persona existente
              </label>
              <label className={segment(borrowerMode === "new")}>
                <input
                  type="radio"
                  className="sr-only"
                  name="borrower_mode"
                  value="new"
                  checked={borrowerMode === "new"}
                  onChange={() => setBorrowerMode("new")}
                />
                Persona nueva
              </label>
            </div>
          </fieldset>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nombre">
                <input className="input" name="borrower_name" required maxLength={200} autoComplete="off" />
              </Field>
            </div>
            <Field label="Teléfono / WhatsApp" hint="Opcional">
              <input className="input" name="borrower_phone" type="tel" inputMode="tel" maxLength={50} />
            </Field>
            <Field label="Correo" hint="Opcional">
              <input className="input" name="borrower_email" type="email" maxLength={200} />
            </Field>
          </div>
        )}
      </section>

      <section aria-labelledby="prestamo" className="card space-y-4">
        <h2 id="prestamo" className="h2">
          Préstamo
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Monto prestado" suffix={values.currency}>
            <input
              className="input pr-16 tabular-nums"
              name="principal"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={values.principal}
              onChange={set("principal")}
            />
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
          <Field label={`Tasa por ${noun}`} suffix="%" hint="Al registrar cada abono se te preguntará la tasa del periodo siguiente">
            <input
              className="input pr-10 tabular-nums"
              name="default_rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="1000"
              required
              value={values.default_rate}
              onChange={set("default_rate")}
            />
          </Field>
          <Field label="Fecha límite (opcional)" hint="Si pasa y queda saldo, se marca atrasado">
            <input className="input" name="due_date" type="date" min={values.start_date} />
          </Field>
        </div>
        <Field label="Notas" hint="Opcional">
          <textarea className="input" name="notes" rows={2} maxLength={500} />
        </Field>
      </section>

      {projection.length > 0 && (
        <section aria-labelledby="proyeccion" className="card space-y-3">
          <div className="space-y-1">
            <h2 id="proyeccion" className="h2">
              Proyección si no recibe abonos
            </h2>
            <p className="text-sm text-muted">
              El interés de cada {noun} se cobra al empezar, solo sobre el capital pendiente, y vence al terminar. Cada abono cubre primero ese interés y lo que sobra baja el capital. El interés no pagado se acumula aparte y no genera más interés.
            </p>
          </div>
          <div className="-mx-4 overflow-x-auto sm:-mx-6">
            <table className="table">
              <caption className="sr-only">Proyección de los primeros periodos</caption>
              <thead>
                <tr>
                  <th scope="col">Periodo</th>
                  <th scope="col" className="num">
                    Capital
                  </th>
                  <th scope="col" className="num">
                    Interés
                  </th>
                  <th scope="col" className="num">
                    Interés acumulado
                  </th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p) => (
                  <tr key={p.number}>
                    <td className="whitespace-nowrap">
                      {formatDate(p.start)} – {formatDate(p.end)}
                    </td>
                    <td className="num">{formatMoney(p.base!, values.currency)}</td>
                    <td className="num">{formatMoney(p.interest!, values.currency)}</td>
                    <td className="num font-medium">{formatMoney(p.interestAccumulated!, values.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="space-y-3">
        <FormMessage error={state.error} />
        <button className="btn w-full sm:w-auto" disabled={pending}>
          {pending ? "Guardando…" : "Guardar préstamo"}
        </button>
      </div>
    </form>
  );
}
