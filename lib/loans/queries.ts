import { createClient } from "@/lib/supabase/server";
import { localDate, today } from "@/lib/format";
import { computeLoan, type Frequency, type LoanInput, type LoanSummary } from "./calc";

export type Borrower = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type Payment = { id: string; amount: number; paid_at: string; note: string | null; created_at: string };
export type PeriodRate = { period_number: number; rate: number };

export type Loan = {
  id: string;
  principal: number;
  currency: string;
  start_date: string;
  default_rate: number;
  period_frequency: Frequency;
  due_date: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  borrower: Borrower;
  period_rates: PeriodRate[];
  payments: Payment[];
};

export type LoanWithSummary = Loan & { summary: LoanSummary };

const LOAN_SELECT = `
  id, principal, currency, start_date, default_rate, period_frequency, due_date, cancelled_at, notes, created_at,
  borrower:borrowers!inner (id, name, phone, email, notes),
  period_rates (period_number, rate),
  payments (id, amount, paid_at, note, created_at)
`;

// Postgres devuelve numeric como string; lo normalizamos a number.
function normalize(row: Record<string, unknown>): Loan {
  const loan = row as unknown as Loan;
  return {
    ...loan,
    principal: Number(loan.principal),
    default_rate: Number(loan.default_rate),
    period_rates: loan.period_rates.map((r) => ({ ...r, rate: Number(r.rate) })),
    payments: loan.payments
      .map((p) => ({ ...p, amount: Number(p.amount) }))
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at) || b.created_at.localeCompare(a.created_at)),
  };
}

// Datos de entrada de computeLoan/previewPayment; objeto plano, serializable para pasarlo a un componente cliente.
export function toLoanInput(loan: Loan): LoanInput {
  return {
    principal: loan.principal,
    start_date: loan.start_date,
    frequency: loan.period_frequency,
    default_rate: loan.default_rate,
    rates: loan.period_rates.map((r) => ({ period_number: r.period_number, rate: r.rate })),
    payments: loan.payments.map((p) => ({ id: p.id, amount: p.amount, paid_at: p.paid_at, created_at: p.created_at })),
    due_date: loan.due_date,
    // Se compara con "hoy" en la zona de la app, así que se pasa como fecha local.
    cancelled_at: loan.cancelled_at ? localDate(loan.cancelled_at) : null,
  };
}

function withSummary(loan: Loan, day: string, futurePeriods = 0): LoanWithSummary {
  const summary = computeLoan(toLoanInput(loan), day, { futurePeriods });
  return { ...loan, summary };
}

// RLS limita los resultados a las filas del usuario autenticado.
export async function listLoans(): Promise<LoanWithSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loans").select(LOAN_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  const day = today();
  return data.map((row) => withSummary(normalize(row), day));
}

export async function getLoan(id: string, futurePeriods = 3): Promise<LoanWithSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loans").select(LOAN_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? withSummary(normalize(data), today(), futurePeriods) : null;
}

export async function listBorrowers(): Promise<Borrower[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("borrowers").select("id, name, phone, email, notes").order("name");
  if (error) throw error;
  return data;
}
