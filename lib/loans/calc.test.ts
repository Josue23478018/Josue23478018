import { describe, expect, it } from "vitest";
import {
  addDays,
  interestCents,
  projectInterest,
  addMonths,
  computeLoan,
  cutDate,
  periodNumberAt,
  previewPayment,
  totalsByCurrency,
  type LoanInput,
} from "./calc";

// 1000 al 10% quincenal desde el 1 de enero: cortes el 15 y el 29 de enero, 12 de febrero...
const base: LoanInput = {
  principal: 1000,
  start_date: "2026-01-01",
  frequency: "biweekly",
  default_rate: 10,
  rates: [],
  payments: [],
  due_date: null,
  cancelled_at: null,
};

describe("fechas de corte", () => {
  it("quincenal suma 14 días por periodo", () => {
    expect(cutDate("2026-01-01", "biweekly", 1)).toBe("2026-01-15");
    expect(cutDate("2026-01-01", "biweekly", 2)).toBe("2026-01-29");
  });

  it("mensual se ancla a la fecha inicial y ajusta fin de mes", () => {
    expect(cutDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(cutDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
  });

  it("helpers de fecha", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });
});

describe("interés por quincena, cobrado al empezar sobre el capital pendiente", () => {
  it("el día del préstamo se cobra el interés de la primera quincena", () => {
    const s = computeLoan(base, "2026-01-01");
    expect(s.interestCharged).toBe(100);
    expect(s.balance).toBe(1100);
    expect(s.status).toBe("active");
    expect(s.next).toMatchObject({ number: 2, due_date: "2026-01-15", rate: 10, projectedInterest: 100 });
  });

  it("antes de la fecha del préstamo no hay interés", () => {
    const s = computeLoan(base, "2025-12-31");
    expect(s.interestCharged).toBe(0);
    expect(s.next).toMatchObject({ number: 1, due_date: "2026-01-01" });
  });

  it("no está atrasado hasta que vence la quincena", () => {
    const s = computeLoan(base, "2026-01-15");
    // el 15 vence la quincena 1 y empieza la 2
    expect(s.interestCharged).toBe(200);
    expect(s.status).toBe("active");
  });

  it("interés de una quincena vencida sin pagar queda atrasado", () => {
    const s = computeLoan(base, "2026-01-16");
    expect(s.status).toBe("overdue");
    expect(s.overdueAmount).toBe(100);
  });

  it("el interés no pagado NO genera interés: cada quincena cobra solo sobre el capital", () => {
    const s = computeLoan(base, "2026-01-29");
    expect(s.periods.filter((p) => p.accrued).map((p) => [p.base, p.interest])).toEqual([
      [1000, 100],
      [1000, 100],
      [1000, 100],
    ]);
    expect(s.principalOutstanding).toBe(1000);
    expect(s.interestOutstanding).toBe(300);
  });

  it("cada quincena puede tener una tasa distinta", () => {
    const s = computeLoan({ ...base, rates: [{ period_number: 2, rate: 20 }] }, "2026-01-15");
    expect(s.periods.filter((p) => p.accrued).map((p) => [p.rate, p.interest])).toEqual([
      [10, 100],
      [20, 200],
    ]);
    expect(s.periods[1].overridden).toBe(true);
  });

  it("la tasa de una quincena futura se usa en la proyección", () => {
    const s = computeLoan({ ...base, rates: [{ period_number: 2, rate: 5 }] }, "2026-01-10");
    expect(s.next).toMatchObject({ number: 2, rate: 5, projectedInterest: 50 });
  });

  it("tasa 0 no genera interés", () => {
    const s = computeLoan({ ...base, default_rate: 0 }, "2026-03-01");
    expect(s.interestCharged).toBe(0);
  });

  it("redondea el interés de cada quincena a centavos", () => {
    const s = computeLoan({ ...base, principal: 333.33, default_rate: 3 }, "2026-01-01");
    expect(s.interestCharged).toBe(10); // 9.9999 → 10.00
  });
});

describe("abonos: primero el interés, lo que sobra al capital", () => {
  it("200 al 20%, abono de 50 antes de terminar la quincena: 40 interés y 10 capital", () => {
    const s = computeLoan(
      { ...base, principal: 200, default_rate: 20, payments: [{ id: "a", amount: 50, paid_at: "2026-01-05" }] },
      "2026-01-10",
    );
    expect(s.allocations[0]).toEqual({ id: "a", amount: 50, toInterest: 40, toPrincipal: 10, excess: 0, interestOutstanding: 0, principalOutstanding: 190, totalOwed: 190 });
    expect(s.principalOutstanding).toBe(190);
    expect(s.interestOutstanding).toBe(0);
  });

  it("1000, quincena 1 al 10% con abono de 150, quincena 2 al 20%: capital 950 e interés 190", () => {
    const s = computeLoan(
      { ...base, rates: [{ period_number: 2, rate: 20 }], payments: [{ id: "a", amount: 150, paid_at: "2026-01-15" }] },
      "2026-01-20",
    );
    // el abono del día 15 pertenece a la quincena 1, que vence ese día
    expect(s.allocations[0]).toEqual({ id: "a", amount: 150, toInterest: 100, toPrincipal: 50, excess: 0, interestOutstanding: 0, principalOutstanding: 950, totalOwed: 950 });
    expect(s.principalOutstanding).toBe(950);
    expect(s.periods[1]).toMatchObject({ base: 950, rate: 20, interest: 190 });
    expect(s.interestOutstanding).toBe(190);
    expect(s.status).toBe("active");
  });

  it("abono a capital baja el interés de la quincena siguiente, no el de la actual", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 500, paid_at: "2026-01-10" }] }, "2026-01-15");
    expect(s.allocations[0]).toEqual({ id: "a", amount: 500, toInterest: 100, toPrincipal: 400, excess: 0, interestOutstanding: 0, principalOutstanding: 600, totalOwed: 600 });
    expect(s.periods[1]).toMatchObject({ base: 600, interest: 60 });
  });

  it("abono que no cubre el interés no reduce el capital", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 60, paid_at: "2026-01-10" }] }, "2026-01-20");
    expect(s.allocations[0]).toEqual({ id: "a", amount: 60, toInterest: 60, toPrincipal: 0, excess: 0, interestOutstanding: 40, principalOutstanding: 1000, totalOwed: 1040 });
    expect(s.periods[1]).toMatchObject({ base: 1000, interest: 100 });
    expect(s.interestOutstanding).toBe(140);
    expect(s.overdueAmount).toBe(40);
  });

  it("varios abonos se aplican en orden de fecha", () => {
    const s = computeLoan(
      {
        ...base,
        payments: [
          { id: "b", amount: 50, paid_at: "2026-01-29" },
          { id: "a", amount: 150, paid_at: "2026-01-16" },
        ],
      },
      "2026-01-30",
    );
    // quincenas 1 y 2: 100 + 100; a cubre 150 de interés; b cubre los 50 restantes
    expect(s.allocations).toEqual([
      { id: "a", amount: 150, toInterest: 150, toPrincipal: 0, excess: 0, interestOutstanding: 50, principalOutstanding: 1000, totalOwed: 1050 },
      { id: "b", amount: 50, toInterest: 50, toPrincipal: 0, excess: 0, interestOutstanding: 0, principalOutstanding: 1000, totalOwed: 1000 },
    ]);
    // quincena 3 (desde el 29) aún no vence
    expect(s.interestOutstanding).toBe(100);
    expect(s.status).toBe("active");
  });

  it("pagado: deja de generar interés y el excedente se reporta", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 1200, paid_at: "2026-01-10" }] }, "2026-06-01");
    expect(s.allocations[0]).toEqual({ id: "a", amount: 1200, toInterest: 100, toPrincipal: 1000, excess: 100, interestOutstanding: 0, principalOutstanding: 0, totalOwed: 0 });
    expect(s.status).toBe("paid");
    expect(s.interestCharged).toBe(100);
    expect(s.next).toBeNull();
  });

  it("si el capital llega a cero el día del vencimiento, no se cobra la quincena siguiente", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 1100, paid_at: "2026-01-15" }] }, "2026-06-01");
    expect(s.interestCharged).toBe(100);
    expect(s.status).toBe("paid");
  });

  it("evita errores de coma flotante", () => {
    const s = computeLoan(
      {
        ...base,
        principal: 0.3,
        default_rate: 0,
        payments: [
          { id: "a", amount: 0.1, paid_at: "2026-01-02" },
          { id: "b", amount: 0.2, paid_at: "2026-01-03" },
        ],
      },
      "2026-02-01",
    );
    expect(s.status).toBe("paid");
  });
});

