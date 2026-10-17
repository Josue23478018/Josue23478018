import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/format";
import { summarizeLoan, type Frequency, type InterestPeriod, type LoanSummary, type RepaymentType } from "./calc";

export type Borrower = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export type Installment = { id: string; number: number; due_date: string; amount_due: number };
export type Payment = { id: string; amount: number; paid_at: string; note: string | null };

export type Loan = {
  id: string;
  principal: number;
  currency: string;
  start_date: string;
  interest_rate: number;
  interest_period: InterestPeriod;
  total_due: number;
  repayment_type: RepaymentType;
  installment_frequency: Frequency | null;
  installment_count: number | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  borrower: Borrower;
  installments: Installment[];
  payments: Payment[];
};

export type LoanWithSummary = Loan & { summary: LoanSummary };

const LOAN_SELECT = `
  id, principal, currency, start_date, interest_rate, interest_period, total_due,
  repayment_type, installment_frequency, installment_count, cancelled_at, notes, created_at,
  borrower:borrowers!inner (id, name, phone, email, notes),
  installments (id, number, due_date, amount_due),
  payments (id, amount, paid_at, note)
`;

// Postgres devuelve numeric como string; lo normalizamos a number.
function normalize(row: Record<string, unknown>): Loan {
  const loan = row as unknown as Loan;
  return {
    ...loan,
    principal: Number(loan.principal),
    interest_rate: Number(loan.interest_rate),
    total_due: Number(loan.total_due),
    installments: loan.installments
      .map((i) => ({ ...i, amount_due: Number(i.amount_due) }))
      .sort((a, b) => a.number - b.number),
    payments: loan.payments
      .map((p) => ({ ...p, amount: Number(p.amount) }))
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at)),
  };
}

function withSummary(loan: Loan, day: string): LoanWithSummary {
  return { ...loan, summary: summarizeLoan(loan, day) };
}

// RLS limita los resultados a las filas del usuario autenticado.
export async function listLoans(): Promise<LoanWithSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loans").select(LOAN_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  const day = today();
  return data.map((row) => withSummary(normalize(row), day));
}

export async function getLoan(id: string): Promise<LoanWithSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("loans").select(LOAN_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? withSummary(normalize(data), today()) : null;
}

export async function listBorrowers(): Promise<Borrower[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("borrowers").select("id, name, phone, email, notes").order("name");
  if (error) throw error;
  return data;
}
