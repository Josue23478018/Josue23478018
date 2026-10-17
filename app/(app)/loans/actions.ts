"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildSchedule, computeTotalDue, lastDueDate } from "@/lib/loans/calc";

export type FormState = { error?: string; message?: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const money = z.coerce.number().positive("El monto debe ser mayor que 0").max(999_999_999_999);
const optionalText = z.string().trim().max(500).optional();

// Los campos vacíos del formulario se tratan como ausentes.
function formEntries(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== ""));
}

const loanSchema = z
  .object({
    borrower_mode: z.enum(["existing", "new"]),
    borrower_id: z.string().optional(),
    borrower_name: z.string().trim().max(200).optional(),
    borrower_phone: optionalText,
    borrower_email: z.string().trim().email("Correo de la persona inválido").optional(),
    principal: money,
    currency: z.string().length(3),
    start_date: date,
    interest_rate: z.coerce.number().min(0, "El interés no puede ser negativo").max(1000),
    interest_period: z.enum(["total", "monthly"]),
    repayment_type: z.enum(["single", "installments"]),
    first_due_date: date,
    installment_frequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
    installment_count: z.coerce.number().int().min(1).max(360).optional(),
    notes: optionalText,
  })
  .refine((v) => v.borrower_mode === "new" ? !!v.borrower_name : !!v.borrower_id, {
    message: "Indica la persona",
  })
  .refine((v) => v.first_due_date >= v.start_date, {
    message: "La fecha de pago no puede ser anterior a la fecha del préstamo",
  })
  .refine((v) => v.repayment_type === "single" || (v.installment_frequency && v.installment_count), {
    message: "Indica la frecuencia y el número de cuotas",
  });

export async function createLoan(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loanSchema.safeParse(formEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  const supabase = await createClient();

  let borrowerId = v.borrower_id!;
  if (v.borrower_mode === "new") {
    const { data, error } = await supabase
      .from("borrowers")
      .insert({ name: v.borrower_name, phone: v.borrower_phone ?? null, email: v.borrower_email ?? null })
      .select("id")
      .single();
    if (error) return { error: "No se pudo guardar la persona." };
    borrowerId = data.id;
  }

  const plan =
    v.repayment_type === "single"
      ? { type: "single" as const, firstDueDate: v.first_due_date }
      : {
          type: "installments" as const,
          firstDueDate: v.first_due_date,
          frequency: v.installment_frequency!,
          count: v.installment_count!,
        };
  const total = computeTotalDue({
    principal: v.principal,
    rate: v.interest_rate,
    period: v.interest_period,
    startDate: v.start_date,
    endDate: lastDueDate(plan),
  });
  const schedule = buildSchedule({ total, ...plan });

  const { data: loanId, error } = await supabase.rpc("create_loan", {
    loan: {
      borrower_id: borrowerId,
      principal: v.principal,
      currency: v.currency,
      start_date: v.start_date,
      interest_rate: v.interest_rate,
      interest_period: v.interest_period,
      total_due: total,
      repayment_type: v.repayment_type,
      installment_frequency: plan.type === "installments" ? plan.frequency : null,
      installment_count: plan.type === "installments" ? plan.count : null,
      notes: v.notes ?? null,
    },
    schedule,
  });
  if (error) return { error: "No se pudo guardar el préstamo." };

  revalidatePath("/", "layout");
  redirect(`/loans/${loanId}`);
}

const paymentSchema = z.object({
  loan_id: z.string().uuid(),
  amount: money,
  paid_at: date,
  note: optionalText,
});

export async function addPayment(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = paymentSchema.safeParse(formEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({ ...parsed.data, note: parsed.data.note ?? null });
  if (error) return { error: "No se pudo registrar el pago." };
  revalidatePath("/", "layout");
  return { message: "Pago registrado." };
}

export async function deletePayment(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("payments").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function setCancelled(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const cancel = formData.get("cancel") === "true";
  const supabase = await createClient();
  await supabase
    .from("loans")
    .update({ cancelled_at: cancel ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath("/", "layout");
}

export async function deleteLoan(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("loans").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/loans");
}
