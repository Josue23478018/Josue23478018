import { PageHeader } from "@/components/ui";
import { formatMoney, today } from "@/lib/format";
import { listLoans, toLoanInput } from "@/lib/loans/queries";
import { AssistantPicker, type AssistantLoanOption } from "./assistant-picker";

export default async function AsistentePage() {
  const loans = await listLoans();
  const options: AssistantLoanOption[] = loans
    .filter((l) => l.summary.status === "active" || l.summary.status === "overdue")
    .map((l) => ({
      id: l.id,
      label: `${l.borrower.name} · ${formatMoney(l.principal, l.currency)}`,
      currency: l.currency,
      borrowerName: l.borrower.name,
      input: toLoanInput(l),
    }));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Asistente"
        description="Calcula cómo queda un préstamo: abonos, interés, liquidación y proyecciones. Los números salen de las mismas fórmulas de la app."
      />
      <section className="card">
        <AssistantPicker loans={options} today={today()} />
      </section>
    </div>
  );
}
