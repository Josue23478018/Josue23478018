// Pruebas del asistente. Los valores esperados están calculados a mano (ver comentarios).
import { describe, expect, it } from "vitest";
import { answer, projectLoan, type AssistantContext } from "./assistant";
import { addDays, computeLoan, cutDate, type Frequency, type LoanInput } from "./calc";

// Intl separa la moneda del número con un espacio que no se parte; se normaliza para comparar.
const plain = (s: string) => s.replace(/ /g, " ");
const ask = (q: string, ctx: AssistantContext) => {
  const r = answer(q, ctx);
  return { text: plain(r.text), table: r.table && { ...r.table, rows: r.table.rows.map((row) => row.map(plain)) } };
};

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
const ctx: AssistantContext = { loan: loan200, currency: "USD", today: "2026-10-21", borrowerName: "Ana" };

describe("estado del préstamo", () => {
  it("¿Cuánto debe? → capital 200, interés 40 (quincena 1 al 20%), total 240", () => {
    const { text } = ask("¿Cuánto debe?", ctx);
    expect(text).toContain("Capital pendiente: USD 200.00");
    expect(text).toContain("Interés pendiente: USD 40.00");
    expect(text).toContain("Total adeudado hoy: USD 240.00");
  });

  it("con un abono de 70 registrado: capital 170, interés 0", () => {
    const withPay = { ...ctx, loan: { ...loan200, payments: [{ id: "a", amount: 70, paid_at: "2026-10-20" }] } };
    const { text } = ask("saldo", withPay);
    expect(text).toContain("Capital pendiente: USD 170.00");
    expect(text).toContain("Interés pendiente: USD 0.00");
    // La siguiente quincena cobra 20% de 170 = 34
    expect(text).toContain("USD 34.00");
  });
});

describe("si abona X", () => {
  it("abono de 70 → 40 a interés, 30 a capital, capital 170; la quincena 2 cobraría 34", () => {
    const { text } = ask("Si abona 70, ¿cómo queda?", ctx);
    expect(text).toContain("A interés: USD 40.00");
    expect(text).toContain("A capital: USD 30.00");
    expect(text).toContain("Capital pendiente: USD 170.00");
    expect(text).toContain("Total adeudado: USD 170.00");
    expect(text).toContain("20% sobre USD 170.00 = USD 34.00");
  });

  it("abono de 40 (solo el interés) → el capital NO baja: sigue en 200", () => {
    const { text } = ask("si paga 40", ctx);
    expect(text).toContain("A interés: USD 40.00");
    expect(text).toContain("A capital: USD 0.00");
    expect(text).toContain("Capital pendiente: USD 200.00");
    expect(text).toContain("el capital no baja");
  });

  it("abono de 25 (menos que el interés) → interés pendiente 15, capital 200", () => {
    const { text } = ask("y si me da 25?", ctx);
    expect(text).toContain("Interés pendiente: USD 15.00");
    expect(text).toContain("Capital pendiente: USD 200.00");
  });

  it("abono mayor a la deuda (1,000.50) → se rechaza; máximo 240", () => {
    const { text } = ask("si abona 1,000.50", ctx);
    expect(text).toContain("supera la deuda");
    expect(text).toContain("USD 240.00");
  });

  it("abono el día del corte (29/10) pertenece a la quincena 1: 40 interés + 30 capital", () => {
    const { text } = ask("si abona 70 el 29/10/2026", ctx);
    expect(text).toContain("A interés: USD 40.00");
    expect(text).toContain("Capital pendiente: USD 170.00");
  });

  it("'la quincena 2' no se lee como un abono de 2", () => {
    const { text } = ask("cuánto interés se cobra en la quincena 2", ctx);
    expect(text).not.toContain("Si abona USD 2.00");
  });
});

