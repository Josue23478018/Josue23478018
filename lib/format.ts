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

// El día cambia a las 12:00 a. m. en la zona de la app (no en UTC).
export function today(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(now);
}

// Fecha local (YYYY-MM-DD en la zona de la app) de un instante guardado en UTC.
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date(iso));
}

export function formatMoney(amount: number, currency: string): string {
  // Formato de Panamá: punto decimal y coma de miles, siempre 2 decimales (USD 1,135.50).
  return new Intl.NumberFormat("es-PA", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export const CURRENCIES = ["USD", "MXN", "COP", "EUR", "ARS", "CLP", "PEN", "DOP", "GTQ", "VES", "BRL"];

export const FREQUENCY_LABEL = { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual" } as const;
