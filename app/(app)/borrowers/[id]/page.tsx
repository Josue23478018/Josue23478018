import Link from "next/link";
import { notFound } from "next/navigation";
import { FormMessage, StatusBadge } from "@/components/ui";
import { listBorrowers, listLoans } from "@/lib/loans/queries";
import { formatMoney } from "@/lib/format";
import { deleteBorrower } from "../actions";
import { BorrowerForm } from "./borrower-form";

export default async function BorrowerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const [borrowers, loans] = await Promise.all([listBorrowers(), listLoans()]);
  const borrower = borrowers.find((b) => b.id === id);
  if (!borrower) notFound();
  const own = loans.filter((l) => l.borrower.id === id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/borrowers" className="text-sm text-muted hover:underline">
        ← Personas
      </Link>
      <h1 className="text-2xl font-semibold">{borrower.name}</h1>

      <BorrowerForm borrower={borrower} />

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Préstamos</h2>
          <Link href={`/loans/new?borrower=${id}`} className="text-sm text-accent underline">
            Nuevo préstamo
          </Link>
        </div>
        {own.length === 0 ? (
          <p className="text-sm text-muted">Sin préstamos.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {own.map((l) => (
              <li key={l.id}>
                <Link href={`/loans/${l.id}`} className="flex items-center justify-between py-2 hover:opacity-80">
                  <span className="tabular-nums">
                    {formatMoney(l.principal, l.currency)} · saldo {formatMoney(l.summary.balance, l.currency)}
                  </span>
                  <StatusBadge status={l.summary.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {own.length === 0 && (
        <form action={deleteBorrower}>
          <input type="hidden" name="id" value={id} />
          <button className="btn-secondary text-red-700 dark:text-red-400">Eliminar persona</button>
        </form>
      )}
      {error === "tiene-prestamos" && <FormMessage error="No se puede eliminar: todavía tiene préstamos." />}
    </div>
  );
}
