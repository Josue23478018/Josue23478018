"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "../loans/actions";

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const borrowerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  phone: z.string().max(50).nullable(),
  email: z.string().email("Correo inválido").max(200).nullable(),
  notes: z.string().max(500).nullable(),
});

export async function updateBorrower(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = borrowerSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    phone: blank(formData.get("phone")),
    email: blank(formData.get("email")),
    notes: blank(formData.get("notes")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("borrowers").update(fields).eq("id", id);
  if (error) return { error: "No se pudo guardar." };
  revalidatePath("/", "layout");
  return { message: "Guardado." };
}

export async function deleteBorrower(formData: FormData) {
  const id = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  // La base de datos impide borrar a una persona que todavía tiene préstamos.
  const { error } = await supabase.from("borrowers").delete().eq("id", id);
  if (error) redirect(`/borrowers/${id}?error=tiene-prestamos`);
  revalidatePath("/", "layout");
  redirect("/borrowers");
}