describe("liquidar e interés siguiente", () => {
  it("¿Cuánto necesita para liquidar hoy? → 240 (40 interés + 200 capital)", () => {
    const { text } = ask("¿Cuánto necesita para liquidar hoy?", ctx);
    expect(text).toContain("necesita USD 240.00");
    expect(text).toContain("Interés pendiente: USD 40.00");
    expect(text).toContain("Capital pendiente: USD 200.00");
  });

  it("interés de la próxima quincena → 20% de 200 = 40, más 40 pendientes", () => {
    const { text } = ask("¿Cuánto es el interés de la próxima quincena?", ctx);
    expect(text).toContain("Interés: USD 40.00");
    expect(text).toContain("USD 40.00 de interés pendiente");
  });

  it("interés de la próxima quincena al 25% → 50", () => {
    const { text } = ask("interés de la próxima quincena al 25%", ctx);
    expect(text).toContain("Interés: USD 50.00");
  });

  it("solo interés por 6 quincenas → paga 240 y sigue debiendo 200 de capital", () => {
    const { text } = ask("¿Qué pasa si solo paga el interés?", ctx);
    expect(text).toContain("el capital se queda en USD 200.00");
    expect(text).toContain("pagaría USD 240.00 de interés y seguiría debiendo USD 200.00");
  });
});

describe("proyección y tiempo para pagar", () => {
  it("abona 70 cada quincena por 4 quincenas: 170 → 134 → 90.80 → 38.96", () => {
    const { text, table } = ask("Si abona 70 cada quincena, ¿cómo quedaría en 4 quincenas?", ctx);
    expect(table!.rows.map((r) => [r[1], r[3], r[5], r[6], r[7]])).toEqual([
      // Vence, interés cobrado, a interés, a capital, capital
      ["29 oct 2026", "USD 40.00", "USD 40.00", "USD 30.00", "USD 170.00"],
      ["12 nov 2026", "USD 34.00", "USD 34.00", "USD 36.00", "USD 134.00"],
      ["26 nov 2026", "USD 26.80", "USD 26.80", "USD 43.20", "USD 90.80"],
      ["10 dic 2026", "USD 18.16", "USD 18.16", "USD 51.84", "USD 38.96"],
    ]);
    expect(text).toContain("capital USD 38.96, interés pendiente USD 0.00");
  });

  it("¿En cuántas quincenas termina abonando 70? → 5, el 24 dic; total 326.75 (126.75 de interés)", () => {
    const { text } = ask("¿En cuántas quincenas termina si abona 70 cada quincena?", ctx);
    expect(text).toContain("en 5 quincenas, el 24 dic 2026");
    expect(text).toContain("Total que pagaría desde hoy: USD 326.75");
    expect(text).toContain("De eso, interés: USD 126.75");
    expect(text).toContain("El último abono sería de USD 46.75");
  });

  it("abonando 40 cada quincena nunca termina (40 es justo el interés de 200 al 20%)", () => {
    const { text } = ask("¿En cuántas quincenas termina si abona 40 cada quincena?", ctx);
    expect(text).toContain("no se termina de pagar");
    expect(text).toContain("USD 40.00 de interés");
  });

  it("proyección con otra tasa (al 10%) para las quincenas siguientes", () => {
    const { table } = ask("Si abona 70 cada quincena, ¿cómo quedaría en 2 quincenas al 10%?", ctx);
    // Q1 ya cobrada al 20% (40); Q2 al 10% de 170 = 17 → 17 interés + 53 capital → 117
    expect(table!.rows.map((r) => [r[2], r[3], r[7]])).toEqual([
      ["20%", "USD 40.00", "USD 170.00"],
      ["10%", "USD 17.00", "USD 117.00"],
    ]);
  });
});

