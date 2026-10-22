// Asistente de préstamos: responde preguntas en español con cálculos exactos.
//
// No usa inteligencia artificial ni servicios externos (no cuesta nada): reconoce el tipo de
// pregunta con reglas de texto y calcula con las mismas funciones que usa la app
// (computeLoan, previewPayment, interestCents). Todo el dinero se maneja en centavos enteros.
import { formatDate, formatMoney } from "@/lib/format";
import {
  addDays,
  addMonths,
  computeLoan,
  cutDate,
  interestCents,
  periodRate,
  previewPayment,
  type Frequency,
  type LoanInput,
} from "./calc";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;
const MAX_PROJECTION = 600;
// Suma y resta de montos en centavos exactos.
const plus = (a: number, b: number) => fromCents(toCents(a) + toCents(b));
const minus = (a: number, b: number) => fromCents(toCents(a) - toCents(b));

// Primer periodo cuyo corte es >= day, y si day es justamente ese corte.
function periodAt(loan: LoanInput, day: string): { n: number; isCutDay: boolean } {
  let n = 1;
  while (n < MAX_PROJECTION && cutDate(loan.start_date, loan.frequency, n) < day) n++;
  return { n, isCutDay: cutDate(loan.start_date, loan.frequency, n) === day };
}

// Fecha dentro de `count` periodos a partir de `day`.
function periodsFrom(day: string, frequency: Frequency, count: number): string {
  if (frequency === "weekly") return addDays(day, 7 * count);
  // Una quincena es medio mes: dos quincenas son un mes y la sobrante suma 15 días.
  if (frequency === "biweekly") return addDays(addMonths(day, Math.floor(count / 2)), 15 * (count % 2));
  return addMonths(day, count);
}

const NOUN: Record<Frequency, [string, string]> = {
  weekly: ["semana", "semanas"],
  biweekly: ["quincena", "quincenas"],
  monthly: ["mes", "meses"],
};

export type AssistantContext = {
  /** Préstamo sobre el que se pregunta; null para preguntas hipotéticas ("si presto 500…"). */
  loan: LoanInput | null;
  currency: string;
  today: string;
  borrowerName?: string;
};

export type AssistantReply = {
  text: string;
  table?: {
    headers: string[];
    rows: string[][];
    /** Columnas que se ven en celular; las demás aparecen desde pantallas medianas. */
    phone?: number[];
    /** Columnas que solo se ven en celular (resumen de las ocultas). */
    phoneOnly?: number[];
  };
};

// ---------------------------------------------------------------------------
// Proyección a futuro
// ---------------------------------------------------------------------------

export type ProjectionRow = {
  number: number;
  start: string;
  end: string;
  rate: number;
  interest: number;
  payment: number;
  toInterest: number;
  toPrincipal: number;
  principalAfter: number;
  interestAfter: number;
};

export type Projection = {
  rows: ProjectionRow[];
  /** Capital e interés pendientes hoy, antes de los abonos proyectados. */
  principalNow: number;
  interestNow: number;
  paidOff: boolean;
  totalPaid: number;
  totalInterest: number;
};

/**
 * Proyecta el préstamo desde hoy suponiendo un abono fijo al vencer cada periodo.
 * - El interés del periodo en curso ya está cobrado (está en interestNow).
 * - Cada abono se hace el día de corte: cubre primero el interés pendiente y luego capital;
 *   después empieza el periodo siguiente y cobra su tasa sobre el capital que quedó.
 * - El último abono se limita a lo que se debe (no deja sobrante).
 * Se verifica en los tests contra computeLoan con los mismos abonos.
 */
