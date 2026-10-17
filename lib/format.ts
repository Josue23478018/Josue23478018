const DEFAULT_TIMEZONE = "America/Panama";

// Una zona inválida (p. ej. con espacios o "Panama") haría fallar todas las páginas,
// así que se valida y, si no sirve, se usa la zona por defecto.
export function resolveTimezone(value: string | undefined): string {
  const tz = value?.trim();
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    console.error(`APP_TIMEZONE inválida: "${value}". Usando ${DEFAULT_TIMEZONE}.`);
    return DEFAULT_TIMEZONE;
  }
}

// Zona horaria usada para decidir qué es "hoy" (y por tanto qué está atrasado).
export const TIMEZONE = resolveTimezone(process.env.APP_TIMEZONE);

export function today(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(amount);
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export const CURRENCIES = ["USD", "MXN", "COP", "EUR", "ARS", "CLP", "PEN", "DOP", "GTQ", "VES", "BRL"];

export const FREQUENCY_LABEL = { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual" } as const;
