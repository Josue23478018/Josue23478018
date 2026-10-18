import { describe, expect, it } from "vitest";
import { formatMoney, resolveTimezone, today } from "./format";

describe("resolveTimezone", () => {
  it("acepta una zona válida", () => {
    expect(resolveTimezone("America/Panama")).toBe("America/Panama");
  });

  it("quita espacios alrededor", () => {
    expect(resolveTimezone(" America/Panama ")).toBe("America/Panama");
  });

  it("usa Panamá si falta o es inválida", () => {
    expect(resolveTimezone(undefined)).toBe("America/Panama");
    expect(resolveTimezone("")).toBe("America/Panama");
    expect(resolveTimezone("Panama")).toBe("America/Panama");
  });
});

describe("today", () => {
  it("cambia de día a las 12:00 a. m. hora de Panamá, no a medianoche UTC", () => {
    expect(today(new Date("2026-10-18T04:59:59Z"))).toBe("2026-10-17"); // 11:59:59 p. m. en Panamá
    expect(today(new Date("2026-10-18T05:00:00Z"))).toBe("2026-10-18"); // 12:00 a. m. en Panamá
    expect(today(new Date("2026-10-18T02:00:00Z"))).toBe("2026-10-17"); // ya es 18 en UTC, aún 17 en Panamá
  });
});

describe("formatMoney", () => {
  // Intl separa "USD" del número con un espacio que no se parte (U+00A0).
  const plain = (s: string) => s.replace(/\u00a0/g, " ");
  it("usa punto decimal, coma de miles y siempre 2 decimales", () => {
    expect(plain(formatMoney(1135.5, "USD"))).toBe("USD 1,135.50");
    expect(plain(formatMoney(1234567.891, "USD"))).toBe("USD 1,234,567.89");
    expect(plain(formatMoney(0.3, "USD"))).toBe("USD 0.30");
  });
});
