import { describe, expect, it } from "vitest";
import {
  addDays,
  buildSchedule,
  computeTotalDue,
  summarizeLoan,
  type LoanForSummary,
} from "./calc";

describe("computeTotalDue", () => {
  it("sin interés devuelve el principal", () => {
    expect(computeTotalDue({ principal: 1000, rate: 0, period: "total", startDate: "2026-01-01", endDate: "2026-06-01" })).toBe(1000);
  });

  it("interés total se aplica una sola vez", () => {
    expect(computeTotalDue({ principal: 1000, rate: 10, period: "total", startDate: "2026-01-01", endDate: "2026-12-01" })).toBe(1100);
  });

  it("interés mensual se multiplica por los meses del plazo", () => {
    // 3 meses al 5% mensual = 15%
    expect(computeTotalDue({ principal: 1000, rate: 5, period: "monthly", startDate: "2026-01-15", endDate: "2026-04-15" })).toBe(1150);
  });

  it("interés mensual cobra un mes mínimo aunque el plazo sea menor", () => {
    expect(computeTotalDue({ principal: 1000, rate: 5, period: "monthly", startDate: "2026-01-01", endDate: "2026-01-10" })).toBe(1050);
  });

  it("redondea a centavos", () => {
    expect(computeTotalDue({ principal: 333.33, rate: 3, period: "total", startDate: "2026-01-01", endDate: "2026-02-01" })).toBe(343.33);
  });
});

describe("buildSchedule", () => {
  it("pago único genera una cuota por el total", () => {
    expect(buildSchedule({ total: 1100, type: "single", firstDueDate: "2026-03-01" })).toEqual([
      { number: 1, due_date: "2026-03-01", amount_due: 1100 },
    ]);
  });

  it("reparte en cuotas y la última absorbe el redondeo", () => {
    const s = buildSchedule({ total: 100, type: "installments", firstDueDate: "2026-01-31", frequency: "monthly", count: 3 });
    expect(s.map((i) => i.amount_due)).toEqual([33.33, 33.33, 33.34]);
    // fin de mes se ajusta al último día disponible
    expect(s.map((i) => i.due_date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("frecuencia semanal y quincenal", () => {
    const w = buildSchedule({ total: 20, type: "installments", firstDueDate: "2026-01-01", frequency: "weekly", count: 2 });
    expect(w.map((i) => i.due_date)).toEqual(["2026-01-01", "2026-01-08"]);
    const b = buildSchedule({ total: 20, type: "installments", firstDueDate: "2026-01-01", frequency: "biweekly", count: 2 });
    expect(b.map((i) => i.due_date)).toEqual(["2026-01-01", "2026-01-15"]);
  });
});

describe("summarizeLoan", () => {
  const base: LoanForSummary = {
    total_due: 300,
    cancelled_at: null,
    installments: [
      { number: 1, due_date: "2026-01-10", amount_due: 100 },
      { number: 2, due_date: "2026-02-10", amount_due: 100 },
      { number: 3, due_date: "2026-03-10", amount_due: 100 },
    ],
    payments: [],
  };

  it("activo cuando no hay cuotas vencidas", () => {
    const s = summarizeLoan(base, "2026-01-05");
    expect(s.status).toBe("active");
    expect(s.balance).toBe(300);
    expect(s.nextDue).toEqual({ number: 1, due_date: "2026-01-10", remaining: 100 });
  });

  it("el día del vencimiento todavía no está atrasado", () => {
    expect(summarizeLoan(base, "2026-01-10").status).toBe("active");
  });

  it("atrasado cuando una cuota vencida no está cubierta", () => {
    const s = summarizeLoan(base, "2026-01-11");
    expect(s.status).toBe("overdue");
    expect(s.overdueAmount).toBe(100);
  });

  it("pago parcial aplica a la cuota más antigua", () => {
    const s = summarizeLoan({ ...base, payments: [{ amount: 150 }] }, "2026-01-20");
    expect(s.status).toBe("active");
    expect(s.paid).toBe(150);
    expect(s.nextDue).toEqual({ number: 2, due_date: "2026-02-10", remaining: 50 });
  });

  it("pagado cuando se cubre el total, incluso con sobrepago", () => {
    const s = summarizeLoan({ ...base, payments: [{ amount: 200 }, { amount: 150 }] }, "2026-05-01");
    expect(s.status).toBe("paid");
    expect(s.balance).toBe(0);
    expect(s.nextDue).toBeNull();
  });

  it("cancelado tiene prioridad sobre atrasado", () => {
    expect(summarizeLoan({ ...base, cancelled_at: "2026-02-01T00:00:00Z" }, "2026-05-01").status).toBe("cancelled");
  });

  it("evita errores de coma flotante", () => {
    const s = summarizeLoan(
      { ...base, total_due: 0.3, installments: [{ number: 1, due_date: "2026-01-01", amount_due: 0.3 }], payments: [{ amount: 0.1 }, { amount: 0.2 }] },
      "2026-02-01",
    );
    expect(s.status).toBe("paid");
  });
});

describe("addDays", () => {
  it("cruza meses", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
});