export function projectLoan(
  loan: LoanInput,
  today: string,
  opts: { periods: number; payment: number; rate?: number },
): Projection {
  const day = today < loan.start_date ? loan.start_date : today;
  // Periodo en curso: el que vence hoy o después. Si hoy es día de corte, el primer abono
  // proyectado es hoy y cuenta para el periodo que vence hoy (antes de cobrar el siguiente),
  // así que el estado de partida es el de ayer con los abonos ya registrados.
  const { n: current, isCutDay } = periodAt(loan, day);
  const now = computeLoan(loan, isCutDay && day > loan.start_date ? addDays(day, -1) : day);
  const rateFor = (n: number) => (opts.rate !== undefined ? opts.rate : periodRate(loan, n));

  let principal = toCents(now.principalOutstanding);
  let interest = toCents(now.interestOutstanding);
  const payment = Math.max(0, toCents(opts.payment));
  let totalPaid = 0;
  let totalInterest = 0;
  const rows: ProjectionRow[] = [];

  for (let i = 0; i < Math.min(opts.periods, MAX_PROJECTION) && principal + interest > 0; i++) {
    const n = current + i;
    const start = n === 1 ? loan.start_date : cutDate(loan.start_date, loan.frequency, n - 1);
    const end = cutDate(loan.start_date, loan.frequency, n);
    // El periodo en curso ya cobró su interés (está en interestNow); los siguientes lo cobran al empezar.
    let charged = 0;
    if (i > 0 && principal > 0) {
      charged = interestCents(principal, rateFor(n));
      interest += charged;
      totalInterest += charged;
    } else if (i === 0) {
      charged = toCents(now.periods.find((r) => r.number === n)?.interest ?? 0);
    }
    const pay = Math.min(payment, principal + interest);
    const toInterest = Math.min(pay, interest);
    interest -= toInterest;
    const toPrincipal = pay - toInterest;
    principal -= toPrincipal;
    totalPaid += pay;
    rows.push({
      number: n,
      start,
      end,
      rate: i === 0 ? periodRate(loan, n) : rateFor(n),
      interest: fromCents(charged),
      payment: fromCents(pay),
      toInterest: fromCents(toInterest),
      toPrincipal: fromCents(toPrincipal),
      principalAfter: fromCents(principal),
      interestAfter: fromCents(interest),
    });
  }

  return {
    rows,
    principalNow: now.principalOutstanding,
    interestNow: now.interestOutstanding,
    paidOff: principal + interest === 0,
    totalPaid: fromCents(totalPaid),
    totalInterest: fromCents(totalInterest),
  };
}

// ---------------------------------------------------------------------------
// Lectura de la pregunta
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Números escritos con palabras: "setenta y cinco", "mil quinientos", "doscientos".
const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40,
  cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200,
  trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
  novecientos: 900,
};
const NUMBER_WORD = String.raw`(?:${Object.keys(UNITS).join("|")}|mil)`;

function wordsToNumbers(text: string): string {
  const re = new RegExp(String.raw`\b${NUMBER_WORD}(?:\s+(?:y\s+)?${NUMBER_WORD})*\b`, "g");
  return text.replace(re, (phrase) => {
    let total = 0;
    let current = 0;
    for (const w of phrase.split(/\s+/)) {
      if (w === "y") continue;
      if (w === "mil") {
        total += (current || 1) * 1000;
        current = 0;
      } else current += UNITS[w] ?? 0;
    }
    // "un" o "una" sueltos ("un abono") no son cantidades.
    if (/^(un|una|uno)$/.test(phrase)) return phrase;
    return String(total + current);
  });
}

