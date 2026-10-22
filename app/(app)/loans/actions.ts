"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, today } from "@/lib/format";
import { previewPayment } from "@/lib/loans/calc";
import { getLoan, toLoanInput } from "@/lib/loans/queries";

export type FormState = { error?: string; message?: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const money = z.coerce.number().positive("El monto debe ser mayor que 0").max(999_999_999_999);
const rate = z.coerce.number().min(0, "La tasa no puede ser negativa").max(1000, "Tasa demasiado alta");
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
    default_rate: rate,
    period_frequency: z.enum(["weekly", "biweekly", "monthly"]),
    due_date: date.optional(),
    notes: optionalText,
  })
  .refine((v) => (v.borrower_mode === "new" ? !!v.borrower_name : !!v.borrower_id), {
    message: "Indica la persona",
  })
  .refine((v) => !v.due_date || v.due_date >= v.start_date, {
    message: "La fecha límite no puede ser anterior a la fecha del préstamo",
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

  const { data, error } = await supabase
    .from("loans")
    .insert({
      borrower_id: borrowerId,
      principal: v.principal,
      currency: v.currency,
      start_date: v.start_date,
      default_rate: v.default_rate,
      period_frequency: v.period_frequency,
      due_date: v.due_date ?? null,
      notes: v.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return { error: "No se pudo guardar el préstamo." };

  revalidatePath("/", "layout");
  redirect(`/loans/${data.id}`);
}

const periodRateSchema = z.object({
  loan_id: z.string().uuid(),
  period_number: z.coerce.number().int().min(1),
  rate,
});

// Fija la tasa de un periodo concreto (pasado o futuro); todo se recalcula a partir de ahí.
export async function setPeriodRate(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = periodRateSchema.safeParse(formEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("period_rates").upsert(parsed.data, { onConflict: "loan_id,period_number" });
  if (error) return { error: "No se pudo guardar la tasa." };
  revalidatePath("/", "layout");
  return { message: "Guardada." };
}

// Vuelve a usar la tasa por defecto del préstamo en ese periodo.
export async function resetPeriodRate(formData: FormData) {
  const { loan_id, period_number } = periodRateSchema.omit({ rate: true }).parse(formEntries(formData));
  const supabase = await createClient();
  await supabase.from("period_rates").delete().eq("loan_id", loan_id).eq("period_number", period_number);
  revalidatePath("/", "layout");
}

const paymentSchema = z.object({
  loan_id: z.string().uuid(),
  amount: money,
  paid_at: date,
  note: optionalText,
  next_rate: rate.optional(),
});

export async function addPayment(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = paymentSchema.safeParse(formEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { loan_id, amount, paid_at, note, next_rate } = parsed.data;

  const loan = await getLoan(loan_id, 0);
  if (!loan) return { error: "Préstamo no encontrado." };
  if (paid_at < loan.start_date) return { error: "El pago no puede ser anterior a la fecha del préstamo." };
  if (paid_at > today()) return { error: "El pago no puede tener fecha futura." };
  if (loan.cancelled_at) return { error: "El préstamo está cancelado. Reactívalo para registrar abonos." };
  const preview = previewPayment(toLoanInput(loan), { amount, paid_at }, today());
  if (!preview.valid) {
    return {
      error: `El abono supera la deuda total a esa fecha. Máximo: ${formatMoney(preview.maxAmount, loan.currency)}`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({ loan_id, amount, paid_at, note: note ?? null });
  if (error) {
    if (error.message.includes("anterior a la fecha del préstamo")) {
      return { error: "El pago no puede ser anterior a la fecha del préstamo." };
    }
    return { error: "No se pudo registrar el pago." };
  }
  // Tasa del periodo siguiente elegida al registrar el abono; solo se guarda si cambia.
  if (next_rate !== undefined && next_rate !== preview.next.configuredRate) {
    const { error: rateError } = await supabase
      .from("period_rates")
      .upsert({ loan_id, period_number: preview.next.number, rate: next_rate }, { onConflict: "loan_id,period_number" });
    if (rateError) {
      revalidatePath("/", "layout");
      return { error: "Abono registrado, pero no se pudo guardar la tasa del periodo siguiente." };
    }
  }
  revalidatePath("/", "layout");
  return { message: "Abono registrado." };
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
