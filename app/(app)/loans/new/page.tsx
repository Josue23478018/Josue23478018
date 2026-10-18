import { BackLink, PageHeader } from "@/components/ui";
import { listBorrowers } from "@/lib/loans/queries";
import { today } from "@/lib/format";
import { LoanForm } from "./loan-form";

export default async function NewLoanPage({ searchParams }: { searchParams: Promise<{ borrower?: string }> }) {
  const [borrowers, { borrower }] = await Promise.all([listBorrowers(), searchParams]);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={<BackLink href="/loans">Préstamos</BackLink>}
        title="Nuevo préstamo"
        description="Registra a quién le prestas, cuánto y con qué interés."
      />
      <LoanForm borrowers={borrowers} today={today()} defaultBorrowerId={borrower} />
    </div>
  );
}
