import { listBorrowers } from "@/lib/loans/queries";
import { today } from "@/lib/format";
import { LoanForm } from "./loan-form";

export default async function NewLoanPage({ searchParams }: { searchParams: Promise<{ borrower?: string }> }) {
  const [borrowers, { borrower }] = await Promise.all([listBorrowers(), searchParams]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo préstamo</h1>
      <LoanForm borrowers={borrowers} today={today()} defaultBorrowerId={borrower} />
    </div>
  );
}
