// Verificación independiente del cálculo de préstamos.
//
// 1. Una implementación de referencia escrita de otra forma (recorre el préstamo día por día)
//    se compara con computeLoan en cientos de préstamos generados al azar.
// 2. Leyes que deben cumplirse siempre (invariantes) en esos mismos préstamos.
// 3. Las reglas del usuario escritas como casos concretos.
import { describe, expect, it } from "vitest";
import { addDays, computeLoan, cutDate, type Frequency, type LoanInput } from "./calc";

// ---------- Implementación de referencia (día por día, centavos enteros) ----------

// Interés en centavos con redondeo "mitad hacia arriba", calculado por cociente y resto.
function refInterest(baseCents: number, rate: number): number {
  const product = BigInt(baseCents) * BigInt(Math.round(rate * 1000)); // centavos × 100 000
  const q = product / BigInt(100000);
  const r = product % BigInt(100000);
  return Number(r * BigInt(2) >= BigInt(100000) ? q + BigInt(1) : q);
}

type RefResult = {
  principal: number;
  interest: number;
  charged: number;
  allocations: Map<string, { toInterest: number; toPrincipal: number; excess: number }>;
};

function reference(loan: LoanInput, today: string): RefResult {
  const rateOf = (n: number) => loan.rates.find((r) => r.period_number === n)?.rate ?? loan.default_rate;
  const stop = loan.cancelled_at && loan.cancelled_at.slice(0, 10) < today ? loan.cancelled_at.slice(0, 10) : today;
  const byDay = new Map<string, LoanInput["payments"]>();
  for (const p of [...loan.payments].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
    byDay.set(p.paid_at, [...(byDay.get(p.paid_at) ?? []), p]);
  }
  // Fecha de inicio de cada periodo: el día del préstamo y cada fecha de corte.
  const startsOn = new Map<string, number>();
  for (let n = 1; n <= 400; n++) startsOn.set(n === 1 ? loan.start_date : cutDate(loan.start_date, loan.frequency, n - 1), n);

  let principal = Math.round(loan.principal * 100);
  let interest = 0;
  let charged = 0;
  const allocations: RefResult["allocations"] = new Map();
  const pay = (p: LoanInput["payments"][number]) => {
    const amount = Math.round(p.amount * 100);
    const toInterest = Math.min(amount, interest);
    interest -= toInterest;
    const toPrincipal = Math.min(amount - toInterest, principal);
    principal -= toPrincipal;
    allocations.set(p.id, { toInterest, toPrincipal, excess: amount - toInterest - toPrincipal });
  };

  const lastPayment = loan.payments.reduce((m, p) => (p.paid_at > m ? p.paid_at : m), today);
  for (let d = loan.start_date; d <= lastPayment; d = addDays(d, 1)) {
    const n = startsOn.get(d);
    const todays = byDay.get(d) ?? [];
    if (n === undefined) {
      todays.forEach(pay);
      continue;
    }
    // Día de corte: primero los abonos del periodo que termina, luego se cobra el que empieza.
    if (n > 1) todays.forEach(pay);
    if (d <= stop && principal > 0) {
      const amount = refInterest(principal, rateOf(n));
      interest += amount;
      charged += amount;
    }
    if (n === 1) todays.forEach(pay);
  }
  return { principal, interest, charged, allocations };
}

// ---------- Generador determinista de préstamos al azar ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomLoan(seed: number): { loan: LoanInput; today: string } {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const frequency = pick<Frequency>(["weekly", "biweekly", "monthly"]);
  const start = addDays("2026-01-01", Math.floor(r() * 60));
  const today = addDays(start, Math.floor(r() * 200));
  const principal = pick([50, 100, 200, 333.33, 1000, 1234.56, 5000, 99.99]);
  const default_rate = pick([0, 1.13, 2.3, 5, 10, 12.5, 20, 33.333]);
  const rates = Array.from({ length: Math.floor(r() * 4) }, () => ({
    period_number: 1 + Math.floor(r() * 8),
    rate: pick([0, 3, 7.5, 15, 20, 25]),
  })).filter((x, i, arr) => arr.findIndex((y) => y.period_number === x.period_number) === i);
  const span = Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 86400000));
  const payments = Array.from({ length: Math.floor(r() * 7) }, (_, i) => ({
    id: `p${i}`,
    amount: Math.round((1 + r() * principal * 0.6) * 100) / 100,
    paid_at: addDays(start, Math.floor(r() * (span + 1))),
    created_at: `2026-01-01T00:00:0${i}Z`,
  }));
  const cancelled_at = r() < 0.15 ? addDays(start, Math.floor(r() * (span + 1))) : null;
  return { loan: { principal, start_date: start, frequency, default_rate, rates, payments, due_date: null, cancelled_at }, today };
}

const cents = (n: number) => Math.round(n * 100);

