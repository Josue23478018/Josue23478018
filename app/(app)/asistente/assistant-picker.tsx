"use client";

import { useState } from "react";
import { LoanAssistant } from "@/components/loan-assistant";
import type { LoanInput } from "@/lib/loans/calc";

export type AssistantLoanOption = { id: string; label: string; currency: string; borrowerName: string; input: LoanInput };

// Elige sobre qué préstamo preguntar, o un préstamo hipotético.
export function AssistantPicker({ loans, today }: { loans: AssistantLoanOption[]; today: string }) {
  const [selected, setSelected] = useState(loans[0]?.id ?? "");
  const loan = loans.find((l) => l.id === selected) ?? null;
  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium">Préstamo</span>
        <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {loans.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
          <option value="">Préstamo hipotético (simulación)</option>
        </select>
      </label>
      <LoanAssistant
        key={selected || "hipotetico"}
        loan={loan?.input ?? null}
        currency={loan?.currency ?? "USD"}
        today={today}
        borrowerName={loan?.borrowerName}
      />
    </div>
  );
}
