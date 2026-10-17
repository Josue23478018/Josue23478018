import Link from "next/link";
import { STATUS_LABEL, StatusBadge } from "@/components/ui";
import type { LoanStatus } from "@/lib/loans/calc";
import { listLoans } from "@/lib/loans/queries";
import { formatDate, formatMoney } from "@/lib/format";

const FILTERS: (LoanStatus | "all")[] = ["all", "active", "overdue", "paid", "cancelled"];

export default async function LoansPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const loans = (await listLoans()).filter((l) => status === "all" || l.summary.status === status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Préstamos</h1>
        <Link href="/loans/new" className="btn">
          Nuevo préstamo
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/loans" : `/loans?status=${f}`}
            className={`rounded-full border px-3 py-1 ${status === f ? "border-accent bg-accent/10 text-accent" : "border-border text-muted"}`}
          >
            {f === "all" ? "Todos" : STATUS_LABEL[f]}
          </Link>
        ))}
      </div>

      {loans.length === 0 ? (
        <p className="text-muted">No hay préstamos con este filtro.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Prestado</th>
                <th className="px-4 py-3 font-medium">Pagado</th>
                <th className="px-4 py-3 font-medium">Saldo</th>
                <th className="px-4 py-3 font-medium">Próximo pago</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loans.map((l) => (
                <tr key={l.id} className="hover:bg-background">
                  <td className="px-4 py-3">
                    <Link href={`/loans/${l.id}`} className="font-medium underline-offset-2 hover:underline">
                      {l.borrower.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(l.principal, l.currency)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(l.summary.paid, l.currency)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatMoney(l.summary.balance, l.currency)}</td>
                  <td className="px-4 py-3">{l.summary.nextDue ? formatDate(l.summary.nextDue.due_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.summary.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
