// Asistente de préstamos: responde preguntas en español con cálculos exactos.
//
// No usa inteligencia artificial ni servicios externos (no cuesta nada): reconoce el tipo de
// pregunta con reglas de texto y calcula con las mismas funciones que usa la app
// (computeLoan, previewPayment, interestCents). Todo el dinero se maneja en centavos enteros.
import { formatDate, formatMoney } from "@/lib/format";
import {
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
  table?: { headers: string[]; rows: string[][] };
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
  const now = computeLoan(loan, day);
  // Primer periodo cuyo corte es posterior a hoy: es el periodo en curso.
  let current = 1;
  while (current < MAX_PROJECTION && cutDate(loan.start_date, loan.frequency, current) <= day) current++;
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

// "1,000.50" → 1000.5 ; "70" → 70 ; "70.5" → 70.5 ; "12,5" → 12.5 (coma decimal si no son miles)
function parseNumber(raw: string): number {
  const s = raw.replace(/\s/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ""));
  if (/^\d+,\d{1,2}$/.test(s)) return Number(s.replace(",", "."));
  return Number(s.replace(/,/g, ""));
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?`;

type Parsed = {
  text: string;
  rate?: number;
  count?: number;
  amounts: number[];
  date?: string;
  frequency?: Frequency;
};

function parseQuestion(question: string, today: string): Parsed {
  let text = normalize(question);
  let rate: number | undefined;
  const pct = text.match(new RegExp(String.raw`(${NUM})\s*(?:%|por ?ciento)`));
  if (pct) {
    rate = parseNumber(pct[1]);
    text = text.replace(pct[0], " ");
  }

  let date: string | undefined;
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const dmy = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    text = text.replace(iso[0], " ");
  } else if (dmy) {
    const year = dmy[3] ? (dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]) : today.slice(0, 4);
    date = `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    text = text.replace(dmy[0], " ");
  } else if (/\bmanana\b/.test(text)) {
    const [y, m, d] = today.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    date = t.toISOString().slice(0, 10);
  }

  let count: number | undefined;
  const cnt = text.match(/(\d+)\s*(quincenas?|semanas?|meses|mes|periodos?|cuotas?|pagos?)\b/);
  if (cnt) {
    count = Number(cnt[1]);
    text = text.replace(cnt[0], ` ${cnt[2]} `);
  }

  // "la quincena 2", "periodo 3": número de periodo, no dinero.
  text = text.replace(/\b(quincena|periodo|semana|mes|cuota) (?:numero |n )?(\d+)\b/g, "$1");

  let frequency: Frequency | undefined;
  if (/\bsemanal/.test(text)) frequency = "weekly";
  else if (/\bmensual/.test(text)) frequency = "monthly";
  else if (/\bquincenal/.test(text)) frequency = "biweekly";

  const amounts = [...text.matchAll(new RegExp(String.raw`(?:\$|usd|b\/\.)?\s*(${NUM})`, "g"))]
    .map((m) => parseNumber(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);

  return { text, rate, count, amounts, date, frequency };
}

const has = (text: string, re: RegExp) => re.test(text);

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

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
    `${ctx.borrowerName ? `${ctx.borrowerName}: ` : ""}estado ${label}.`,
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
    ].join("\n"),
  };
}

function projectionTable(ctx: AssistantContext, loan: LoanInput, proj: Projection) {
  const m = money(ctx);
  return {
    headers: ["#", "Vence", "Tasa", "Interés cobrado", "Abono", "A interés", "A capital", "Capital", "Interés pend."],
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
    ]),
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
    lines.push(`Queda pagado el ${formatDate(last.end)}. Total abonado ${m(proj.totalPaid)}, de los cuales ${m(proj.totalPaid - proj.principalNow)} es interés.`);
  } else if (last) {
    lines.push(`Al final: capital ${m(last.principalAfter)}, interés pendiente ${m(last.interestAfter)}, total adeudado ${m(last.principalAfter + last.interestAfter)}.`);
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
      `• De eso, interés: ${m(proj.totalPaid - proj.principalNow)}`,
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
  const principal = p.amounts[0];
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
  const payment = p.amounts[1];
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

  if (has(t, /\b(si )?(le )?presto\b|\bprestar\b|\bprestamo (nuevo|de \d)|\bsimula(r)? (un )?prestamo/) || !ctx.loan) {
    if (has(t, /\bayuda\b|que puedes|como funciona|que preguntas/) && !p.amounts.length) return help(ctx);
    return hypotheticalReply(ctx, p);
  }
  const loan = ctx.loan;
  const date = p.date ?? ctx.today;
  const s = computeLoan(loan, ctx.today);
  const closed = s.status === "paid" || s.status === "cancelled";

  if (has(t, /\bayuda\b|que puedes|como funciona|que preguntas|que se puede/)) return help(ctx);

  if (has(t, /liquid|saldar|cancelar (la )?deuda|pagar todo|terminar de pagar hoy|cuanto (necesita|falta) para (pagar|terminar|liquidar)|para quedar en cero/)) {
    if (closed) return statusReply(ctx, loan);
    return payoffReply(ctx, loan, date);
  }

  const periodic = has(t, /\bcada\b|por (quincena|semana|mes)|quincenal|semanal|mensual/);
  if (periodic && p.amounts.length && has(t, /cuant[oa]s|cuando|en que fecha|cuanto tiempo|termin/)) {
    if (closed) return statusReply(ctx, loan);
    return payoffTimeReply(ctx, loan, p.amounts[0], p.rate);
  }

  if (has(t, /proyecc|como quedaria|como va a quedar|simula|en (los )?proxim|durante|a futuro|\bdentro de\b/) || (p.count && p.amounts.length)) {
    if (closed) return statusReply(ctx, loan);
    const n = p.count ?? 6;
    return projectionReply(ctx, loan, { periods: n, payment: p.amounts[0] ?? 0, rate: p.rate });
  }

  if (has(t, /(solo|nada mas|unicamente) (paga|pagara|pague|abona|abonara|da|diera|cubre)? ?(el |los )?interes/)) {
    if (closed) return statusReply(ctx, loan);
    return interestOnlyReply(ctx, loan, p.count ?? 6);
  }

  if (p.amounts.length && has(t, /abon|pag|deposit|da |diera|entreg|si (me )?(da|trae)/)) {
    if (closed) return { text: `${statusReply(ctx, loan).text}\nNo se pueden registrar abonos en este préstamo.` };
    return paymentReply(ctx, loan, p.amounts[0], date, p.rate);
  }

  if (has(t, /(proxim|siguiente).*(interes|cobr)|(interes|cobr).*(proxim|siguiente)/)) {
    return nextInterestReply(ctx, loan, p.rate);
  }

  if (has(t, /debe|saldo|estado|resumen|capital|interes|cuanto|total|pendiente|atras/)) return statusReply(ctx, loan);

  return help(ctx);
}
