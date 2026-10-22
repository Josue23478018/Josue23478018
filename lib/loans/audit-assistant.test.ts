// Auditoría independiente del asistente de préstamos.
// Todos los valores esperados se calcularon a mano (y se cruzaron con una referencia
// independiente en centavos enteros, redondeo mitad hacia arriba). Ninguno se copió de la
// salida del código. Si una prueba falla, es un hallazgo: NO se ajusta el esperado.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answer, projectLoan, type AssistantContext } from "./assistant";
import { computeLoan, previewPayment, type LoanInput } from "./calc";

const plain = (s: string) => s.replace(/ /g, " ");
const dump: { id: string; q: string; text: string; table?: string[][] }[] = [];
const ask = (id: string, q: string, c: AssistantContext) => {
  const r = answer(q, c);
  const text = plain(r.text);
  const table = r.table?.rows.map((row) => row.map(plain));
  dump.push({ id, q, text, table });
  return { text, table };
};

const base: LoanInput = {
  principal: 200,
  start_date: "2026-10-15",
  frequency: "biweekly",
  default_rate: 20,
  rates: [],
  payments: [],
  due_date: null,
  cancelled_at: null,
};
const ctx: AssistantContext = { loan: base, currency: "USD", today: "2026-10-21" };
const withLoan = (loan: Partial<LoanInput>, today = "2026-10-21"): AssistantContext => ({
  ...ctx,
  today,
  loan: { ...base, ...loan },
});
const hyp: AssistantContext = { loan: null, currency: "USD", today: "2026-10-21" };

type Case = { id: string; q: string; c?: AssistantContext; has?: string[]; not?: string[] };

