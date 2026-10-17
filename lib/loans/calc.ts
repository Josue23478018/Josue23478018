// Cálculos de préstamos. Todo el dinero se maneja internamente en centavos
// enteros para evitar errores de coma flotante; las fechas son "YYYY-MM-DD".

export type InterestPeriod = "total" | "monthly";
export type RepaymentType = "single" | "installments";
export type Frequency = "weekly" | "biweekly" | "monthly";
export type LoanStatus = "active" | "paid" | "overdue" | "cancelled";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

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

// Meses de plazo entre dos fechas; una fracción de mes cuenta como mes completo.
export function monthsBetween(start: string, end: string): number {
  const [y1, m1, d1] = parseDate(start);
  const [y2, m2, d2] = parseDate(end);
  const months = (y2 - y1) * 12 + (m2 - m1) + (d2 > d1 ? 1 : 0);
  return Math.max(1, months);
}

// Interés simple. "total": tasa aplicada una vez. "monthly": tasa × meses de plazo.
export function computeTotalDue(args: {
  principal: number;
  rate: number;
  period: InterestPeriod;
  startDate: string;
  endDate: string;
}): number {
  const periods = args.period === "monthly" ? monthsBetween(args.startDate, args.endDate) : 1;
  const principal = toCents(args.principal);
  return fromCents(principal + Math.round((principal * args.rate * periods) / 100));
}

export function lastDueDate(args: {
  type: RepaymentType;
  firstDueDate: string;
  frequency?: Frequency;
  count?: number;
}): string {
  if (args.type === "single") return args.firstDueDate;
  return dueDateFor(args.firstDueDate, args.frequency!, args.count! - 1);
}

function dueDateFor(first: string, frequency: Frequency, index: number): string {
  if (frequency === "weekly") return addDays(first, 7 * index);
  if (frequency === "biweekly") return addDays(first, 14 * index);
  return addMonths(first, index);
}

export type ScheduleItem = { number: number; due_date: string; amount_due: number };

export function buildSchedule(args: {
  total: number;
  type: RepaymentType;
  firstDueDate: string;
  frequency?: Frequency;
  count?: number;
}): ScheduleItem[] {
  const total = toCents(args.total);
  if (args.type === "single") {
    return [{ number: 1, due_date: args.firstDueDate, amount_due: fromCents(total) }];
  }
  const count = args.count!;
  const each = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    due_date: dueDateFor(args.firstDueDate, args.frequency!, i),
    amount_due: fromCents(i === count - 1 ? total - each * (count - 1) : each),
  }));
}

export type LoanForSummary = {
  total_due: number;
  cancelled_at: string | null;
  installments: { number: number; due_date: string; amount_due: number }[];
  payments: { amount: number }[];
};

export type LoanSummary = {
  status: LoanStatus;
  total: number;
  paid: number;
  balance: number;
  overdueAmount: number;
  nextDue: { number: number; due_date: string; remaining: number } | null;
};

// Los pagos se aplican a las cuotas en orden (la más antigua primero).
// Una cuota está atrasada si su fecha ya pasó (antes de hoy) y no está cubierta.
export function summarizeLoan(loan: LoanForSummary, today: string): LoanSummary {
  const total = toCents(Number(loan.total_due));
  const paid = loan.payments.reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
  const balance = Math.max(0, total - paid);

  const installments = [...loan.installments].sort((a, b) => a.number - b.number);
  let cumulative = 0;
  let overdue = 0;
  let nextDue: LoanSummary["nextDue"] = null;
  for (const inst of installments) {
    const amount = toCents(Number(inst.amount_due));
    cumulative += amount;
    const remaining = Math.min(amount, Math.max(0, cumulative - paid));
    if (remaining === 0) continue;
    if (inst.due_date < today) overdue += remaining;
    if (!nextDue) nextDue = { number: inst.number, due_date: inst.due_date, remaining: fromCents(remaining) };
  }

  let status: LoanStatus = "active";
  if (loan.cancelled_at) status = "cancelled";
  else if (balance === 0) status = "paid";
  else if (overdue > 0) status = "overdue";

  return {
    status,
    total: fromCents(total),
    paid: fromCents(paid),
    balance: fromCents(balance),
    overdueAmount: fromCents(overdue),
    nextDue: status === "active" || status === "overdue" ? nextDue : null,
  };
}
