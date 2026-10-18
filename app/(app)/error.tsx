"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-danger/10 text-xl font-bold text-danger">
        !
      </span>
      <div className="space-y-1">
        <h1 className="h2">No pudimos cargar esta página</h1>
        <p className="text-sm text-muted">
          Ocurrió un problema al obtener tus datos. Tus préstamos y abonos no se modificaron. Inténtalo de nuevo en un momento.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button type="button" className="btn" onClick={() => reset()}>
          Reintentar
        </button>
        <Link href="/dashboard" className="btn-secondary">
          Ir al resumen
        </Link>
      </div>
      {error.digest && (
        <p className="text-xs text-muted">
          Código de referencia: <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
