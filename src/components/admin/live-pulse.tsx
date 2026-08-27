type LivePulseProps = {
  label?: string;
  lastUpdatedAt?: string | null;
};

export function LivePulse({ label = "Ao vivo", lastUpdatedAt }: LivePulseProps) {
  return (
    <span className="live-pulse" role="status" aria-live="polite">
      <span className="live-pulse__dot" aria-hidden="true" />
      <span className="live-pulse__label">{label}</span>
      {lastUpdatedAt && <time className="live-pulse__time" dateTime={lastUpdatedAt}>{lastUpdatedAt.slice(11, 16)}</time>}
    </span>
  );
}
