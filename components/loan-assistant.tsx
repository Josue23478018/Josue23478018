"use client";

import { useRef, useState } from "react";
import { answer, EXAMPLE_QUESTIONS, UNSUPPORTED_QUESTIONS, type AssistantReply } from "@/lib/loans/assistant";
import type { LoanInput } from "@/lib/loans/calc";

type Message = { role: "user" | "assistant"; text: string; table?: AssistantReply["table"] };

// En celular solo se ven las columnas de `phone`; las de `phoneOnly` desaparecen desde sm.
function columnClass(table: NonNullable<Message["table"]>, column: number) {
  if (table.phoneOnly?.includes(column)) return "sm:hidden";
  if (table.phone && !table.phone.includes(column)) return "hidden sm:table-cell";
  return "";
}

// Chat de cálculos: cada respuesta la genera lib/loans/assistant en el navegador (sin costo ni servidor).
export function LoanAssistant({
  loan,
  currency,
  today,
  borrowerName,
}: {
  loan: LoanInput | null;
  currency: string;
  today: string;
  borrowerName?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const lastQuestionRef = useRef<HTMLDivElement>(null);
  const suggestions = loan ? EXAMPLE_QUESTIONS : EXAMPLE_QUESTIONS.filter((q) => q.startsWith("Si presto"));

  function send(question: string) {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q, { loan, currency, today, borrowerName });
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: reply.text, table: reply.table }]);
    setInput("");
    // La página hace el scroll: lleva la pregunta nueva arriba para leer la respuesta desde el inicio.
    requestAnimationFrame(() => lastQuestionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" className="space-y-3">
        {messages.length === 0 ? (
          <div className="panel space-y-3">
            <p className="text-sm text-muted">
              {loan
                ? "Pregunta sobre este préstamo: saldo, cuánto va a interés y a capital si abona, cuánto falta para liquidar, o cómo quedaría en las próximas quincenas."
                : 'Simula un préstamo, por ejemplo: "si presto 500 al 20% quincenal y me abona 100 cada quincena".'}
            </p>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} ref={i === messages.length - 2 ? lastQuestionRef : undefined} className="flex scroll-mt-20 justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-sm text-accent-foreground">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="max-w-full space-y-3 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3">
                <p className="text-sm whitespace-pre-line">{m.text}</p>
                {m.table && (
                  <div className="-mx-4 overflow-x-auto px-4">
                    <table className="table text-xs">
                      <thead>
                        <tr>
                          {m.table.headers.map((h, j) => (
                            <th key={h} className={`${j >= 3 ? "num" : ""} ${columnClass(m.table!, j)}`}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.table.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c} className={`${c >= 3 ? "num whitespace-pre-line" : "whitespace-nowrap"} ${columnClass(m.table!, c)}`}>
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Preguntas que puedes hacer</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="btn-secondary btn-sm min-h-11 h-auto py-2 text-left sm:min-h-9">
              {q}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 -mx-4 flex gap-2 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
      >
        <label className="sr-only" htmlFor="pregunta">
          Pregunta
        </label>
        <input
          id="pregunta"
          className="input"
          placeholder={loan ? "Ej.: si abona 70, ¿cómo queda?" : "Ej.: si presto 500 al 20% y me abona 100 cada quincena"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
        />
        <button className="btn shrink-0" disabled={!input.trim()}>
          Preguntar
        </button>
      </form>
      {messages.length > 0 && (
        <button type="button" className="text-xs text-muted underline" onClick={() => setMessages([])}>
          Nueva conversación
        </button>
      )}
      <div className="text-[0.7rem] leading-relaxed text-muted">
        <p className="font-medium">No responde:</p>
        <ul className="list-disc pl-4">
          {UNSUPPORTED_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
        <p className="mt-1">Las respuestas son cálculos con las reglas de la app, no asesoría financiera.</p>
      </div>
    </div>
  );
}
