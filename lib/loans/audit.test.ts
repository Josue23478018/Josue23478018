// Auditoría independiente: todos los valores esperados se calcularon a mano desde la especificación.
import { describe, expect, it } from "vitest";
import { computeLoan, previewPayment, type LoanInput } from "./calc";

const loan = (over: Partial<LoanInput> = {}): LoanInput => ({
  principal: 1000,
  start_date: "2026-01-01",
  frequency: "biweekly",
  default_rate: 10,
  rates: [],
  payments: [],
  due_date: null,
  cancelled_at: null,
  ...over,
});
const pay = (id: string, amount: number, paid_at: string, created_at?: string) => ({ id, amount, paid_at, created_at });

// Préstamo del usuario: Q1 10%, Q2 20%, Q3 10%.
const userLoan = (payments: LoanInput["payments"]) =>
  loan({ rates: [{ period_number: 1, rate: 10 }, { period_number: 2, rate: 20 }, { period_number: 3, rate: 10 }], payments });

describe("casos del usuario", () => {
  it("1. abono 150 en el corte de Q1", () => {
    const s = computeLoan(userLoan([pay("a", 150, "2026-01-15")]), "2026-01-15");
    expect(s.periods[0].interest).toBe(100);
    expect(s.allocations[0]).toMatchObject({
      amount: 150, toInterest: 100, toPrincipal: 50, interestOutstanding: 0, principalOutstanding: 950, totalOwed: 950,
    });
  });

  it("2. Q2 cobra 190; abono 100 el 01-20", () => {
    const s = computeLoan(userLoan([pay("a", 150, "2026-01-15"), pay("b", 100, "2026-01-20")]), "2026-01-20");
    expect(s.periods[1].base).toBe(950);
    expect(s.periods[1].interest).toBe(190);
    expect(s.allocations[1]).toMatchObject({
      toInterest: 100, toPrincipal: 0, interestOutstanding: 90, principalOutstanding: 950, totalOwed: 1040,
    });
    expect(s.balance).toBe(1040);
  });

  it("3. Q3 cobra 95 -> pendiente 185, total 1135", () => {
    const s = computeLoan(userLoan([pay("a", 150, "2026-01-15"), pay("b", 100, "2026-01-20")]), "2026-01-31");
    expect(s.periods[2].interest).toBe(95);
    expect(s.interestOutstanding).toBe(185);
    expect(s.principalOutstanding).toBe(950);
    expect(s.balance).toBe(1135);
  });

  it("4. abono 300 el 02-01", () => {
    const s = computeLoan(
      userLoan([pay("a", 150, "2026-01-15"), pay("b", 100, "2026-01-20"), pay("c", 300, "2026-02-01")]),
      "2026-02-01",
    );
    expect(s.allocations[2]).toMatchObject({
      toInterest: 185, toPrincipal: 115, interestOutstanding: 0, principalOutstanding: 835, totalOwed: 835,
    });
    expect(s.balance).toBe(835);
  });

  it("5. sin abonos, 3 quincenas al 10% -> 300", () => {
    const s = computeLoan(loan(), "2026-02-01");
    expect(s.periods.map((p) => p.interest)).toEqual([100, 100, 100]);
    expect(s.interestOutstanding).toBe(300);
    expect(s.balance).toBe(1300);
  });

  it("6. previewPayment rechaza abono mayor a la deuda total (1135)", () => {
    const l = userLoan([pay("a", 150, "2026-01-15"), pay("b", 100, "2026-01-20")]);
    const over = previewPayment(l, { amount: 1135.01, paid_at: "2026-02-01" }, "2026-02-01");
    expect(over.valid).toBe(false);
    expect(over.reason).toBe("exceeds_debt");
    expect(over.owedAtDate).toBe(1135);
    expect(over.maxAmount).toBe(1135);
    const exact = previewPayment(l, { amount: 1135, paid_at: "2026-02-01" }, "2026-02-01");
    expect(exact.valid).toBe(true);
    expect(exact.allocation).toMatchObject({ toInterest: 185, toPrincipal: 950, totalOwed: 0, excess: 0 });
  });
});