describe("comparación con la implementación de referencia (día por día)", () => {
  it("coincide en 600 préstamos al azar, al centavo", () => {
    for (let seed = 1; seed <= 600; seed++) {
      const { loan, today } = randomLoan(seed);
      const got = computeLoan(loan, today);
      const ref = reference(loan, today);
      const ctx = `semilla ${seed}: ${JSON.stringify(loan)} hoy=${today}`;
      expect(cents(got.principalOutstanding), ctx).toBe(ref.principal);
      expect(cents(got.interestOutstanding), ctx).toBe(ref.interest);
      expect(cents(got.interestCharged), ctx).toBe(ref.charged);
      for (const a of got.allocations) {
        const r = ref.allocations.get(a.id)!;
        expect([cents(a.toInterest), cents(a.toPrincipal), cents(a.excess)], ctx).toEqual([r.toInterest, r.toPrincipal, r.excess]);
      }
    }
  });
});

describe("leyes que siempre se cumplen", () => {
  it("en 600 préstamos al azar", () => {
    for (let seed = 1001; seed <= 1600; seed++) {
      const { loan, today } = randomLoan(seed);
      const s = computeLoan(loan, today);
      const ctx = `semilla ${seed}`;
      let sumToPrincipal = 0;
      let sumToInterest = 0;
      let prevInterest = Number.NaN;
      for (const a of s.allocations) {
        // Cada abono se reparte completo: interés + capital + sobrante = monto.
        expect(cents(a.toInterest) + cents(a.toPrincipal) + cents(a.excess), ctx).toBe(cents(a.amount));
        // Nada negativo.
        for (const v of [a.toInterest, a.toPrincipal, a.excess, a.interestOutstanding, a.principalOutstanding]) expect(v, ctx).toBeGreaterThanOrEqual(0);
        // Si una parte fue a capital, el interés pendiente quedó en cero (primero se paga interés).
        if (a.toPrincipal > 0) expect(a.interestOutstanding, ctx).toBe(0);
        // El total adeudado es capital + interés.
        expect(cents(a.totalOwed), ctx).toBe(cents(a.principalOutstanding) + cents(a.interestOutstanding));
        sumToPrincipal += cents(a.toPrincipal);
        sumToInterest += cents(a.toInterest);
        prevInterest = a.interestOutstanding;
      }
      void prevInterest;
      // El capital solo baja por la parte de los abonos que fue a capital.
      expect(cents(s.principalOutstanding), ctx).toBe(cents(loan.principal) - sumToPrincipal);
      // El interés pendiente es lo cobrado menos lo pagado de interés.
      expect(cents(s.interestOutstanding), ctx).toBe(cents(s.interestCharged) - sumToInterest);
      // El interés cobrado es la suma de los periodos, cada uno sobre el capital (no sobre interés).
      const accrued = s.periods.filter((p) => p.accrued);
      expect(accrued.reduce((t, p) => t + cents(p.interest!), 0), ctx).toBe(cents(s.interestCharged));
      for (const p of accrued) expect(cents(p.base!), ctx).toBeLessThanOrEqual(cents(loan.principal));
    }
  });
});

describe("reglas del usuario (casos concretos)", () => {
  const loan200: LoanInput = {
    principal: 200,
    start_date: "2026-10-15",
    frequency: "biweekly",
    default_rate: 20,
    rates: [],
    payments: [],
    due_date: null,
    cancelled_at: null,
  };
  const pay = (...ps: [number, string][]) =>
    ps.map(([amount, paid_at], i) => ({ id: `p${i}`, amount, paid_at, created_at: `2026-10-15T00:00:0${i}Z` }));

  it("200 al 20%: pagar 40 (solo el interés) deja el capital en 200, no en 160", () => {
    const s = computeLoan({ ...loan200, payments: pay([40, "2026-10-20"]) }, "2026-10-21");
    expect(s.allocations[0]).toMatchObject({ toInterest: 40, toPrincipal: 0 });
    expect(s.principalOutstanding).toBe(200);
    expect(s.interestOutstanding).toBe(0);
  });

  it("200 al 20%: pagar 70 → 40 a interés, 30 a capital, capital 170", () => {
    const s = computeLoan({ ...loan200, payments: pay([70, "2026-10-20"]) }, "2026-10-21");
    expect(s.allocations[0]).toMatchObject({ toInterest: 40, toPrincipal: 30 });
    expect(s.principalOutstanding).toBe(170);
  });

  it("un segundo abono en la misma quincena, con el interés ya pagado, va todo a capital", () => {
    const s = computeLoan({ ...loan200, payments: pay([40, "2026-10-20"], [40, "2026-10-22"]) }, "2026-10-23");
    expect(s.allocations[1]).toMatchObject({ toInterest: 0, toPrincipal: 40 });
    expect(s.principalOutstanding).toBe(160);
  });

  it("un abono menor al interés no toca el capital y deja interés pendiente", () => {
    const s = computeLoan({ ...loan200, payments: pay([25, "2026-10-20"]) }, "2026-10-21");
    expect(s.allocations[0]).toMatchObject({ toInterest: 25, toPrincipal: 0, interestOutstanding: 15 });
    expect(s.principalOutstanding).toBe(200);
  });

  it("la quincena siguiente cobra sobre el capital que quedó (170 al 20% = 34)", () => {
    const s = computeLoan({ ...loan200, payments: pay([70, "2026-10-20"]) }, "2026-10-29");
    expect(s.periods.map((p) => [p.base, p.interest])).toEqual([
      [200, 40],
      [170, 34],
    ]);
  });
});