// Escenario del reporte "el segundo abono no muestra el interés":
// 1000 quincenal desde el 1 de enero; Q1 10%, Q2 20%, Q3 10%.
const escenario: LoanInput = {
  ...base,
  rates: [
    { period_number: 1, rate: 10 },
    { period_number: 2, rate: 20 },
    { period_number: 3, rate: 10 },
  ],
  payments: [
    { id: "p150", amount: 150, paid_at: "2026-01-15" },
    { id: "p100", amount: 100, paid_at: "2026-01-20" },
    { id: "p300", amount: 300, paid_at: "2026-02-01" },
  ],
};

describe("desglose por abono", () => {
  const s = computeLoan(escenario, "2026-02-01");
  const byId = new Map(s.allocations.map((a) => [a.id, a]));

  it("abono de 150 el 15 (vence Q1): 100 a interés, 50 a capital", () => {
    expect(byId.get("p150")).toEqual({
      id: "p150",
      amount: 150,
      toInterest: 100,
      toPrincipal: 50,
      excess: 0,
      interestOutstanding: 0,
      principalOutstanding: 950,
      totalOwed: 950,
    });
  });

  it("segundo abono, de 100 el 20 dentro de Q2: va a interés porque Q2 ya cobró 190", () => {
    expect(s.periods[1]).toMatchObject({ number: 2, base: 950, interest: 190 });
    expect(byId.get("p100")).toEqual({
      id: "p100",
      amount: 100,
      toInterest: 100,
      toPrincipal: 0,
      excess: 0,
      interestOutstanding: 90,
      principalOutstanding: 950,
      totalOwed: 1040,
    });
  });

  it("abono de 300 el 1 de febrero, después de que Q3 cobró 95: cubre 185 de interés y 115 de capital", () => {
    expect(s.periods[2]).toMatchObject({ number: 3, start: "2026-01-29", base: 950, interest: 95 });
    expect(byId.get("p300")).toEqual({
      id: "p300",
      amount: 300,
      toInterest: 185,
      toPrincipal: 115,
      excess: 0,
      interestOutstanding: 0,
      principalOutstanding: 835,
      totalOwed: 835,
    });
    expect(s.balance).toBe(835);
  });

  it("antes del abono de 300 el total adeudado es 1135", () => {
    const sinUltimo = computeLoan({ ...escenario, payments: escenario.payments.slice(0, 2) }, "2026-02-01");
    expect(sinUltimo.interestOutstanding).toBe(185);
    expect(sinUltimo.balance).toBe(1135);
  });

  it("sin abonos: tres quincenas al 10% sobre 1000 dejan 300 de interés pendiente", () => {
    const sinAbonos = computeLoan(base, "2026-02-01");
    expect(sinAbonos.allocations).toEqual([]);
    expect(sinAbonos.interestOutstanding).toBe(300);
    expect(sinAbonos.balance).toBe(1300);
  });
});