// Cortes del préstamo base: Q1 vence 2026-10-31, Q2 2026-11-15, Q3 2026-11-30, Q4 2026-12-15,
// Q5 2026-12-31. Q1 cobra 20% de 200 = 40.
const cases: Case[] = [
  // 1. Estado
  { id: "1a", q: "¿Cuánto me debe?", has: ["Capital pendiente: USD 200.00", "Interés pendiente: USD 40.00", "Total adeudado hoy: USD 240.00"] },
  { id: "1b", q: "saldo", has: ["Capital pendiente: USD 200.00", "Interés pendiente: USD 40.00", "Total adeudado hoy: USD 240.00"] },
  { id: "1c", q: "resumen", has: ["Capital pendiente: USD 200.00", "Total adeudado hoy: USD 240.00"] },
  { id: "1d", q: "CUANTO ME DEBE", has: ["Total adeudado hoy: USD 240.00"] },
  // 2. Abono igual al interés: capital sigue en 200
  { id: "2a", q: "si abona 40", has: ["A interés: USD 40.00", "A capital: USD 0.00", "Capital pendiente: USD 200.00", "Total adeudado: USD 200.00"] },
  { id: "2b", q: "si paga 40 dólares", has: ["A interés: USD 40.00", "A capital: USD 0.00", "Capital pendiente: USD 200.00"] },
  // 3. Reparto
  { id: "3a", q: "si abona 70", has: ["A interés: USD 40.00", "A capital: USD 30.00", "Capital pendiente: USD 170.00", "USD 34.00"] },
  { id: "3b", q: "si me da $70", has: ["A interés: USD 40.00", "A capital: USD 30.00", "Capital pendiente: USD 170.00"] },
  { id: "3c", q: "y si paga 70.50", has: ["A interés: USD 40.00", "A capital: USD 30.50", "Capital pendiente: USD 169.50", "USD 33.90"] },
  { id: "3d", q: "si abona 70,50", has: ["A capital: USD 30.50", "Capital pendiente: USD 169.50"] },
  // 4. Abono menor / igual / mayor / deuda total / mayor a deuda
  { id: "4a", q: "si abona 15", has: ["A interés: USD 15.00", "A capital: USD 0.00", "Interés pendiente: USD 25.00", "Capital pendiente: USD 200.00", "Total adeudado: USD 225.00"] },
  { id: "4b", q: "si abona 100", has: ["A interés: USD 40.00", "A capital: USD 60.00", "Capital pendiente: USD 140.00", "USD 28.00"] },
  { id: "4c", q: "si abona 240", has: ["A interés: USD 40.00", "A capital: USD 200.00", "Total adeudado: USD 0.00", "queda pagado"] },
  { id: "4d", q: "si abona 241", has: ["USD 240.00"], not: ["A capital"] },
  { id: "4e", q: "si abona 1,000", has: ["USD 240.00"], not: ["A capital"] },
  // 0 y negativo: se espera rechazo explícito, nunca un reparto
  { id: "4f", q: "si abona 0", has: ["mayor"], not: ["A capital"] },
  { id: "4g", q: "si abona -50", not: ["A capital: USD 10.00", "A interés: USD 40.00"] },
  // 5. Liquidar
  { id: "5a", q: "¿Cuánto necesita para liquidar hoy?", has: ["USD 240.00", "Interés pendiente: USD 40.00", "Capital pendiente: USD 200.00"] },
  // 1/11 ya empezó Q2 (31/10): +40 de interés → 280
  { id: "5b", q: "cuánto para liquidar el 01/11/2026", has: ["USD 280.00", "Interés pendiente: USD 80.00", "Capital pendiente: USD 200.00"] },
  { id: "5c", q: "liquidar el 2026-11-01", has: ["USD 280.00"] },
  // Día del corte: pertenece a Q1 → 240
  { id: "5d", q: "cuanto para liquidar el 31/10/2026", has: ["USD 240.00"] },
  // 6. Interés próxima quincena
  { id: "6a", q: "¿Cuánto es el interés de la próxima quincena?", has: ["Interés: USD 40.00"] },
  { id: "6b", q: "interés de la siguiente quincena al 25%", has: ["Interés: USD 50.00"] },
  { id: "6c", q: "si abona 100 al 25%", has: ["Capital pendiente: USD 140.00", "USD 35.00"] },
  // 8. En cuántas quincenas termina
  { id: "8a", q: "¿En cuántas quincenas termina si abona 40 cada quincena?", has: ["no se termina", "USD 40.00"] },
  { id: "8b", q: "¿En cuántas quincenas termina si abona 41 cada quincena?", has: ["21 quincenas", "31 ago 2027", "USD 835.95", "USD 635.95", "USD 15.95"] },
  { id: "8c", q: "¿En cuántas quincenas termina si abona 70 cada quincena?", has: ["5 quincenas", "31 dic 2026", "USD 326.75", "USD 126.75", "USD 46.75"] },
  { id: "8d", q: "¿En cuántas quincenas termina si abona 250 cada quincena?", has: ["1 quincena", "31 oct 2026", "USD 240.00", "interés: USD 40.00"] },
  // 9. Hipotéticos (desde 2026-10-21)
  { id: "9a", c: hyp, q: "si presto 1000 al 10% quincenal y me abona 150 cada quincena, ¿en cuántas quincenas termina?", has: ["USD 100.00", "12 quincenas", "15 abr 2027", "USD 1,730.80", "USD 730.80", "USD 80.80"] },
  { id: "9b", c: hyp, q: "si presto 1000 al 10% semanal y me abona 150 cada semana, ¿en cuántas semanas termina?", has: ["12 semanas", "13 ene 2027", "USD 1,730.80", "USD 730.80"] },
  { id: "9c", c: hyp, q: "si presto 1000 al 10% mensual y me abona 150 cada mes, ¿en cuántos meses termina?", has: ["12 meses", "21 oct 2027", "USD 1,730.80"] },
  { id: "9d", c: hyp, q: "si presto 1,000 al 10% quincenal y me abona 150 cada quincena, ¿en cuántas quincenas termina?", has: ["12 quincenas", "USD 1,730.80"] },
  { id: "9e", c: hyp, q: "si presto 1000 al 10% quincenal y me abona 150 cada quincena durante 3 quincenas", has: ["Al final: capital USD 834.50"] },
  // Orden invertido: el principal es 1000, no 150
  { id: "9f", c: hyp, q: "me abona 150 cada quincena si le presto 1000 al 10%, ¿cuántas quincenas?", has: ["Préstamo de USD 1,000.00", "12 quincenas"] },
  // 11. Pagado / cancelado
  { id: "11a", c: withLoan({ payments: [{ id: "p", amount: 240, paid_at: "2026-10-20" }] }), q: "saldo", has: ["Pagado", "Total adeudado hoy: USD 0.00"] },
  { id: "11b", c: withLoan({ payments: [{ id: "p", amount: 240, paid_at: "2026-10-20" }] }), q: "si abona 10", has: ["No se pueden registrar abonos"], not: ["A capital"] },
  { id: "11c", c: withLoan({ payments: [{ id: "p", amount: 240, paid_at: "2026-10-20" }] }), q: "interes de la proxima quincena", has: ["ya no genera interés"] },
  { id: "11d", c: withLoan({ cancelled_at: "2026-10-18" }), q: "saldo", has: ["Cancelado"] },
  { id: "11e", c: withLoan({ cancelled_at: "2026-10-18" }), q: "si abona 10", has: ["No se pueden registrar abonos"], not: ["A capital"] },
  { id: "11f", c: withLoan({ cancelled_at: "2026-10-18" }), q: "cuanto para liquidar", not: ["necesita USD"] },
  // Tasa 0%
  { id: "0a", c: withLoan({ default_rate: 0 }), q: "saldo", has: ["Capital pendiente: USD 200.00", "Interés pendiente: USD 0.00", "Total adeudado hoy: USD 200.00"] },
  { id: "0b", c: withLoan({ default_rate: 0 }), q: "si abona 50", has: ["A interés: USD 0.00", "A capital: USD 50.00", "Capital pendiente: USD 150.00"] },
  { id: "0c", c: withLoan({ default_rate: 0 }), q: "en cuantas quincenas termina si abona 50 cada quincena", has: ["4 quincenas", "15 dic 2026", "USD 200.00", "interés: USD 0.00"] },
  // Centavos: 333.33 al 12.5% → 41.66625 → 41.67 ; 275 × 12.5% = 34.375 → 34.38
  { id: "cA", c: withLoan({ principal: 333.33, default_rate: 12.5 }), q: "saldo", has: ["Interés pendiente: USD 41.67", "Total adeudado hoy: USD 375.00"] },
  { id: "cB", c: withLoan({ principal: 333.33, default_rate: 12.5 }), q: "si abona 100", has: ["A interés: USD 41.67", "A capital: USD 58.33", "Capital pendiente: USD 275.00", "USD 34.38"] },
  { id: "cC", c: withLoan({ principal: 250, default_rate: 1.13 }), q: "saldo", has: ["Interés pendiente: USD 2.83"] },
  // 10. Abonos previos (uno el día del corte) y tasa 30% en Q2. Hoy 2026-11-05.
  // Q1: 40; abono 50 (20/10) → 40 int + 10 cap → 190; abono 30 (31/10, día de corte, Q1) → 30 cap → 160.
  // Q2 (30%): 48 sobre 160. Hoy: capital 160, interés 48, total 208. Q3 (20%): 32.
  ...(() => {
    const c = withLoan(
      {
        rates: [{ period_number: 2, rate: 30 }],
        payments: [
          { id: "a", amount: 50, paid_at: "2026-10-20" },
          { id: "b", amount: 30, paid_at: "2026-10-31" },
        ],
      },
      "2026-11-05",
    );
    return [
      { id: "10a", c, q: "saldo", has: ["Capital pendiente: USD 160.00", "Interés pendiente: USD 48.00", "Total adeudado hoy: USD 208.00", "USD 32.00"] },
      { id: "10b", c, q: "si abona 100", has: ["A interés: USD 48.00", "A capital: USD 52.00", "Capital pendiente: USD 108.00", "USD 21.60"] },
      { id: "10c", c, q: "cuanto necesita para liquidar hoy", has: ["USD 208.00"] },
      { id: "10d", c, q: "interes de la proxima quincena", has: ["Interés: USD 32.00"] },
    ] as Case[];
  })(),
  // Tasa 30% en Q2 vista desde Q1: abono 70 → 170; Q2 cobraría 30% de 170 = 51; próxima quincena 30% de 200 = 60
  { id: "10e", c: withLoan({ rates: [{ period_number: 2, rate: 30 }] }), q: "si abona 70", has: ["Capital pendiente: USD 170.00", "30% sobre USD 170.00 = USD 51.00"] },
  { id: "10f", c: withLoan({ rates: [{ period_number: 2, rate: 30 }] }), q: "interes de la proxima quincena", has: ["Interés: USD 60.00"] },
  // Abono futuro después de un corte: 30/10 debe 280; 70 → todo a interés, quedan 10 de interés
  { id: "rA", q: "si abona 70 el 01/11/2026", has: ["USD 280.00", "A interés: USD 70.00", "A capital: USD 0.00", "Interés pendiente: USD 10.00", "Capital pendiente: USD 200.00"] },
  { id: "rB", q: "si abona 70 el 31/10/2026", has: ["A interés: USD 40.00", "A capital: USD 30.00", "Capital pendiente: USD 170.00"] },
  // 12. Robustez del lenguaje
  { id: "12a", q: "SI ABONA 70", has: ["A capital: USD 30.00"] },
  { id: "12b", q: "si abona 70!!!", has: ["A capital: USD 30.00"] },
  { id: "12c", q: "¿cuanto es el interes de la quincena 2?", not: ["USD 2.00"] },
  { id: "12d", q: "si abona 70 en la quincena 2", has: ["A capital: USD 30.00"], not: ["USD 2.00"] },
  { id: "12e", q: "Si abona 70, ¿cómo quedaría?", has: ["A capital: USD 30.00", "Capital pendiente: USD 170.00"] },
  { id: "12f", q: "simula un abono de 70", has: ["A capital: USD 30.00"] },
  { id: "12g", q: "y si abona setenta", has: ["70"] },
  { id: "12h", q: "si paga el 29 de octubre 70", has: ["A capital: USD 30.00"], not: ["USD 29.00"] },
  { id: "12i", q: "¿Cuánto falta del préstamo de 200?", has: ["Total adeudado hoy: USD 240.00"] },
  { id: "12j", q: "cuanto debe al 01/11/2026", has: ["USD 280.00"] },
  { id: "12k", q: "si abona 40 y luego 70", has: ["Capital pendiente: USD 170.00"] },
  { id: "12l", q: "si abona 1.000", has: ["USD 240.00"], not: ["A capital"] },
  { id: "12m", q: "si paga todo", has: ["USD 240.00"] },
  { id: "12n", q: "que pasa si solo paga el interes", has: ["USD 200.00", "USD 40.00"] },
  { id: "12o", q: "como quedaria en 3 quincenas si no paga nada", has: ["Al final: capital USD 200.00, interés pendiente USD 120.00, total adeudado USD 320.00"] },
  { id: "12p", q: "si abona 70 dentro de 2 quincenas", has: ["A interés"] },
  // Lote 2
  { id: "13a", q: "cuanto para liquidar el 01-11-2026", has: ["USD 280.00"] },
  { id: "13b", q: "si abona 70 el 1/11", has: ["USD 280.00", "Interés pendiente: USD 10.00"] },
  { id: "13c", q: "si abona 70 el 31/02/2027", not: ["A capital"] },
  { id: "13d", q: "interes de la proxima quincena al 12,5%", has: ["Interés: USD 25.00"] },
  { id: "13e", q: "abona 50 cada quincena por 4 quincenas", has: ["Al final: capital USD 146.32"] },
  { id: "13f", q: "si abona $1,000.50", has: ["USD 240.00"], not: ["A capital"] },
  { id: "13g", q: "si abona 70 mañana", has: ["22 oct 2026", "A capital: USD 30.00"] },
  // Al 10% desde Q2: 170 → 117 → 58.70 → último 64.57; total 274.57, interés 74.57, 15 dic 2026
  { id: "13h", q: "en cuantas quincenas termina si abona 70 cada quincena al 10%", has: ["4 quincenas", "15 dic 2026", "USD 274.57", "USD 74.57", "USD 64.57"] },
  { id: "13i", c: hyp, q: "si presto 500 al 20% quincenal", has: ["USD 100.00"] },
  { id: "13j", c: hyp, q: "cuanto me debe", has: ["monto y tasa"] },
  // Atrasado: hoy 2026-11-05 sin abonos → Q1 (40) vencido + Q2 (40) → total 280, atrasado 40
  { id: "13k", c: withLoan({}, "2026-11-05"), q: "saldo", has: ["Atrasado", "Total adeudado hoy: USD 280.00", "Atrasado: USD 40.00"] },
  { id: "13l", c: withLoan({}, "2026-11-05"), q: "si abona 70", has: ["USD 280.00", "A interés: USD 70.00", "Interés pendiente: USD 10.00", "Capital pendiente: USD 200.00", "USD 40.00"] },
  // Varios abonos registrados: 15, 25, 30 → capital 170, interés 0
  { id: "13m", c: withLoan({ payments: [{ id: "1", amount: 15, paid_at: "2026-10-16" }, { id: "2", amount: 25, paid_at: "2026-10-18" }, { id: "3", amount: 30, paid_at: "2026-10-20" }] }), q: "saldo", has: ["Capital pendiente: USD 170.00", "Interés pendiente: USD 0.00", "Pagado hasta hoy: USD 70.00"] },
  { id: "13o", q: "si le doy 70", has: ["A capital: USD 30.00"] },
  { id: "13p", q: "si me paga 70 cómo queda el capital", has: ["Capital pendiente: USD 170.00"] },
];

