import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE, today } from "@/lib/format";

// Revisa paso a paso lo que hace la app al entrar y devuelve el primer error real.
// No muestra claves ni datos de préstamos: solo si cada paso funcionó y el mensaje de error.
export const dynamic = "force-dynamic";

type Step = { paso: string; ok: boolean; detalle?: string };

export async function GET() {
  const steps: Step[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  steps.push({
    paso: "variables",
    ok: /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    detalle: `url=${url ? new URL(url).host : "(vacía)"} clave=${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "presente" : "falta"} zona=${TIMEZONE} hoy=${today()}`,
  });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    steps.push({ paso: "sesion", ok: !!data.user, detalle: error ? `${error.code ?? ""} ${error.message}` : data.user ? "con sesión" : "sin sesión" });

    for (const [tabla, columnas] of [
      ["borrowers", "id, name"],
      ["loans", "id, default_rate, period_frequency, due_date"],
      ["payments", "id, amount"],
      ["period_rates", "id, rate"],
    ] as const) {
      const { error: e } = await supabase.from(tabla).select(columnas).limit(1);
      steps.push({ paso: `tabla ${tabla}`, ok: !e, detalle: e ? `${e.code} ${e.message}` : undefined });
    }

    const { error: e } = await supabase
      .from("loans")
      .select("id, borrower:borrowers!inner (id), period_rates (period_number), payments (id)")
      .limit(1);
    steps.push({ paso: "consulta completa", ok: !e, detalle: e ? `${e.code} ${e.message}` : undefined });
  } catch (err) {
    steps.push({ paso: "excepcion", ok: false, detalle: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }

  return NextResponse.json({ todo_bien: steps.every((s) => s.ok), pasos: steps });
}
