export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable: (error: unknown) => boolean;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

export async function withBoundedRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const base = Math.max(1, options.baseDelayMs ?? 150);
  const ceiling = Math.max(base, options.maxDelayMs ?? 2_000);
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      lastError = error;
      if (attempt === attempts || !options.isRetryable(error)) throw error;
      const cap = Math.min(ceiling, base * 2 ** (attempt - 1));
      await sleep(Math.max(1, Math.floor(cap * (0.5 + random() * 0.5))));
    }
  }
  throw lastError;
}