describe("abono vs interés pendiente (1000 al 10%, Q1 = 100)", () => {
  it("menor (40)", () => {
    const s = computeLoan(loan({ payments: [pay("a", 40, "2026-01-10")] }), "2026-01-10");
    expect(s.allocations[0]).toMatchObject({ toInterest: 40, toPrincipal: 0, interestOutstanding: 60, principalOutstanding: 1000, totalOwed: 1060 });
  });
  it("igual (100)", () => {
    const s = computeLoan(loan({ payments: [pay("a", 100, "2026-01-10")] }), "2026-01-10");
    expect(s.allocations[0]).toMatchObject({ toInterest: 100, toPrincipal: 0, interestOutstanding: 0, principalOutstanding: 1000, totalOwed: 1000 });
  });
  it("mayor (250) y Q2 sobre 850 = 85", () => {
    const s = computeLoan(loan({ payments: [pay("a", 250, "2026-01-10")] }), "2026-01-20");
    expect(s.allocations[0]).toMatchObject({ toInterest: 100, toPrincipal: 150, interestOutstanding: 0, principalOutstanding: 850, totalOwed: 850 });
    expect(s.periods[1].interest).toBe(85);
    expect(s.balance).toBe(935);
  });
});

describe("deuda total", () => {
  it("abono exactamente igual (1100) liquida y no genera más interés", () => {
    const l = loan({ payments: [pay("a", 1100, "2026-01-10")] });
    const s = computeLoan(l, "2026-03-01");
    expect(s.allocations[0]).toMatchObject({ toInterest: 100, toPrincipal: 1000, totalOwed: 0, excess: 0 });
    expect(s.interestCharged).toBe(100);
    expect(s.balance).toBe(0);
    expect(s.status).toBe("paid");
    const p = previewPayment(loan(), { amount: 1100, paid_at: "2026-01-10" }, "2026-01-10");
    expect(p.valid).toBe(true);
  });
  it("abono mayor (1100.01) se rechaza; máximo 1100", () => {
    const p = previewPayment(loan(), { amount: 1100.01, paid_at: "2026-01-10" }, "2026-01-10");
    expect(p.valid).toBe(false);
    expect(p.reason).toBe("exceeds_debt");
    expect(p.maxAmount).toBe(1100);
  });
  it("0 y negativo se rechazan", () => {
    for (const amount of [0, -50, -0.01]) {
      const p = previewPayment(loan(), { amount, paid_at: "2026-01-10" }, "2026-01-10");
      expect(p.valid).toBe(false);
      expect(p.reason).toBe("non_positive");
    }
  });
});