describe("préstamos hipotéticos", () => {
  const free: AssistantContext = { loan: null, currency: "USD", today: "2026-10-21" };

  it("500 al 10% quincenal, abona 100 cada quincena → 8 quincenas, termina el 10 feb 2027, interés 228.22", () => {
    const { text } = ask("Si presto 500 al 10% quincenal y me abona 100 cada quincena, ¿en cuántas quincenas termina?", free);
    expect(text).toContain("La primera quincena cobra USD 50.00");
    expect(text).toContain("en 8 quincenas, el 10 feb 2027");
    expect(text).toContain("De eso, interés: USD 228.22");
    expect(text).toContain("El último abono sería de USD 28.22");
  });

  it("500 al 20% abonando 100 (igual al interés) nunca termina", () => {
    const { text } = ask("si presto 500 al 20% y me paga 100 cada quincena", free);
    expect(text).toContain("no se termina de pagar");
  });

  it("sin tasa pide los datos", () => {
    const { text } = ask("si presto 500", free);
    expect(text).toContain("dime monto y tasa");
  });
});

describe("préstamos cerrados", () => {
  it("pagado: el estado lo dice y no acepta simular abonos", () => {
    const paid = { ...ctx, loan: { ...loan200, payments: [{ id: "a", amount: 240, paid_at: "2026-10-20" }] } };
    expect(ask("¿cuánto debe?", paid).text).toContain("estado Pagado");
    expect(ask("si abona 10", paid).text).toContain("No se pueden registrar abonos");
  });
});

// ---------- La proyección coincide con computeLoan usando los mismos abonos ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("projectLoan coincide con computeLoan", () => {
  it("en 300 préstamos al azar, abono por abono", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
      const frequency = pick<Frequency>(["weekly", "biweekly", "monthly"]);
      const start = addDays("2026-01-01", Math.floor(r() * 40));
      const today = addDays(start, Math.floor(r() * 90));
      const loan: LoanInput = {
        principal: pick([100, 200, 333.33, 1000, 2500]),
        start_date: start,
        frequency,
        default_rate: pick([0, 5, 10, 12.5, 20]),
        rates: [{ period_number: 1 + Math.floor(r() * 10), rate: pick([3, 15, 25]) }],
        payments: Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({
          id: `h${i}`,
          amount: Math.round(r() * 80 * 100) / 100 + 1,
          paid_at: addDays(start, Math.floor(r() * (Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 864e5)) + 1))),
          created_at: `2026-01-01T00:00:0${i}Z`,
        })),
        due_date: null,
        cancelled_at: null,
      };
      if (computeLoan(loan, today).balance === 0) continue;
      const rate = r() < 0.3 ? pick([7, 18]) : undefined;
      const proj = projectLoan(loan, today, { periods: 12, payment: pick([20, 50, 120, 400]), rate });
      if (!proj.rows.length) continue;
      // Mismos abonos como pagos reales en las fechas de corte y misma tasa en los periodos siguientes.
      const first = proj.rows[0].number;
      const rates = rate === undefined ? loan.rates : [...loan.rates.filter((x) => x.period_number <= first), ...proj.rows.slice(1).map((row) => ({ period_number: row.number, rate }))];
      const payments = [
        ...loan.payments,
        ...proj.rows.filter((row) => row.payment > 0).map((row, i) => ({ id: `sim${i}`, amount: row.payment, paid_at: row.end, created_at: `2099-01-01T00:00:${String(i).padStart(2, "0")}Z` })),
      ];
      const last = proj.rows[proj.rows.length - 1];
      expect(last.end).toBe(cutDate(start, frequency, last.number));
      const real = computeLoan({ ...loan, rates, payments }, last.end);
      const ctxMsg = `semilla ${seed}`;
      proj.rows.filter((row) => row.payment > 0).forEach((row, i) => {
        const a = real.allocations.find((x) => x.id === `sim${i}`)!;
        expect([a.toInterest, a.toPrincipal, a.principalOutstanding, a.interestOutstanding], ctxMsg).toEqual([
          row.toInterest,
          row.toPrincipal,
          row.principalAfter,
          row.interestAfter,
        ]);
      });
    }
  });
});