describe("periodNumberAt", () => {
  it("el día del corte pertenece al periodo que vence", () => {
    expect(periodNumberAt("2026-01-01", "biweekly", "2026-01-01")).toBe(1);
    expect(periodNumberAt("2026-01-01", "biweekly", "2026-01-15")).toBe(1);
    expect(periodNumberAt("2026-01-01", "biweekly", "2026-01-16")).toBe(2);
    expect(periodNumberAt("2026-01-01", "biweekly", "2025-12-31")).toBe(0);
  });
});

describe("previewPayment", () => {
  // Con los dos primeros abonos del escenario, el 1 de febrero se deben 950 de capital + 185 de interés.
  const loan: LoanInput = { ...escenario, payments: escenario.payments.slice(0, 2) };
  const at = (amount: number, nextRate?: number) =>
    previewPayment(loan, { amount, paid_at: "2026-02-01" }, "2026-02-01", nextRate);

  it("abono menor al interés pendiente: todo a interés", () => {
    const p = at(100);
    expect(p.valid).toBe(true);
    expect(p.reason).toBeNull();
    expect(p.allocation).toMatchObject({ amount: 100, toInterest: 100, toPrincipal: 0, interestOutstanding: 85, principalOutstanding: 950, totalOwed: 1035 });
    expect(p.owedAtDate).toBe(1135);
    expect(p.maxAmount).toBe(1135);
  });

  it("abono igual al interés pendiente: deja el interés en 0", () => {
    const p = at(185);
    expect(p.valid).toBe(true);
    expect(p.allocation).toMatchObject({ toInterest: 185, toPrincipal: 0, interestOutstanding: 0, principalOutstanding: 950, totalOwed: 950 });
  });

  it("abono mayor al interés pendiente: el resto va a capital y se proyecta la quincena siguiente", () => {
    const p = at(300);
    expect(p.valid).toBe(true);
    expect(p.allocation).toMatchObject({ toInterest: 185, toPrincipal: 115, interestOutstanding: 0, principalOutstanding: 835, totalOwed: 835 });
    // el 1 de febrero está en Q3 (29 ene – 12 feb); la siguiente es Q4, que empieza el 12 de febrero
    expect(p.next).toEqual({ number: 4, start: "2026-02-12", rate: 10, configuredRate: 10, projectedInterest: 83.5 });
  });

  it("abono exactamente igual a la deuda total: válido y deja todo en 0", () => {
    const p = at(1135);
    expect(p.valid).toBe(true);
    expect(p.allocation).toMatchObject({ toInterest: 185, toPrincipal: 950, excess: 0, interestOutstanding: 0, principalOutstanding: 0, totalOwed: 0 });
    expect(p.next.projectedInterest).toBe(0);
  });

  it("abono mayor a la deuda total: rechazado con el máximo", () => {
    const p = at(1135.01);
    expect(p.valid).toBe(false);
    expect(p.reason).toBe("exceeds_debt");
    expect(p.allocation.excess).toBe(0.01);
    expect(p.maxAmount).toBe(1135);
  });

  it("0 y negativo: rechazados", () => {
    expect(at(0)).toMatchObject({ valid: false, reason: "non_positive" });
    expect(at(-5)).toMatchObject({ valid: false, reason: "non_positive" });
    expect(at(Number.NaN)).toMatchObject({ valid: false, reason: "non_positive" });
  });

  it("vista previa con una tasa siguiente distinta", () => {
    const p = at(300, 25);
    expect(p.next).toEqual({ number: 4, start: "2026-02-12", rate: 25, configuredRate: 10, projectedInterest: 208.75 });
  });

  it("usa la tasa configurada del periodo siguiente si existe", () => {
    const p = previewPayment(escenario, { amount: 150, paid_at: "2026-01-10" }, "2026-01-10");
    expect(p.next).toMatchObject({ number: 2, start: "2026-01-15", rate: 20, configuredRate: 20 });
  });

  it("rechaza un abono anterior que haría sobrar dinero en un abono posterior ya registrado", () => {
    // Con un abono de 1100 el 15, el préstamo queda pagado; uno previo de 50 el 10 haría sobrar 50.
    const l: LoanInput = { ...base, payments: [{ id: "x", amount: 1100, paid_at: "2026-01-15" }] };
    const p = previewPayment(l, { amount: 50, paid_at: "2026-01-10" }, "2026-01-20");
    expect(p.valid).toBe(false);
    expect(p.reason).toBe("exceeds_debt");
    expect(p.owedAtDate).toBe(1100);
    expect(p.maxAmount).toBe(0);
  });

  it("el abono nuevo del mismo día se aplica después de los ya registrados", () => {
    const p = previewPayment(escenario, { amount: 835, paid_at: "2026-02-01" }, "2026-02-01");
    expect(p.valid).toBe(true);
    expect(p.owedAtDate).toBe(835);
    expect(p.allocation).toMatchObject({ toInterest: 0, toPrincipal: 835, totalOwed: 0 });
  });
});

