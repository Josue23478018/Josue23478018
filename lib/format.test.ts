import { describe, expect, it } from "vitest";
import { resolveTimezone } from "./format";

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
