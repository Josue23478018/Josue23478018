import type { LoanStatus } from "@/lib/loans/calc";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error) return <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>;
  if (message) return <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{message}</p>;
  return null;
}

const STATUS_LABEL: Record<LoanStatus, string> = {
  active: "Activo",
  paid: "Pagado",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

const STATUS_CLASS: Record<LoanStatus, string> = {
  active: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  paid: "bg-green-500/10 text-green-700 dark:text-green-300",
  overdue: "bg-red-500/10 text-red-700 dark:text-red-300",
  cancelled: "bg-zinc-500/10 text-muted",
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export { STATUS_LABEL };