describe("varios abonos seguidos", () => {
  it("30, 30, 60 en Q1", () => {
    const s = computeLoan(
      loan({ payments: [pay("a", 30, "2026-01-05"), pay("b", 30, "2026-01-10"), pay("c", 60, "2026-01-14")] }),
      "2026-01-20",
    );
    expect(s.allocations.map((a) => [a.toInterest, a.toPrincipal, a.interestOutstanding, a.principalOutstanding])).toEqual([
      [30, 0, 70, 1000],
      [30, 0, 40, 1000],
      [40, 20, 0, 980],
    ]);
    expect(s.periods[1].interest).toBe(98);
  });
  it("mismo día, ordenados por created_at", () => {
    const s = computeLoan(
      loan({ payments: [pay("b", 70, "2026-01-10", "2026-01-10T10:00:00Z"), pay("a", 50, "2026-01-10", "2026-01-10T09:00:00Z")] }),
      "2026-01-10",
    );
    expect(s.allocations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(s.allocations[1]).toMatchObject({ toInterest: 50, toPrincipal: 20, principalOutstanding: 980 });
  });
});

describe("tasas", () => {
  it("tasa 0% en todas", () => {
    const s = computeLoan(loan({ default_rate: 0, payments: [pay("a", 200, "2026-01-20")] }), "2026-03-01");
    expect(s.interestCharged).toBe(0);
    expect(s.allocations[0]).toMatchObject({ toInterest: 0, toPrincipal: 200, principalOutstanding: 800 });
    expect(s.balance).toBe(800);
  });
  it("Q2 al 0% entre quincenas al 10%", () => {
    const s = computeLoan(loan({ rates: [{ period_number: 2, rate: 0 }] }), "2026-02-01");
    expect(s.periods.map((p) => p.interest)).toEqual([100, 0, 100]);
    expect(s.interestOutstanding).toBe(200);
  });
  it("5%, 7.5%, 12.5%", () => {
    const s = computeLoan(
      loan({ rates: [{ period_number: 1, rate: 5 }, { period_number: 2, rate: 7.5 }, { period_number: 3, rate: 12.5 }] }),
      "2026-02-01",
    );
    expect(s.periods.map((p) => p.interest)).toEqual([50, 75, 125]);
    expect(s.interestOutstanding).toBe(250);
  });
});

describe("centavos y redondeo (half-up a 2 decimales por periodo)", () => {
  it("333.33 al 12.5% -> 41.67; dos quincenas 83.34", () => {
    const s1 = computeLoan(loan({ principal: 333.33, default_rate: 12.5 }), "2026-01-01");
    expect(s1.periods[0].interest).toBe(41.67);
    const s2 = computeLoan(loan({ principal: 333.33, default_rate: 12.5 }), "2026-01-15");
    expect(s2.interestOutstanding).toBe(83.34);
    expect(s2.balance).toBe(416.67);
  });
  it("1234.56 al 7.25% -> 89.5056 -> 89.51", () => {
    expect(computeLoan(loan({ principal: 1234.56, default_rate: 7.25 }), "2026-01-01").periods[0].interest).toBe(89.51);
  });
  it("abonos 0.1 y 0.2 sobre interés 1.00 -> pendiente exactamente 0.70", () => {
    const s = computeLoan(loan({ principal: 100, default_rate: 1, payments: [pay("a", 0.1, "2026-01-02"), pay("b", 0.2, "2026-01-03")] }), "2026-01-03");
    expect(s.interestOutstanding).toBe(0.7);
    expect(s.balance).toBe(100.7);
  });
  it("medio centavo exacto: 3 al 0.5% = 0.015 -> 0.02", () => {
    expect(computeLoan(loan({ principal: 3, default_rate: 0.5 }), "2026-01-01").periods[0].interest).toBe(0.02);
  });
  it("medio centavo con error de coma flotante: 250 al 1.13% = 2.825 -> 2.83", () => {
    expect(computeLoan(loan({ principal: 250, default_rate: 1.13 }), "2026-01-01").periods[0].interest).toBe(2.83);
  });
  it("medio centavo con error de coma flotante: 65 al 2.3% = 1.495 -> 1.50", () => {
    expect(computeLoan(loan({ principal: 65, default_rate: 2.3 }), "2026-01-01").periods[0].interest).toBe(1.5);
  });
  it("medio centavo con error de coma flotante: 500 al 1.001% = 5.005 -> 5.01", () => {
    expect(computeLoan(loan({ principal: 500, default_rate: 1.001 }), "2026-01-01").periods[0].interest).toBe(5.01);
  });
});

describe("préstamo cancelado", () => {
  it("cancelado el 01-20: solo Q1 y Q2 (200)", () => {
    const s = computeLoan(loan({ cancelled_at: "2026-01-20T12:00:00+00:00" }), "2026-03-01");
    expect(s.periods.map((p) => p.interest)).toEqual([100, 100]);
    expect(s.interestOutstanding).toBe(200);
    expect(s.status).toBe("cancelled");
  });
  // Decisión del usuario: la quincena que empieza el mismo día de la cancelación sí se cobra.
  it("cancelado justo el día que empieza Q3 (01-31): Q3 sí se cobra (300)", () => {
    const s = computeLoan(loan({ cancelled_at: "2026-01-31" }), "2026-03-01");
    expect(s.interestOutstanding).toBe(300);
    expect(s.status).toBe("cancelled");
  });
});
