import Link from "next/link";
import { listBorrowers, listLoans } from "@/lib/loans/queries";
import { formatMoney } from "@/lib/format";

export default async function BorrowersPage() {
  const [borrowers, loans] = await Promise.all([listBorrowers(), listLoans()]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Personas</h1>
      {borrowers.length === 0 ? (
        <p className="text-muted">
          Las personas se agregan al{" "}
          <Link href="/loans/new" className="text-accent underline">
            registrar un préstamo
          </Link>
          .
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {borrowers.map((b) => {
            const own = loans.filter((l) => l.borrower.id === b.id);
            const open = own.filter((l) => l.summary.status === "active" || l.summary.status === "overdue");
            const balances = new Map<string, number>();
            for (const l of open) balances.set(l.currency, (balances.get(l.currency) ?? 0) + l.summary.balance);
            return (
              <li key={b.id}>
                <Link href={`/borrowers/${b.id}`} className="card block hover:border-accent">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-sm text-muted">{[b.phone, b.email].filter(Boolean).join(" · ") || "Sin contacto"}</p>
                  <p className="mt-2 text-sm">
                    {own.length} préstamo{own.length === 1 ? "" : "s"}
                    {balances.size > 0 &&
                      ` · debe ${[...balances].map(([cur, v]) => formatMoney(v, cur)).join(" + ")}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
