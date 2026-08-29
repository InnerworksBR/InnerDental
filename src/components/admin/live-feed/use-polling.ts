import { useCallback, useEffect, useRef, useState } from "react";

type PollingState<T> = {
  data: T | null;
  isLive: boolean;
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
  error: Error | null;
};

type Options = {
  enabled?: boolean;
  intervalMs?: number;
};

export function usePolling<T>(fetcher: () => Promise<T>, { enabled = true, intervalMs = 10_000 }: Options = {}): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => { fetcherRef.current = fetcher; });

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    void refresh();
    queueMicrotask(() => setIsLive(true));
    timer = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      setIsLive(false);
    };
  }, [enabled, intervalMs, refresh]);

  return { data, isLive, lastUpdatedAt, refresh, error };
}