describe("estados", () => {
  it("atrasado si pasó la fecha límite y queda saldo", () => {
    const s = computeLoan({ ...base, default_rate: 0, due_date: "2026-02-01" }, "2026-02-02");
    expect(s.status).toBe("overdue");
    expect(s.overdueAmount).toBe(1000);
  });

  it("cancelado deja de generar interés desde la fecha de cancelación", () => {
    const s = computeLoan({ ...base, cancelled_at: "2026-01-20T12:00:00Z" }, "2026-06-01");
    expect(s.status).toBe("cancelled");
    expect(s.interestCharged).toBe(200); // quincenas 1 y 2
    expect(s.next).toBeNull();
  });

  it("incluye quincenas futuras para poder fijar su tasa", () => {
    const s = computeLoan(base, "2026-01-20", { futurePeriods: 3 });
    expect(s.periods.map((p) => [p.number, p.accrued])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
      [5, false],
    ]);
  });
});

describe("interés acumulado por periodo", () => {
  it("suma el interés generado hasta cada quincena, con tasas distintas", () => {
    const s = computeLoan({ ...base, rates: [{ period_number: 2, rate: 20 }] }, "2026-01-29");
    expect(s.periods.map((p) => p.interestAccumulated)).toEqual([100, 300, 400]);
  });

  it("incluye el interés ya pagado y baja cuando un abono reduce el capital", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 600, paid_at: "2026-01-10" }] }, "2026-01-15");
    // quincena 1: 100; abono: 100 interés + 500 capital; quincena 2: 10% de 500 = 50
    expect(s.periods.map((p) => p.interestAccumulated)).toEqual([100, 150]);
  });

  it("es nulo en periodos futuros", () => {
    const s = computeLoan(base, "2026-01-10", { futurePeriods: 1 });
    expect(s.periods.map((p) => p.interestAccumulated)).toEqual([100, null]);
  });
});

