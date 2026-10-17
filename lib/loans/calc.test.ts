import { describe, expect, it } from "vitest";
import { addDays, addMonths, computeLoan, cutDate, totalsByCurrency, type LoanInput } from "./calc";

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
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 40, toPrincipal: 10, excess: 0 });
    expect(s.principalOutstanding).toBe(190);
    expect(s.interestOutstanding).toBe(0);
  });

  it("1000, quincena 1 al 10% con abono de 150, quincena 2 al 20%: capital 950 e interés 190", () => {
    const s = computeLoan(
      { ...base, rates: [{ period_number: 2, rate: 20 }], payments: [{ id: "a", amount: 150, paid_at: "2026-01-15" }] },
      "2026-01-20",
    );
    // el abono del día 15 pertenece a la quincena 1, que vence ese día
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 50, excess: 0 });
    expect(s.principalOutstanding).toBe(950);
    expect(s.periods[1]).toMatchObject({ base: 950, rate: 20, interest: 190 });
    expect(s.interestOutstanding).toBe(190);
    expect(s.status).toBe("active");
  });

  it("abono a capital baja el interés de la quincena siguiente, no el de la actual", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 500, paid_at: "2026-01-10" }] }, "2026-01-15");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 400, excess: 0 });
    expect(s.periods[1]).toMatchObject({ base: 600, interest: 60 });
  });

  it("abono que no cubre el interés no reduce el capital", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 60, paid_at: "2026-01-10" }] }, "2026-01-20");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 60, toPrincipal: 0, excess: 0 });
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
      { id: "a", toInterest: 150, toPrincipal: 0, excess: 0 },
      { id: "b", toInterest: 50, toPrincipal: 0, excess: 0 },
    ]);
    // quincena 3 (desde el 29) aún no vence
    expect(s.interestOutstanding).toBe(100);
    expect(s.status).toBe("active");
  });

  it("pagado: deja de generar interés y el excedente se reporta", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 1200, paid_at: "2026-01-10" }] }, "2026-06-01");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 1000, excess: 100 });
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
