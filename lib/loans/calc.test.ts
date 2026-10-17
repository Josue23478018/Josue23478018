import { describe, expect, it } from "vitest";
import { addDays, addMonths, computeLoan, cutDate, type LoanInput } from "./calc";

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

describe("interés compuesto por periodo", () => {
  it("antes del primer corte no hay interés", () => {
    const s = computeLoan(base, "2026-01-14");
    expect(s.interestCharged).toBe(0);
    expect(s.balance).toBe(1000);
    expect(s.status).toBe("active");
    expect(s.next).toMatchObject({ number: 1, due_date: "2026-01-15", rate: 10, projectedInterest: 100 });
  });

  it("el día del corte se cobra el interés y todavía no está atrasado", () => {
    const s = computeLoan(base, "2026-01-15");
    expect(s.interestCharged).toBe(100);
    expect(s.interestOutstanding).toBe(100);
    expect(s.status).toBe("active");
  });

  it("interés no pagado después del corte queda atrasado", () => {
    const s = computeLoan(base, "2026-01-16");
    expect(s.status).toBe("overdue");
    expect(s.overdueAmount).toBe(100);
  });

  it("el interés no pagado se capitaliza: el siguiente periodo cobra sobre principal + interés", () => {
    const s = computeLoan(base, "2026-01-29");
    // periodo 1: 10% de 1000 = 100; periodo 2: 10% de 1100 = 110
    expect(s.periods.filter((p) => p.accrued).map((p) => [p.base, p.interest])).toEqual([
      [1000, 100],
      [1100, 110],
    ]);
    expect(s.balance).toBe(1210);
  });

  it("cada periodo puede tener una tasa distinta", () => {
    const s = computeLoan({ ...base, rates: [{ period_number: 2, rate: 20 }] }, "2026-01-29");
    // periodo 1: 10% de 1000 = 100; periodo 2: 20% de 1100 = 220
    expect(s.periods.filter((p) => p.accrued).map((p) => [p.rate, p.interest])).toEqual([
      [10, 100],
      [20, 220],
    ]);
    expect(s.periods[1].overridden).toBe(true);
    expect(s.balance).toBe(1320);
  });

  it("la tasa de un periodo futuro se usa en la proyección", () => {
    const s = computeLoan({ ...base, rates: [{ period_number: 1, rate: 5 }] }, "2026-01-10");
    expect(s.next).toMatchObject({ rate: 5, projectedInterest: 50 });
  });

  it("tasa 0 no genera interés", () => {
    const s = computeLoan({ ...base, default_rate: 0 }, "2026-03-01");
    expect(s.interestCharged).toBe(0);
    expect(s.balance).toBe(1000);
  });

  it("redondea el interés de cada periodo a centavos", () => {
    const s = computeLoan({ ...base, principal: 333.33, default_rate: 3 }, "2026-01-15");
    expect(s.interestCharged).toBe(10); // 9.9999 → 10.00
  });
});

describe("aplicación de abonos: primero interés, luego principal", () => {
  it("pago en la fecha de corte cubre el interés recién generado", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 100, paid_at: "2026-01-15" }] }, "2026-01-20");
    expect(s.allocations).toEqual([{ id: "a", toInterest: 100, toPrincipal: 0, excess: 0 }]);
    expect(s.principalOutstanding).toBe(1000);
    expect(s.status).toBe("active");
  });

  it("lo que sobra después del interés reduce el principal y baja el interés siguiente", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 300, paid_at: "2026-01-15" }] }, "2026-01-29");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 200, excess: 0 });
    // periodo 2: 10% sobre 800
    expect(s.periods[1]).toMatchObject({ base: 800, interest: 80 });
    expect(s.balance).toBe(880);
  });

  it("abono a mitad de periodo reduce la base del siguiente corte", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 500, paid_at: "2026-01-20" }] }, "2026-01-29");
    // 01-20: 100 a interés pendiente, 400 a principal → 600; corte 01-29: 10% de 600
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 400, excess: 0 });
    expect(s.periods[1]).toMatchObject({ base: 600, interest: 60 });
  });

  it("abono antes del primer corte va directo al principal", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 200, paid_at: "2026-01-05" }] }, "2026-01-15");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 0, toPrincipal: 200, excess: 0 });
    expect(s.periods[0]).toMatchObject({ base: 800, interest: 80 });
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
    // a: 100 interés + 50 principal → 950; corte 01-29: 95; b: 50 a interés
    expect(s.allocations).toEqual([
      { id: "a", toInterest: 100, toPrincipal: 50, excess: 0 },
      { id: "b", toInterest: 50, toPrincipal: 0, excess: 0 },
    ]);
    expect(s.interestOutstanding).toBe(45);
    expect(s.status).toBe("overdue");
  });

  it("pagado: deja de generar interés y el excedente se reporta", () => {
    const s = computeLoan({ ...base, payments: [{ id: "a", amount: 1200, paid_at: "2026-01-15" }] }, "2026-06-01");
    expect(s.allocations[0]).toEqual({ id: "a", toInterest: 100, toPrincipal: 1000, excess: 100 });
    expect(s.status).toBe("paid");
    expect(s.balance).toBe(0);
    expect(s.interestCharged).toBe(100);
    expect(s.next).toBeNull();
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
    const s = computeLoan(
      { ...base, default_rate: 0, due_date: "2026-02-01" },
      "2026-02-02",
    );
    expect(s.status).toBe("overdue");
    expect(s.overdueAmount).toBe(1000);
  });

  it("cancelado deja de generar interés desde la fecha de cancelación", () => {
    const s = computeLoan({ ...base, cancelled_at: "2026-01-20T12:00:00Z" }, "2026-06-01");
    expect(s.status).toBe("cancelled");
    expect(s.interestCharged).toBe(100);
    expect(s.next).toBeNull();
  });

  it("incluye periodos futuros para poder fijar su tasa", () => {
    const s = computeLoan(base, "2026-01-20", { futurePeriods: 3 });
    expect(s.periods.map((p) => [p.number, p.accrued])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, false],
    ]);
  });
});
