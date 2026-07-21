/**
 * Placeholder shapes for the console's tables while data loads.
 * Shaped like the rows that are coming, so the page does not jump.
 */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="sk-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk sk-row" />)}
    </div>
  );
}

/** Skeletons say nothing to a screen reader, so pair them with a live region. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
