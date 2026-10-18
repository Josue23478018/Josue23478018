import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink, EmptyState, FormMessage, PageHeader, StatusBadge } from "@/components/ui";
import { listBorrowers, listLoans } from "@/lib/loans/queries";
import { formatDate, formatMoney } from "@/lib/format";
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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={<BackLink href="/borrowers">Personas</BackLink>}
        title={borrower.name}
        description={[borrower.phone, borrower.email].filter(Boolean).join(" · ") || "Sin contacto"}
      />

      <section aria-labelledby="prestamos" className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="prestamos" className="h2">
            Préstamos
          </h2>
          <Link href={`/loans/new?borrower=${id}`} className="btn-secondary btn-sm min-h-11 sm:min-h-9">
            Nuevo préstamo
          </Link>
        </div>
        {own.length === 0 ? (
          <EmptyState compact title="Sin préstamos" description="Esta persona todavía no tiene préstamos registrados." />
        ) : (
          <ul className="divide-y divide-border">
            {own.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/loans/${l.id}`}
                  className="-mx-2 flex min-h-14 items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-subtle"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{formatMoney(l.principal, l.currency)}</span>
                      <StatusBadge status={l.summary.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-muted">Prestado el {formatDate(l.start_date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">Saldo</p>
                    <p className="num font-semibold">{formatMoney(l.summary.balance, l.currency)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="datos" className="space-y-3">
        <h2 id="datos" className="h2">
          Datos de contacto
        </h2>
        <BorrowerForm borrower={borrower} />
      </section>

      {own.length === 0 && (
        <section aria-labelledby="zona-peligro" className="card space-y-3 border-danger/30">
          <h2 id="zona-peligro" className="text-sm font-semibold text-danger">
            Eliminar persona
          </h2>
          <p className="text-sm text-muted">Solo se puede eliminar a una persona sin préstamos.</p>
          <form action={deleteBorrower}>
            <input type="hidden" name="id" value={id} />
            <ConfirmButton className="btn-danger w-full sm:w-auto" message={`¿Eliminar a ${borrower.name}? Esta acción no se puede deshacer.`}>
              Eliminar persona
            </ConfirmButton>
          </form>
        </section>
      )}
      {error === "tiene-prestamos" && <FormMessage error="No se puede eliminar: todavía tiene préstamos." />}
    </div>
  );
}
