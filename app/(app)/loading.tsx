export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Cargando…</span>
      <div aria-hidden="true" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="skeleton h-11 w-full sm:w-40" />
      </div>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-28" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="card space-y-4">
        <div className="skeleton h-5 w-40" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <div className="space-y-2">
              <div className="skeleton h-4 w-36" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
