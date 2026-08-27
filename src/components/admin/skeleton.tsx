type SkeletonProps = {
  variant?: "card" | "row" | "pill" | "calendar-day";
  count?: number;
  ariaLabel?: string;
};

export function Skeleton({ variant = "card", count = 1, ariaLabel = "Carregando" }: SkeletonProps) {
  return (
    <div role="status" aria-busy="true" aria-label={ariaLabel} className={`ops-skeleton ops-skeleton--${variant}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="ops-skeleton__shimmer" />
      ))}
    </div>
  );
}
