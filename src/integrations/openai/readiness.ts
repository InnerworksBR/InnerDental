import "server-only";

let cached: { keyFingerprint: string; ready: boolean; expiresAt: number } | undefined;

export async function openAIReady(environment: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) return false;
  const fingerprint = `${apiKey.slice(0, 7)}:${apiKey.length}`;
  if (cached && cached.keyFingerprint === fingerprint && cached.expiresAt > Date.now()) return cached.ready;
  try {
    const response = await fetcher("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2_500),
      cache: "no-store",
    });
    cached = { keyFingerprint: fingerprint, ready: response.ok, expiresAt: Date.now() + 5 * 60_000 };
  } catch {
    cached = { keyFingerprint: fingerprint, ready: false, expiresAt: Date.now() + 30_000 };
  }
  return cached.ready;
}
