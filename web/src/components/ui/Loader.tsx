interface SpinnerProps { size?: number; className?: string }

export function Spinner({ size = 20, className = '' }: SpinnerProps) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      className={`animate-spin ${className}`}
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="10" stroke="#d6d9df" strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

interface TableSkeletonProps { rows?: number; cols?: number }

export function TableSkeleton({ rows = 8, cols = 5 }: TableSkeletonProps) {
  return (
    <tbody>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="animate-pulse">
          {[...Array(cols)].map((_, j) => (
            <td key={j}>
              <div
                className="h-4 rounded-md bg-stone-200"
                style={{ width: j === 0 ? '70%' : j === cols - 1 ? '50%' : '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface CardSkeletonProps { count?: number; className?: string }

export function CardSkeleton({ count = 4, className = 'grid grid-cols-2 lg:grid-cols-4 gap-4' }: CardSkeletonProps) {
  return (
    <div className={className}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="card p-5 animate-pulse h-28 bg-stone-100" />
      ))}
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size={28} />
    </div>
  );
}
