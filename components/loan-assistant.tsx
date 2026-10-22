"use client";

import { useRef, useState } from "react";
import { answer, EXAMPLE_QUESTIONS, type AssistantReply } from "@/lib/loans/assistant";
import type { LoanInput } from "@/lib/loans/calc";

type Message = { role: "user" | "assistant"; text: string; table?: AssistantReply["table"] };

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
  const listRef = useRef<HTMLDivElement>(null);
  const suggestions = loan ? EXAMPLE_QUESTIONS : EXAMPLE_QUESTIONS.filter((q) => q.startsWith("Si presto"));

  function send(question: string) {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q, { loan, currency, today, borrowerName });
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: reply.text, table: reply.table }]);
    setInput("");
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
  }

  return (
    <div className="space-y-4">
      <div ref={listRef} aria-live="polite" className="max-h-[32rem] space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="panel space-y-3">
            <p className="text-sm text-muted">
              {loan
                ? "Pregunta sobre este préstamo: saldo, cuánto va a interés y a capital si abona, cuánto falta para liquidar, o cómo quedaría en las próximas quincenas."
                : 'Simula un préstamo, por ejemplo: "si presto 500 al 20% quincenal y me abona 100 cada quincena".'}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button key={q} type="button" onClick={() => send(q)} className="btn-secondary btn-sm min-h-11 text-left sm:min-h-9">
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
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
                            <th key={h} className={j >= 3 ? "num" : undefined}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.table.rows.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c} className={c >= 3 ? "num" : "whitespace-nowrap"}>
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
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
    </div>
  );
}