describe("auditoría: preguntas al asistente (esperado calculado a mano)", () => {
  for (const k of cases) {
    it(`[${k.id}] ${k.q}`, () => {
      const { text } = ask(k.id, k.q, k.c ?? ctx);
      for (const h of k.has ?? []) expect(text, `debe contener "${h}"`).toContain(h);
      for (const n of k.not ?? []) expect(text, `no debe contener "${n}"`).not.toContain(n);
    });
  }
});

// 7. Proyecciones fila por fila: [n, interés cobrado, abono, a interés, a capital, capital, interés pend.]
type Row = [number, number, number, number, number, number, number];
const checkRows = (rows: ReturnType<typeof projectLoan>["rows"], exp: Row[]) => {
  expect(rows.length).toBe(exp.length);
  exp.forEach((e, i) => {
    const r = rows[i];
    expect([r.number, r.interest, r.payment, r.toInterest, r.toPrincipal, r.principalAfter, r.interestAfter], `fila ${i + 1}`).toEqual(e);
  });
};

describe("auditoría: projectLoan fila por fila", () => {
  it("[7a] 50 cada quincena, 4 quincenas: 190 → 178 → 163.60 → 146.32", () => {
    const p = projectLoan(base, "2026-10-21", { periods: 4, payment: 50 });
    checkRows(p.rows, [
      [1, 40, 50, 40, 10, 190, 0],
      [2, 38, 50, 38, 12, 178, 0],
      [3, 35.6, 50, 35.6, 14.4, 163.6, 0],
      [4, 32.72, 50, 32.72, 17.28, 146.32, 0],
    ]);
    expect(p.rows.map((r) => r.end)).toEqual(["2026-10-31", "2026-11-15", "2026-11-30", "2026-12-15"]);
    expect(p.paidOff).toBe(false);
  });

  it("[7b] 100 cada quincena: 140 → 68 → 0 (último abono 81.60), total 281.60", () => {
    const p = projectLoan(base, "2026-10-21", { periods: 6, payment: 100 });
    checkRows(p.rows, [
      [1, 40, 100, 40, 60, 140, 0],
      [2, 28, 100, 28, 72, 68, 0],
      [3, 13.6, 81.6, 13.6, 68, 0, 0],
    ]);
    expect(p.paidOff).toBe(true);
    expect(p.totalPaid).toBe(281.6);
  });

  it("[7c] 30 cada quincena (menos que el interés): capital fijo, interés pendiente 10 → 20 → 30", () => {
    const p = projectLoan(base, "2026-10-21", { periods: 3, payment: 30 });
    checkRows(p.rows, [
      [1, 40, 30, 30, 0, 200, 10],
      [2, 40, 30, 30, 0, 200, 20],
      [3, 40, 30, 30, 0, 200, 30],
    ]);
  });

  it("[7d] tasa 30% en Q2: 70 cada quincena → 170 → 151 → 111.20", () => {
    const p = projectLoan({ ...base, rates: [{ period_number: 2, rate: 30 }] }, "2026-10-21", { periods: 3, payment: 70 });
    checkRows(p.rows, [
      [1, 40, 70, 40, 30, 170, 0],
      [2, 51, 70, 51, 19, 151, 0],
      [3, 30.2, 70, 30.2, 39.8, 111.2, 0],
    ]);
    expect(p.rows.map((r) => r.rate)).toEqual([20, 30, 20]);
  });

  it("[7e] con abonos previos (hoy 2026-11-05, en Q2): 60 cada quincena → 148 → 117.60 → 81.12", () => {
    const loan: LoanInput = {
      ...base,
      rates: [{ period_number: 2, rate: 30 }],
      payments: [
        { id: "a", amount: 50, paid_at: "2026-10-20" },
        { id: "b", amount: 30, paid_at: "2026-10-31" },
      ],
    };
    const p = projectLoan(loan, "2026-11-05", { periods: 3, payment: 60 });
    checkRows(p.rows, [
      [2, 48, 60, 48, 12, 148, 0],
      [3, 29.6, 60, 29.6, 30.4, 117.6, 0],
      [4, 23.52, 60, 23.52, 36.48, 81.12, 0],
    ]);
    expect(p.rows[0].rate).toBe(30);
  });

  it("[7f] tabla del asistente: 'si abona 50 cada quincena, ¿cómo quedaría en 4 quincenas?'", () => {
    const { text, table } = ask("7f", "Si abona 50 cada quincena, ¿cómo quedaría en 4 quincenas?", ctx);
    expect(text).toContain("Al final: capital USD 146.32, interés pendiente USD 0.00, total adeudado USD 146.32");
    expect(table?.map((r) => r[7])).toEqual(["USD 190.00", "USD 178.00", "USD 163.60", "USD 146.32"]);
  });

  it("[7g] hipotético 1000 al 10%, 150 cada quincena: 12 filas a mano", () => {
    const loan: LoanInput = { ...base, principal: 1000, default_rate: 10, start_date: "2026-10-21" };
    const p = projectLoan(loan, "2026-10-21", { periods: 600, payment: 150 });
    const capital = [950, 895, 834.5, 767.95, 694.75, 614.23, 525.65, 428.22, 321.04, 203.14, 73.45, 0];
    const interest = [100, 95, 89.5, 83.45, 76.8, 69.48, 61.42, 52.57, 42.82, 32.1, 20.31, 7.35];
    expect(p.rows.map((r) => r.principalAfter)).toEqual(capital);
    expect(p.rows.map((r) => r.interest)).toEqual(interest);
    expect(p.rows[11].payment).toBe(80.8);
    expect(p.rows[11].end).toBe("2027-04-15");
  });
});