describe("totalsByCurrency", () => {
  const loan = (currency: string, balance: number) => ({
    currency,
    summary: { ...computeLoan(base, "2026-01-01"), balance },
  });

  it("agrupa por moneda sin mezclar y sin errores de coma flotante", () => {
    expect(totalsByCurrency([loan("USD", 0.1), loan("MXN", 50), loan("USD", 0.2)], "balance")).toEqual([
      ["USD", 0.3],
      ["MXN", 50],
    ]);
  });

  it("omite monedas con total cero", () => {
    expect(totalsByCurrency([loan("USD", 0)], "balance")).toEqual([]);
  });
});

describe("interestCents: aritmética exacta y redondeo mitad hacia arriba", () => {
  it("medio centavo sube (casos que en coma flotante bajaban)", () => {
    expect(interestCents(25000, 1.13)).toBe(283); // 2.825 → 2.83
    expect(interestCents(6500, 2.3)).toBe(150); // 1.495 → 1.50
    expect(interestCents(50000, 1.001)).toBe(501); // 5.005 → 5.01
    expect(interestCents(300, 0.5)).toBe(2); // 0.015 → 0.02
  });

  it("redondeo normal", () => {
    expect(interestCents(33333, 12.5)).toBe(4167); // 41.66625 → 41.67
    expect(interestCents(123456, 7.25)).toBe(8951); // 89.5056 → 89.51
    expect(interestCents(100000, 10)).toBe(10000);
    expect(interestCents(100000, 0)).toBe(0);
  });

  it("montos grandes sin perder precisión", () => {
    expect(interestCents(99999999999999, 999.999)).toBe(999998999999990); // 999.999% de 999 999 999 999.99
  });
});

describe("projectInterest", () => {
  it("interés de la siguiente quincena sobre el capital que queda", () => {
    expect(projectInterest(170, 20)).toBe(34);
    expect(projectInterest(950, 20)).toBe(190);
    expect(projectInterest(250, 1.13)).toBe(2.83);
    expect(projectInterest(170, 0)).toBe(0);
  });
});
