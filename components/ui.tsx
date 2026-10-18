import Link from "next/link";
import type { LoanStatus } from "@/lib/loans/calc";

export function Field({
  label,
  hint,
  suffix,
  children,
}: {
  label: string;
  hint?: string;
  /** Texto fijo a la derecha del control (p. ej. la moneda o "%"). */
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {suffix ? (
        <span className="relative block">
          {children}
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>
        </span>
      ) : (
        children
      )}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p role="alert" className="flex gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
        <span aria-hidden="true" className="font-bold">
          !
        </span>
        <span>{error}</span>
      </p>
    );
  if (message)
    return (
      <p role="status" className="flex gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5 text-sm text-success">
        <span aria-hidden="true" className="font-bold">
          ✓
        </span>
        <span>{message}</span>
      </p>
    );
  return null;
}

const STATUS_LABEL: Record<LoanStatus, string> = {
  active: "Activo",
  paid: "Pagado",
  overdue: "Atrasado",
  cancelled: "Cancelado",
};

const STATUS_CLASS: Record<LoanStatus, string> = {
  active: "border-info/30 bg-info/10 text-info",
  paid: "border-success/30 bg-success/10 text-success",
  overdue: "border-danger/40 bg-danger/10 text-danger",
  cancelled: "border-border bg-subtle text-muted",
};

// Además del color, cada estado tiene su texto y un símbolo distinto.
const STATUS_ICON: Record<LoanStatus, string> = {
  active: "●",
  paid: "✓",
  overdue: "!",
  cancelled: "×",
};

export function StatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}
    >
      <span aria-hidden="true" className="text-[0.7rem] leading-none">
        {STATUS_ICON[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {back}
        <h1 className="h1">{title}</h1>
        {description && <div className="text-sm text-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "primary" | "danger";
}) {
  const toneClass =
    tone === "primary" ? "border-accent/40 bg-accent/5" : tone === "danger" ? "border-danger/40 bg-danger/5" : "";
  return (
    <div className={`card min-w-0 ${toneClass}`}>
      <p className="eyebrow">{label}</p>
      <div
        className={`mt-2 text-xl font-semibold tracking-tight tabular-nums break-words sm:text-2xl ${tone === "danger" ? "text-danger" : "text-foreground"}`}
      >
        {value}
      </div>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-xl border border-dashed border-border text-center ${compact ? "gap-1 px-4 py-6" : "gap-2 bg-surface px-6 py-12"}`}
    >
      <p className={compact ? "text-sm font-medium" : "text-base font-semibold"}>{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted hover:text-foreground sm:min-h-0">
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

export { STATUS_LABEL };
