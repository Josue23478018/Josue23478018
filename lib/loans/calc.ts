// Cálculos de préstamos con interés por periodo sobre el capital pendiente.
//
// Reglas:
// - El préstamo se divide en periodos (semanal, quincenal o mensual) contados desde
//   la fecha del préstamo. Al EMPEZAR cada periodo se cobra
//   interés = tasa del periodo × capital pendiente en ese momento, y vence al terminar
//   el periodo (fecha de corte).
// - El interés no pagado queda como interés pendiente: no se suma al capital
//   ni genera más interés.
// - Cada periodo usa su propia tasa si se definió; si no, la tasa por defecto.
// - Los abonos se aplican primero al interés pendiente y el resto al principal, así que
//   un abono dentro del periodo cubre primero el interés completo de ese periodo.
// - Un abono hecho el mismo día del corte pertenece al periodo que vence ese día: se
//   aplica antes de cobrar el interés del periodo siguiente.
//
// Todo el dinero se maneja internamente en centavos enteros; las fechas son "YYYY-MM-DD".

export type Frequency = "weekly" | "biweekly" | "monthly";
export type LoanStatus = "active" | "paid" | "overdue" | "cancelled";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const MAX_PERIODS = 5000;

function parseDate(d: string): [number, number, number] {
  const [y, m, day] = d.split("-").map(Number);
  return [y, m, day];
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return formatDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

// Suma meses manteniendo el día; si el mes destino es más corto, usa su último día.
export function addMonths(date: string, months: number): string {
  const [y, m, d] = parseDate(date);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return formatDate(ty, tm, Math.min(d, lastDay));
}

// Fecha de corte del periodo n (n >= 1), anclada a la fecha del préstamo.
export function cutDate(start: string, frequency: Frequency, n: number): string {
  if (frequency === "weekly") return addDays(start, 7 * n);
  if (frequency === "biweekly") return addDays(start, 14 * n);
  return addMonths(start, n);
}

export type LoanInput = {
  principal: number;
  start_date: string;
  frequency: Frequency;
  default_rate: number;
  rates: { period_number: number; rate: number }[];
  payments: { id: string; amount: number; paid_at: string; created_at?: string }[];
  due_date: string | null;
  cancelled_at: string | null;
};

export type PeriodRow = {
  number: number;
  start: string;
  end: string;
  rate: number;
  overridden: boolean;
  accrued: boolean;
  /** Capital pendiente sobre el que se calculó el interés. */
  base: number | null;
  interest: number | null;
  /** Interés generado desde el inicio hasta este corte, inclusive (pagado o no). */
  interestAccumulated: number | null;
};

/** Desglose de un abono y cómo queda la deuda justo después de aplicarlo. */
export type Allocation = {
  id: string;
  amount: number;
  toInterest: number;
  toPrincipal: number;
  /** Parte del abono que no cubrió ninguna deuda. */
  excess: number;
  /** Interés pendiente justo después del abono. */
  interestOutstanding: number;
  /** Capital pendiente justo después del abono. */
  principalOutstanding: number;
  /** Capital + interés pendiente justo después del abono. */
  totalOwed: number;
};

export type LoanSummary = {
  status: LoanStatus;
  principal: number;
  principalOutstanding: number;
  interestOutstanding: number;
  balance: number;
  interestCharged: number;
  paid: number;
  overdueAmount: number;
  periods: PeriodRow[];
  allocations: Allocation[];
  next: { number: number; due_date: string; rate: number; projectedInterest: number } | null;
};

// Tasa configurada de un periodo: la propia si se definió, si no la tasa por defecto.
export function periodRate(loan: Pick<LoanInput, "rates" | "default_rate">, n: number): number {
  const r = loan.rates.find((x) => x.period_number === n);
  return r ? Number(r.rate) : Number(loan.default_rate);
}

// Periodo al que pertenece un abono hecho en `date`: el primero cuyo corte es >= date
// (un abono el día del corte pertenece al periodo que vence ese día). 0 si es antes del préstamo.
export function periodNumberAt(start: string, frequency: Frequency, date: string): number {
  if (date < start) return 0;
  let n = 1;
  while (n < MAX_PERIODS && cutDate(start, frequency, n) < date) n++;
  return n;
}

export function computeLoan(loan: LoanInput, today: string, opts: { futurePeriods?: number } = {}): LoanSummary {
  const rateOverrides = new Map(loan.rates.map((r) => [r.period_number, Number(r.rate)]));
  const rateFor = (n: number) => rateOverrides.get(n) ?? Number(loan.default_rate);
  const periodRow = (n: number): Omit<PeriodRow, "accrued" | "base" | "interest" | "interestAccumulated"> => ({
    number: n,
    start: n === 1 ? loan.start_date : cutDate(loan.start_date, loan.frequency, n - 1),
    end: cutDate(loan.start_date, loan.frequency, n),
    rate: rateFor(n),
    overridden: rateOverrides.has(n),
  });

  // El interés deja de generarse al cancelar el préstamo.
  const stop = loan.cancelled_at && loan.cancelled_at.slice(0, 10) < today ? loan.cancelled_at.slice(0, 10) : today;

  const payments = [...loan.payments].sort(
    (a, b) => a.paid_at.localeCompare(b.paid_at) || (a.created_at ?? "").localeCompare(b.created_at ?? ""),
  );

  let principal = toCents(Number(loan.principal));
  let interest = 0;
  let charged = 0;
  let paid = 0;
  // Interés de periodos que todavía no vencen (no puede estar atrasado).
  let notYetDue = 0;
  const allocations: Allocation[] = [];
  const periods: PeriodRow[] = [];

  const apply = (p: (typeof payments)[number]) => {
    const amount = toCents(Number(p.amount));
    const toInterest = Math.min(amount, interest);
    interest -= toInterest;
    const toPrincipal = Math.min(amount - toInterest, principal);
    principal -= toPrincipal;
    paid += amount;
    allocations.push({
      id: p.id,
      amount: fromCents(amount),
      toInterest: fromCents(toInterest),
      toPrincipal: fromCents(toPrincipal),
      excess: fromCents(amount - toInterest - toPrincipal),
      interestOutstanding: fromCents(interest),
      principalOutstanding: fromCents(principal),
      totalOwed: fromCents(principal + interest),
    });
  };

  let n = 1;
  let pi = 0;
  for (; n <= MAX_PERIODS; n++) {
    const row = periodRow(n);
    // Sin capital pendiente ya no se genera interés.
    if (row.start > stop || principal === 0) break;
    const base = principal;
    const amount = Math.round((base * row.rate) / 100);
    interest += amount;
    charged += amount;
    if (row.end >= today) notYetDue += amount;
    periods.push({
      ...row,
      accrued: true,
      base: fromCents(base),
      interest: fromCents(amount),
      interestAccumulated: fromCents(charged),
    });
    // Abonos de este periodo, incluido el día en que vence.
    while (pi < payments.length && payments[pi].paid_at <= row.end) apply(payments[pi++]);
  }
  while (pi < payments.length) apply(payments[pi++]);

  const balance = principal + interest;
  // Los abonos cubren primero el interés más antiguo, así que lo pendiente es lo más reciente.
  const overdueInterest = interest - Math.min(interest, notYetDue);
  const pastDue = loan.due_date !== null && loan.due_date < today && balance > 0;

  let status: LoanStatus = "active";
  if (loan.cancelled_at) status = "cancelled";
  else if (balance === 0) status = "paid";
  else if (pastDue || overdueInterest > 0) status = "overdue";

  const open = status === "active" || status === "overdue";
  let next: LoanSummary["next"] = null;
  if (open) {
    const rate = rateFor(n);
    next = {
      number: n,
      // Fecha en que se cobra el interés del siguiente periodo (cuando vence el actual).
      due_date: periodRow(n).start,
      rate,
      projectedInterest: fromCents(Math.round((principal * rate) / 100)),
    };
    for (let i = 0; i < (opts.futurePeriods ?? 0); i++) {
      periods.push({ ...periodRow(n + i), accrued: false, base: null, interest: null, interestAccumulated: null });
    }
  }

  return {
    status,
    principal: Number(loan.principal),
    principalOutstanding: fromCents(principal),
    interestOutstanding: fromCents(interest),
    balance: fromCents(balance),
    interestCharged: fromCents(charged),
    paid: fromCents(paid),
    overdueAmount: fromCents(pastDue ? balance : overdueInterest),
    periods,
    allocations,
    next,
  };
}

export type PaymentPreview = {
  /** Desglose del abono simulado. */
  allocation: Allocation;
  valid: boolean;
  /** Por qué se rechaza: monto no positivo, o deja dinero sobrante en este abono o en uno posterior. */
  reason: "non_positive" | "exceeds_debt" | null;
  /** Total adeudado en esa fecha, justo antes del abono. */
  owedAtDate: number;
  /** Máximo que se puede abonar en esa fecha sin que sobre dinero en ningún abono. */
  maxAmount: number;
  /** Periodo siguiente al del abono e interés que generaría si no hay más abonos. */
  next: { number: number; start: string; rate: number; configuredRate: number; projectedInterest: number };
};

const PREVIEW_ID = "__preview__";

// Simula un abono nuevo sobre el préstamo (sin guardarlo) y dice si es válido.
// nextRate, si se pasa, reemplaza la tasa del periodo siguiente al del abono.
export function previewPayment(
  loan: LoanInput,
  payment: { amount: number; paid_at: string },
  today: string,
  nextRate?: number,
): PaymentPreview {
  const nextNumber = periodNumberAt(loan.start_date, loan.frequency, payment.paid_at) + 1;
  const configuredRate = periodRate(loan, nextNumber);
  const rate = nextRate !== undefined && Number.isFinite(nextRate) ? nextRate : configuredRate;
  const input: LoanInput = {
    ...loan,
    rates: [...loan.rates.filter((r) => r.period_number !== nextNumber), { period_number: nextNumber, rate }],
  };
  // Se simula hasta la fecha del abono aunque sea futura, para cobrar los periodos que ya empezaron.
  const day = payment.paid_at > today ? payment.paid_at : today;
  // Se ordena después de los abonos existentes del mismo día, como al guardarlo ahora.
  const simulate = (cents: number) => {
    const s = computeLoan(
      {
        ...input,
        payments: [
          ...input.payments,
          { id: PREVIEW_ID, amount: fromCents(cents), paid_at: payment.paid_at, created_at: "9999-12-31T23:59:59Z" },
        ],
      },
      day,
    );
    return s.allocations;
  };

  const baseline = new Map(computeLoan(input, day).allocations.map((a) => [a.id, toCents(a.excess)]));
  // El abono no puede dejar sobrante ni hacer que un abono posterior ya registrado quede con sobrante.
  const fits = (allocs: Allocation[]) =>
    allocs.every((a) => toCents(a.excess) <= (a.id === PREVIEW_ID ? 0 : (baseline.get(a.id) ?? 0)));

  const owedCents = toCents(simulate(0).find((a) => a.id === PREVIEW_ID)!.totalOwed);
  // Más abono => menos deuda después, así que la validez es monótona y se puede buscar el máximo.
  let maxCents = owedCents;
  if (!fits(simulate(owedCents))) {
    let lo = 0;
    let hi = owedCents;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (fits(simulate(mid))) lo = mid;
      else hi = mid;
    }
    maxCents = lo;
  }

  const amountCents = Number.isFinite(payment.amount) ? toCents(payment.amount) : 0;
  const allocs = simulate(Math.max(amountCents, 0));
  const allocation = allocs.find((a) => a.id === PREVIEW_ID)!;
  const reason = amountCents <= 0 ? "non_positive" : fits(allocs) ? null : "exceeds_debt";

  return {
    allocation,
    valid: reason === null,
    reason,
    owedAtDate: fromCents(owedCents),
    maxAmount: fromCents(maxCents),
    next: {
      number: nextNumber,
      start: nextNumber === 1 ? loan.start_date : cutDate(loan.start_date, loan.frequency, nextNumber - 1),
      rate,
      configuredRate,
      projectedInterest: fromCents(Math.round((toCents(allocation.principalOutstanding) * rate) / 100)),
    },
  };
}

export type SummaryAmount = "balance" | "interestOutstanding" | "overdueAmount" | "paid";

// Suma un monto de varios préstamos agrupado por moneda (nunca mezcla monedas).
// Devuelve solo las monedas con total mayor que cero.
export function totalsByCurrency(
  loans: { currency: string; summary: LoanSummary }[],
  field: SummaryAmount,
): [string, number][] {
  const totals = new Map<string, number>();
  for (const l of loans) totals.set(l.currency, (totals.get(l.currency) ?? 0) + toCents(l.summary[field]));
  return [...totals.entries()].filter(([, c]) => c > 0).map(([cur, c]) => [cur, fromCents(c)]);
}