describe("auditoría: capa de cálculo directa", () => {
  it("[calc-0] previewPayment con 0 y negativo → non_positive", () => {
    expect(previewPayment(base, { amount: 0, paid_at: "2026-10-21" }, "2026-10-21").reason).toBe("non_positive");
    expect(previewPayment(base, { amount: -5, paid_at: "2026-10-21" }, "2026-10-21").reason).toBe("non_positive");
  });

  it("[calc-multi] varios abonos seguidos: 15, 25, 30 → 40 interés y 30 capital → 170", () => {
    const s = computeLoan(
      {
        ...base,
        payments: [
          { id: "1", amount: 15, paid_at: "2026-10-16" },
          { id: "2", amount: 25, paid_at: "2026-10-18" },
          { id: "3", amount: 30, paid_at: "2026-10-20" },
        ],
      },
      "2026-10-21",
    );
    expect(s.allocations.map((a) => [a.toInterest, a.toPrincipal, a.principalOutstanding])).toEqual([
      [15, 0, 200],
      [25, 0, 200],
      [0, 30, 170],
    ]);
    expect(s.balance).toBe(170);
  });

  // Decisión: el día de corte el saldo (280) ya incluye la quincena que empieza, pero un abono de ese
  // día cuenta para la quincena que vence, así que liquidar hoy cuesta 240. Ambas respuestas lo explican.
  it("[cut-day] hoy = día de corte (31/10): estado y liquidar explican 280 frente a 240", () => {
    const c = { ...ctx, today: "2026-10-31" };
    const st = ask("cut-st", "saldo", c).text;
    const lq = ask("cut-lq", "cuanto necesita para liquidar hoy", c).text;
    expect(st).toContain("Total adeudado hoy: USD 280.00");
    expect(st).toContain("bastan USD 240.00");
    expect(lq).toContain("necesita USD 240.00");
    expect(lq).toContain("saldo de USD 280.00");
  });

  it("[cut-proj] proyección con hoy = día de corte (registro para el informe)", () => {
    ask("cut-proj", "si abona 70 cada quincena como quedaria en 2 quincenas", { ...ctx, today: "2026-10-31" });
    ask("cut-time", "en cuantas quincenas termina si abona 70 cada quincena", { ...ctx, today: "2026-10-31" });
  });
});

if (process.env.AUDIT_DUMP) {
  describe("volcado", () => {
    it("escribe respuestas", () => writeFileSync(process.env.AUDIT_DUMP!, JSON.stringify(dump, null, 1)));
  });
}
