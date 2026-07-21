/**
 * Placeholder shapes shown while data loads.
 *
 * Shaped like the content that is coming, so the page does not jump when it
 * arrives and the wait reads as progress rather than as a stall.
 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="sk-stack" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="sk sk-row" />)}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => <div key={i} className="sk sk-card" />)}
    </div>
  );
}

export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="sk-stack" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`sk sk-line${i === lines - 1 ? ' short' : ''}`} />
      ))}
    </div>
  );
}

/**
 * Announces loading to assistive tech, which cannot see the shapes.
 * Pair with any of the skeletons above.
 */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
