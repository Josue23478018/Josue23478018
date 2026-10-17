// Cálculos de préstamos con interés compuesto por periodo.
//
// Reglas:
// - El préstamo se divide en periodos (semanal, quincenal o mensual) contados desde
//   la fecha del préstamo. Al cierre de cada periodo (fecha de corte) se cobra
//   interés = tasa del periodo × saldo pendiente en ese momento.
// - El saldo pendiente incluye el interés no pagado (se capitaliza).
// - Cada periodo usa su propia tasa si se definió; si no, la tasa por defecto.
// - Los abonos se aplican primero al interés pendiente y el resto al principal.
// - Un abono en la misma fecha de corte se aplica después de cobrar el interés de ese corte.
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
  /** Saldo (principal + interés pendiente) sobre el que se calculó el interés. */
  base: number | null;
  interest: number | null;
};

export type Allocation = { id: string; toInterest: number; toPrincipal: number; excess: number };

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

export function computeLoan(loan: LoanInput, today: string, opts: { futurePeriods?: number } = {}): LoanSummary {
  const rateOverrides = new Map(loan.rates.map((r) => [r.period_number, Number(r.rate)]));
  const rateFor = (n: number) => rateOverrides.get(n) ?? Number(loan.default_rate);
  const periodRow = (n: number): Omit<PeriodRow, "accrued" | "base" | "interest"> => ({
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
  let accruedOnStop = 0;
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
      toInterest: fromCents(toInterest),
      toPrincipal: fromCents(toPrincipal),
      excess: fromCents(amount - toInterest - toPrincipal),
    });
  };

  let n = 1;
  let pi = 0;
  for (; n <= MAX_PERIODS; n++) {
    const row = periodRow(n);
    while (pi < payments.length && payments[pi].paid_at < row.end) apply(payments[pi++]);
    if (row.end > stop || principal + interest === 0) break;
    const base = principal + interest;
    const amount = Math.round((base * row.rate) / 100);
    interest += amount;
    charged += amount;
    if (row.end === today) accruedOnStop = amount;
    periods.push({ ...row, accrued: true, base: fromCents(base), interest: fromCents(amount) });
  }
  while (pi < payments.length) apply(payments[pi++]);

  const balance = principal + interest;
  // Los abonos cubren primero el interés más antiguo, así que lo pendiente es lo más reciente.
  // El interés cobrado hoy todavía no está atrasado.
  const overdueInterest = interest - Math.min(interest, accruedOnStop);
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
      due_date: cutDate(loan.start_date, loan.frequency, n),
      rate,
      projectedInterest: fromCents(Math.round((balance * rate) / 100)),
    };
    for (let i = 0; i < (opts.futurePeriods ?? 0); i++) {
      periods.push({ ...periodRow(n + i), accrued: false, base: null, interest: null });
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
