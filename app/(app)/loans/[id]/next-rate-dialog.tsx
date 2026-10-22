"use client";

import { formatDate, formatMoney } from "@/lib/format";
import { projectInterest, type Frequency } from "@/lib/loans/calc";

const PERIOD_NOUN: Record<Frequency, string> = { weekly: "semana", biweekly: "quincena", monthly: "mes" };

// Paso final al registrar un abono: pregunta el porcentaje del periodo siguiente.
// Se dibuja dentro del formulario del abono; su campo `next_rate` se envía junto con el abono.
export function NextRateDialog({
  periodNumber,
  start,
  principalAfter,
  configuredRate,
  value,
  onChange,
  onCancel,
  currency,
  frequency,
}: {
  periodNumber: number;
  start: string;
  principalAfter: number;
  configuredRate: number;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  currency: string;
  frequency: Frequency;
}) {
  const rate = value.trim() === "" ? Number.NaN : Number(value);
  const valid = Number.isFinite(rate) && rate >= 0 && rate <= 1000;
  const noun = PERIOD_NOUN[frequency];
  const money = (n: number) => formatMoney(n, currency);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/40 p-4 sm:items-center" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="tasa-titulo" className="card w-full max-w-md space-y-5 shadow-xl">
        <div className="space-y-1">
          <p className="eyebrow">Antes de registrar el abono</p>
          <h2 id="tasa-titulo" className="h2">
            ¿Qué porcentaje se usará en la {noun} {periodNumber}?
          </h2>
          <p className="text-sm text-muted">
            Empieza el {formatDate(start)}. Se cobrará sobre el capital que queda tras este abono: {money(principalAfter)}.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="block text-sm font-medium">
            Tasa de la {noun} {periodNumber}
          </span>
          <span className="relative block">
            <input
              className="input pr-10 text-lg tabular-nums"
              name="next_rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max="1000"
              required
              autoFocus
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
              %
            </span>
          </span>
          {Number(value) === configuredRate && <span className="block text-xs text-muted">Es la tasa que ya tenía esa {noun}.</span>}
        </label>

        <div aria-live="polite" className="panel">
          <p className="text-xs text-muted">Interés que generará esa {noun}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{valid ? money(projectInterest(principalAfter, rate)) : "—"}</p>
          <p className="text-xs text-muted">Si no hay más abonos a capital antes de que empiece.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Volver
          </button>
          <button type="submit" className="btn" disabled={!valid}>
            Registrar abono
          </button>
        </div>
      </div>
    </div>
  );
}
