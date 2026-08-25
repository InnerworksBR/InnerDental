/**
 * Type contract for the legacy regex cascade that powers the LLM router's
 * deterministic fallback path.
 *
 * The actual implementation lives in `worker/index.ts` as the private
 * `runRegexCascade` method (extracted in PR 4, byte-for-byte preserved in
 * PR 6, never deleted in PR 8). This module exists so the router/fallback
 * contract can be reasoned about independently of the worker class, and so
 * future PRs that swap in a different fallback can evolve the type without
 * reaching into `worker/index.ts` at the value level.
 *
 * The re-export is type-only: the symbols are erased at runtime, so there is
 * no circular dependency between `src/domain/messaging/` and `worker/`.
 *
 * @deprecated This module documents the legacy fallback. New code should
 * consume the LLM router (`src/domain/messaging/router-tools.ts`) directly.
 * The fallback path will be removed in a future major release once the LLM
 * router has been the sole routing source in production for ≥ 60 days.
 */
export type { RegexCascadeInput, RegexCascadeResult } from "../../../worker/index.ts";