// "1,000.50" → 1000.5 ; "1.000" → 1000 ; "1.000,50" → 1000.5 ; "70.5" → 70.5 ; "12,5" → 12.5
function parseNumber(raw: string): number {
  const s = raw.replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ""));
  // Punto seguido de exactamente 3 dígitos: separador de miles (el dinero tiene 2 decimales).
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+,\d{1,2}$/.test(s)) return Number(s.replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?`;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function validDate(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type Parsed = {
  text: string;
  rate?: number;
  count?: number;
  amounts: number[];
  date?: string;
  /** Se escribió una fecha que no existe (p. ej. 31/02). */
  invalidDate?: boolean;
  /** "dentro de N quincenas": el abono es dentro de N periodos. */
  periodsAhead?: number;
  /** Se escribió un monto en cero o negativo. */
  nonPositive?: boolean;
  frequency?: Frequency;
  /** Préstamo hipotético: monto prestado y abono por periodo según su posición en la frase. */
  lent?: number;
  installment?: number;
};

function parseQuestion(question: string, today: string): Parsed {
  let text = wordsToNumbers(normalize(question));
  const out: Parsed = { text: "", amounts: [] };

  const pct = text.match(new RegExp(String.raw`(${NUM})\s*(?:%|por ?ciento)`));
  if (pct) {
    out.rate = parseNumber(pct[1]);
    text = text.replace(pct[0], " ");
  }

  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const dmy = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  const words = text.match(new RegExp(String.raw`\b(\d{1,2}) de (${MONTHS.join("|")})(?: (?:de|del) (\d{4}))?\b`));
  const ahead = text.match(/\bdentro de (\d+) (quincenas?|semanas?|meses|mes|periodos?)\b/);
  const year = Number(today.slice(0, 4));
  let raw: [number, number, number] | null = null;
  if (iso) {
    raw = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    text = text.replace(iso[0], " ");
  } else if (words) {
    raw = [words[3] ? Number(words[3]) : year, MONTHS.indexOf(words[2]) + 1, Number(words[1])];
    text = text.replace(words[0], " ");
  } else if (dmy) {
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : year;
    raw = [y, Number(dmy[2]), Number(dmy[1])];
    text = text.replace(dmy[0], " ");
  } else if (ahead) {
    out.periodsAhead = Number(ahead[1]);
    // Se quita entero: si quedara "quincenas", "70 quincenas" se leería como 70 periodos.
    text = text.replace(ahead[0], " ");
  } else if (/\bmanana\b/.test(text)) {
    const [y, m, d] = today.split("-").map(Number);
    out.date = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  if (raw) {
    const d = validDate(...raw);
    if (d) out.date = d;
    else out.invalidDate = true;
  }

  const cnt = text.match(/(\d+)\s*(quincenas?|semanas?|meses|mes|periodos?|cuotas?|pagos?)\b/);
  if (cnt) {
    out.count = Number(cnt[1]);
    text = text.replace(cnt[0], ` ${cnt[2]} `);
  }

  // "la quincena 2", "periodo 3": número de periodo, no dinero.
  text = text.replace(/\b(quincena|periodo|semana|mes|cuota) (?:numero |n )?(\d+)\b/g, "$1");

  if (/\bsemanal/.test(text)) out.frequency = "weekly";
  else if (/\bmensual/.test(text)) out.frequency = "monthly";
  else if (/\bquincenal/.test(text)) out.frequency = "biweekly";

  const money = String.raw`(?:\$|usd|b\/\.)?\s*(${NUM})`;
  const lent = text.match(new RegExp(String.raw`\bprest\w*\s+(?:de\s+)?${money}`));
  const inst = text.match(new RegExp(String.raw`\b(?:abon\w*|pag\w*|da|doy|diera|entreg\w*)\s+(?:de\s+)?${money}|${money}\s+(?:cada|por)\b`));
  if (lent) out.lent = parseNumber(lent[1]);
  if (inst) out.installment = parseNumber(inst[1] ?? inst[2]);

  const found = [...text.matchAll(new RegExp(String.raw`(-|\bmenos\s+)?${money}`, "g"))];
  out.nonPositive = found.some((m) => m[1] !== undefined || parseNumber(m[2]) === 0);
  out.amounts = found.filter((m) => m[1] === undefined).map((m) => parseNumber(m[2])).filter((n) => Number.isFinite(n) && n > 0);
  out.text = text;
  return out;
}

const has = (text: string, re: RegExp) => re.test(text);

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/** Tipos de pregunta que el asistente no responde (se muestran en letra pequeña). */
export const UNSUPPORTED_QUESTIONS = [
  "Temas que no son de préstamos (consejos legales, del clima, etc.).",
  "Registrar, borrar o cambiar datos: solo calcula; los abonos se registran en el formulario.",
  "Fechas incompletas como \"el 29\": escribe 29/10/2026 o 29 de octubre.",
  "Tasas anuales, interés compuesto o conversión entre monedas.",
  "Comparar varios préstamos a la vez: elige uno en la lista.",
];

export const EXAMPLE_QUESTIONS = [
  "¿Cuánto debe?",
  "¿Cuánto es el interés de la próxima quincena?",
  "Si abona 70, ¿cómo queda?",
  "¿Cuánto necesita para liquidar hoy?",
  "Si abona 50 cada quincena, ¿cómo quedaría en 6 quincenas?",
  "¿En cuántas quincenas termina si abona 60 cada quincena?",
  "¿Qué pasa si solo paga el interés?",
  "Si presto 500 al 20% quincenal y me abona 100 cada quincena, ¿cómo queda?",
];

function help(ctx: AssistantContext): AssistantReply {
  return {
    text: [
      ctx.loan
        ? "Puedo calcular con los datos de este préstamo. Prueba preguntas como:"
        : "Puedo simular préstamos. Prueba preguntas como:",
      ...EXAMPLE_QUESTIONS.filter((q) => ctx.loan || q.startsWith("Si presto")).map((q) => `• ${q}`),
      "",
      "Regla de cálculo: cada abono paga primero el interés pendiente y solo lo que sobra baja el capital. El interés de cada periodo se cobra sobre el capital pendiente, nunca sobre interés.",
    ].join("\n"),
  };
}

function money(ctx: AssistantContext) {
  return (n: number) => formatMoney(n, ctx.currency);
}

function statusReply(ctx: AssistantContext, loan: LoanInput): AssistantReply {
  const s = computeLoan(loan, ctx.today);
  const m = money(ctx);
  const noun = NOUN[loan.frequency][0];
  const label = { active: "Activo", overdue: "Atrasado", paid: "Pagado", cancelled: "Cancelado" }[s.status];
  const lines = [
    `${ctx.borrowerName ? `${ctx.borrowerName}: estado` : "Estado"} ${label}.`,
    `• Capital pendiente: ${m(s.principalOutstanding)} (de ${m(s.principal)} prestado)`,
    `• Interés pendiente: ${m(s.interestOutstanding)}`,
    `• Total adeudado hoy: ${m(s.balance)}`,
    `• Pagado hasta hoy: ${m(s.paid)} (interés generado en total: ${m(s.interestCharged)})`,
  ];
  if (s.overdueAmount > 0) lines.push(`• Atrasado: ${m(s.overdueAmount)}`);
  if (s.next) {
    lines.push(
      `• El ${formatDate(s.next.due_date)} vence la ${noun} actual; la siguiente cobrará ${s.next.rate}% sobre el capital: ${m(s.next.projectedInterest)} si no hay más abonos a capital.`,
    );
  }
  const { isCutDay } = periodAt(loan, ctx.today);
  if (isCutDay && s.balance > 0 && s.status !== "cancelled") {
    const max = previewPayment(loan, { amount: 0.01, paid_at: ctx.today }, ctx.today).maxAmount;
    if (toCents(max) !== toCents(s.balance)) {
      lines.push(
        `Hoy es día de corte: un abono hecho hoy cuenta para la ${noun} que vence hoy, así que para liquidar hoy bastan ${m(max)}. El total de ${m(s.balance)} ya incluye el interés de la ${noun} que empieza hoy.`,
      );
    }
  }
  return { text: lines.join("\n") };
}

function statusAtReply(ctx: AssistantContext, loan: LoanInput, date: string): AssistantReply {
  const s = computeLoan(loan, date);
  const m = money(ctx);
  return {
    text: [
      `Al ${formatDate(date)}, si no hay abonos antes:`,
      `• Capital pendiente: ${m(s.principalOutstanding)}`,
      `• Interés pendiente: ${m(s.interestOutstanding)}`,
      `• Total adeudado: ${m(s.balance)}`,
      "Ese total incluye el interés de los periodos que habrán empezado para esa fecha.",
    ].join("\n"),
  };
}

// Varios abonos en la misma frase ("40 y luego 70"): el primero en la fecha indicada y cada
// siguiente al vencer el periodo siguiente, que es como se cobra quincena a quincena.
function sequenceReply(ctx: AssistantContext, loan: LoanInput, amounts: number[], date: string): AssistantReply {
  const m = money(ctx);
  const noun = NOUN[loan.frequency][0];
  const first = periodAt(loan, date).n;
  let current = loan;
  const lines = [`Un abono por ${noun}, en orden:`];
  for (const [i, amount] of amounts.entries()) {
    const day = i === 0 ? date : cutDate(loan.start_date, loan.frequency, first + i);
    const p = previewPayment(current, { amount, paid_at: day }, ctx.today);
    if (!p.valid) {
      lines.push(`${i + 1}. ${formatDate(day)}: ${m(amount)} supera lo que se debería (máximo ${m(p.maxAmount)}).`);
      break;
    }
    const a = p.allocation;
    lines.push(
      `${i + 1}. ${formatDate(day)} (${noun} ${first + i}): ${m(amount)} → ${m(a.toInterest)} a interés, ${m(a.toPrincipal)} a capital.`,
      `   Capital pendiente: ${m(a.principalOutstanding)} · Interés pendiente: ${m(a.interestOutstanding)} · Total: ${m(a.totalOwed)}`,
    );
    if (a.totalOwed === 0) {
      lines.push("Con ese abono el préstamo queda pagado.");
      break;
    }
    current = {
      ...current,
      payments: [...current.payments, { id: `secuencia-${i}`, amount, paid_at: day, created_at: `9999-12-31T23:59:${String(i).padStart(2, "0")}Z` }],
    };
  }
  return { text: lines.join("\n") };
}

function nextInterestReply(ctx: AssistantContext, loan: LoanInput, rate?: number): AssistantReply {
  const s = computeLoan(loan, ctx.today);
  const m = money(ctx);
  const noun = NOUN[loan.frequency][0];
  if (!s.next) return { text: "Este préstamo ya no genera interés (está pagado o cancelado)." };
  const r = rate ?? s.next.rate;
  const interest = fromCents(interestCents(toCents(s.principalOutstanding), r));
  const lines = [
    `La próxima ${noun} (periodo ${s.next.number}) empieza el ${formatDate(s.next.due_date)} y cobra ${r}% sobre el capital pendiente de ${m(s.principalOutstanding)}:`,
    `• Interés: ${m(interest)}`,
  ];
  if (s.interestOutstanding > 0) {
    lines.push(`• Además hay ${m(s.interestOutstanding)} de interés pendiente que aún no se ha pagado.`);
  }
  lines.push("Ese interés no se suma al capital: queda como interés pendiente hasta que se pague.");
  return { text: lines.join("\n") };
}

function paymentReply(ctx: AssistantContext, loan: LoanInput, amount: number, date: string, rate?: number): AssistantReply {
  const m = money(ctx);
  const noun = NOUN[loan.frequency][0];
  if (date < loan.start_date) return { text: `La fecha ${formatDate(date)} es anterior al préstamo (${formatDate(loan.start_date)}).` };
  const p = previewPayment(loan, { amount, paid_at: date }, ctx.today, rate);
  if (p.reason === "exceeds_debt") {
    return {
      text: `Un abono de ${m(amount)} el ${formatDate(date)} supera la deuda total a esa fecha. Lo máximo que se puede abonar es ${m(p.maxAmount)} (eso liquida el préstamo).`,
    };
  }
  const a = p.allocation;
  const lines = [
    `Si abona ${m(amount)} el ${formatDate(date)} (debía ${m(p.owedAtDate)} a esa fecha):`,
    `• A interés: ${m(a.toInterest)}`,
    `• A capital: ${m(a.toPrincipal)}`,
    `• Interés pendiente: ${m(a.interestOutstanding)}`,
    `• Capital pendiente: ${m(a.principalOutstanding)}`,
    `• Total adeudado: ${m(a.totalOwed)}`,
  ];
  if (a.totalOwed === 0) {
    lines.push("Con ese abono el préstamo queda pagado.");
  } else {
    if (a.toPrincipal === 0) lines.push("Todo el abono se va a interés: el capital no baja.");
    lines.push(
      `La ${noun} ${p.next.number} empieza el ${formatDate(p.next.start)} y cobraría ${p.next.rate}% sobre ${m(a.principalOutstanding)} = ${m(p.next.projectedInterest)}.`,
    );
  }
  return { text: lines.join("\n") };
}

// El día de corte el saldo ya incluye el interés del periodo que empieza, pero un abono de ese día
// cuenta para el periodo que vence: por eso liquidar ese día cuesta menos que el saldo mostrado.
function cutDayNote(ctx: AssistantContext, loan: LoanInput, date: string, max: number): string[] {
  if (!periodAt(loan, date).isCutDay || date === loan.start_date) return [];
  const balance = computeLoan(loan, date).balance;
  if (toCents(balance) === toCents(max)) return [];
  const noun = NOUN[loan.frequency][0];
  return [
    `Es día de corte: el saldo de ${money(ctx)(balance)} ya incluye el interés de la ${noun} que empieza ese día, pero un abono hecho ese mismo día cuenta para la ${noun} que vence, así que bastan ${money(ctx)(max)}.`,
  ];
}

function payoffReply(ctx: AssistantContext, loan: LoanInput, date: string): AssistantReply {
  const m = money(ctx);
  if (date < loan.start_date) return { text: `La fecha ${formatDate(date)} es anterior al préstamo.` };
  const max = previewPayment(loan, { amount: 0.01, paid_at: date }, ctx.today).maxAmount;
  const a = previewPayment(loan, { amount: max, paid_at: date }, ctx.today).allocation;
  return {
    text: [
      `Para liquidar el ${formatDate(date)} necesita ${m(max)}:`,
      `• Interés pendiente: ${m(a.toInterest)}`,
      `• Capital pendiente: ${m(a.toPrincipal)}`,
      date > ctx.today ? "Incluye el interés de los periodos que habrán empezado para esa fecha." : "Si paga esa cantidad hoy, el préstamo queda en cero.",
      ...cutDayNote(ctx, loan, date, max),
    ].join("\n"),
  };
}

function projectionTable(ctx: AssistantContext, loan: LoanInput, proj: Projection) {
  const m = money(ctx);
  return {
    headers: ["#", "Vence", "Tasa", "Interés cobrado", "Abono", "A interés", "A capital", "Capital", "Interés pend.", "Abono / Saldo"],
    rows: proj.rows.map((r) => [
      String(r.number),
      formatDate(r.end),
      `${r.rate}%`,
      m(r.interest),
      m(r.payment),
      m(r.toInterest),
      m(r.toPrincipal),
      m(r.principalAfter),
      m(r.interestAfter),
      `${m(r.payment)}\n${m(plus(r.principalAfter, r.interestAfter))}`,
    ]),
    phone: [0, 1, 9],
    phoneOnly: [9],
  };
}

function projectionReply(
  ctx: AssistantContext,
  loan: LoanInput,
  opts: { periods: number; payment: number; rate?: number },
): AssistantReply {
  const m = money(ctx);
  const [one, many] = NOUN[loan.frequency];
  const proj = projectLoan(loan, ctx.today, opts);
  const last = proj.rows[proj.rows.length - 1];
  const lines = [
    `Proyección de ${proj.rows.length} ${proj.rows.length === 1 ? one : many}, abonando ${m(opts.payment)} el día que vence cada ${one}${opts.rate !== undefined ? `, con tasa de ${opts.rate}% en las siguientes` : ""}:`,
    `Hoy: capital ${m(proj.principalNow)}, interés pendiente ${m(proj.interestNow)} (el interés de la ${one} en curso ya está cobrado).`,
  ];
  if (proj.paidOff) {
    lines.push(`Queda pagado el ${formatDate(last.end)}. Total abonado ${m(proj.totalPaid)}, de los cuales ${m(minus(proj.totalPaid, proj.principalNow))} es interés.`);
  } else if (last) {
    lines.push(`Al final: capital ${m(last.principalAfter)}, interés pendiente ${m(last.interestAfter)}, total adeudado ${m(plus(last.principalAfter, last.interestAfter))}.`);
    if (proj.rows.every((r) => r.toPrincipal === 0)) {
      lines.push("Con ese abono solo se cubre interés: el capital no baja.");
    }
  }
  return { text: lines.join("\n"), table: projectionTable(ctx, loan, proj) };
}

function payoffTimeReply(ctx: AssistantContext, loan: LoanInput, payment: number, rate?: number): AssistantReply {
  const m = money(ctx);
  const [one, many] = NOUN[loan.frequency];
  const proj = projectLoan(loan, ctx.today, { periods: MAX_PROJECTION, payment, rate });
  if (!proj.paidOff) {
    const first = proj.rows[1] ?? proj.rows[0];
    const interestPerPeriod = first ? first.interest : 0;
    return {
      text: [
        `Abonando ${m(payment)} cada ${one} el préstamo no se termina de pagar.`,
        interestPerPeriod > 0
          ? `Cada ${one} genera unos ${m(interestPerPeriod)} de interés sobre el capital; el abono tiene que ser mayor que eso para que el capital baje.`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  const last = proj.rows[proj.rows.length - 1];
  return {
    text: [
      `Abonando ${m(payment)} cada ${one}, se termina de pagar en ${proj.rows.length} ${proj.rows.length === 1 ? one : many}, el ${formatDate(last.end)}.`,
      `• Total que pagaría desde hoy: ${m(proj.totalPaid)}`,
      `• De eso, interés: ${m(minus(proj.totalPaid, proj.principalNow))}`,
      `• El último abono sería de ${m(last.payment)}.`,
    ].join("\n"),
    table: proj.rows.length <= 60 ? projectionTable(ctx, loan, proj) : undefined,
  };
}

function interestOnlyReply(ctx: AssistantContext, loan: LoanInput, periods: number): AssistantReply {
  const m = money(ctx);
  const [one, many] = NOUN[loan.frequency];
  const s = computeLoan(loan, ctx.today);
  if (!s.next) return { text: "Este préstamo ya no genera interés (está pagado o cancelado)." };
  const nextInterest = fromCents(interestCents(toCents(s.principalOutstanding), s.next.rate));
  // Interés de los próximos periodos con la tasa configurada de cada uno, sobre el mismo capital.
  let futureCents = 0;
  for (let k = 0; k < periods; k++) futureCents += interestCents(toCents(s.principalOutstanding), periodRate(loan, s.next.number + k));
  return {
    text: [
      `Si solo paga el interés, el capital se queda en ${m(s.principalOutstanding)}: el abono se va completo a interés y no baja el capital.`,
      s.interestOutstanding > 0 ? `Hoy debe ${m(s.interestOutstanding)} de interés.` : "Hoy no tiene interés pendiente.",
      `La siguiente ${one} generará ${m(nextInterest)} (${s.next.rate}% de ${m(s.principalOutstanding)}).`,
      `En las próximas ${periods} ${many} pagaría ${m(fromCents(futureCents))} de interés y seguiría debiendo ${m(s.principalOutstanding)} de capital.`,
    ].join("\n"),
  };
}

function hypotheticalReply(ctx: AssistantContext, p: Parsed): AssistantReply {
  const principal = p.lent ?? p.amounts[0];
  const rate = p.rate;
  if (!principal || rate === undefined) {
    return {
      text: 'Para simular un préstamo nuevo dime monto y tasa, por ejemplo: "si presto 500 al 20% quincenal y me abona 100 cada quincena".',
    };
  }
  const frequency = p.frequency ?? "biweekly";
  const loan: LoanInput = {
    principal,
    start_date: ctx.today,
    frequency,
    default_rate: rate,
    rates: [],
    payments: [],
    due_date: null,
    cancelled_at: null,
  };
  const m = money(ctx);
  const [one, many] = NOUN[frequency];
  const payment = p.installment !== undefined && p.installment !== principal ? p.installment : p.amounts.find((x) => x !== principal);
  const intro = `Préstamo de ${m(principal)} al ${rate}% ${one === "mes" ? "mensual" : one === "semana" ? "semanal" : "quincenal"}, desde hoy. La primera ${one} cobra ${m(fromCents(interestCents(toCents(principal), rate)))} de interés.`;
  if (!payment) {
    return {
      text: [
        intro,
        `Si solo pagara el interés, pagaría eso cada ${one} y el capital seguiría en ${m(principal)}.`,
        `Dime cuánto abonaría cada ${one} para ver en cuánto tiempo termina (por ejemplo: "y me abona 100 cada ${one}").`,
      ].join("\n"),
    };
  }
  const sub = /cuant[oa]s?|cuando|termin|tiempo/.test(p.text)
    ? payoffTimeReply(ctx, loan, payment)
    : p.count
      ? projectionReply(ctx, loan, { periods: p.count, payment })
      : payoffTimeReply(ctx, loan, payment);
  void many;
  return { text: `${intro}\n${sub.text}`, table: sub.table };
}

/** Responde una pregunta sobre el préstamo (o una simulación hipotética). */
export function answer(question: string, ctx: AssistantContext): AssistantReply {
  const p = parseQuestion(question, ctx.today);
  const t = p.text;
  if (!t) return help(ctx);
  if (p.invalidDate) return { text: "Esa fecha no existe. Escríbela como 29/10/2026 o 29 de octubre de 2026." };

  const hypothetical = has(t, /\b(si )?(le |te )?(presto|prestara|prestaria|prestar|presta)\b|prestamo (nuevo|hipotetico)|simula\w* (un )?prestamo/);
  if (hypothetical || !ctx.loan) {
    if (has(t, /\bayuda\b|que puedes|como funciona|que preguntas/) && !p.amounts.length) return help(ctx);
    return hypotheticalReply(ctx, p);
  }
  const loan = ctx.loan;
  const date = p.date ?? (p.periodsAhead !== undefined ? periodsFrom(ctx.today, loan.frequency, p.periodsAhead) : ctx.today);
  const s = computeLoan(loan, ctx.today);
  const closed = s.status === "paid" || s.status === "cancelled";
  const paying = has(t, /abon|\bpag|deposit|\bda\b|\bdoy\b|diera|entreg|\btrae\b/);

  if (has(t, /\bayuda\b|que puedes|como funciona|que preguntas|que se puede/)) return help(ctx);

  if (has(t, /liquid|saldar|cancelar (la )?deuda|(paga|pagar|pague|pagara) todo|todo lo que debe|terminar de pagar hoy|cuanto (necesita|falta|hace falta)? ?para (pagar|terminar|liquidar)|para quedar en cero/)) {
    if (closed) return statusReply(ctx, loan);
    return payoffReply(ctx, loan, date);
  }

  if (paying && p.nonPositive && !p.amounts.length) {
    return { text: "El abono tiene que ser mayor que 0. Escribe un monto positivo, por ejemplo: si abona 70." };
  }

  const periodic = has(t, /\bcada\b|por (quincena|semana|mes)|quincenal|semanal|mensual/);
  if (periodic && p.amounts.length && has(t, /cuant[oa]s|cuando|en que fecha|cuanto tiempo|termin/)) {
    if (closed) return statusReply(ctx, loan);
    return payoffTimeReply(ctx, loan, p.amounts[0], p.rate);
  }

  if (has(t, /proyecc|a futuro|en (los )?proxim/) || periodic || (p.count !== undefined && p.periodsAhead === undefined)) {
    if (closed) return statusReply(ctx, loan);
    return projectionReply(ctx, loan, { periods: p.count ?? 6, payment: p.amounts[0] ?? 0, rate: p.rate });
  }

  if (has(t, /(solo|nada mas|unicamente) (paga|pagara|pague|abona|abonara|da|diera|cubre)? ?(el |los )?interes/)) {
    if (closed) return statusReply(ctx, loan);
    return interestOnlyReply(ctx, loan, p.count ?? 6);
  }

  if (paying && p.amounts.length) {
    if (closed) return { text: `${statusReply(ctx, loan).text}\nNo se pueden registrar abonos en este préstamo.` };
    if (p.amounts.length > 1 && has(t, /\bluego\b|\bdespues\b|\by otro\b|\botro abono\b/)) return sequenceReply(ctx, loan, p.amounts, date);
    return paymentReply(ctx, loan, p.amounts[0], date, p.rate);
  }

  if (has(t, /(proxim|siguiente).*(interes|cobr)|(interes|cobr).*(proxim|siguiente)/)) {
    return nextInterestReply(ctx, loan, p.rate);
  }

  if (has(t, /debe|saldo|estado|resumen|capital|interes|cuanto|total|pendiente|atras|falta/)) {
    if (p.date && p.date > ctx.today && !closed) return statusAtReply(ctx, loan, p.date);
    return statusReply(ctx, loan);
  }

  return help(ctx);
}
