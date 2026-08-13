---
name: whatsapp-fix
description: Implement the definitive local fix for the Luna WhatsApp routing incident.
---

# WhatsApp definitive fix

Implement or rework the active incident described in
`implementation/018-whatsapp-routing-definitivo/incident.md`.

## Setup sequence

1. Read the incident file completely and treat its invariants and acceptance cases as the
   source of truth.
2. Inspect `git status --short` and preserve every unrelated user-owned change. Never edit,
   delete, stage, or revert the existing untracked manuals, architecture artifacts, or
   `implementation/PRD.md`.
3. Inspect the current implementation and the handoff from the previous review before editing.
4. Do not read `.env`, connect to external systems, apply a remote migration, send WhatsApp,
   deploy, commit, push, or create a pull request. Work only in the local repository.

## Implementation rules

- Fix causes, not just the five literal messages. Keep plan resolution, critical facts,
  workflow actions, and fallbacks deterministic.
- OpenAI may remain only as an optional rewrite layer for an already selected non-critical
  FAQ. The system must remain correct and ready when OpenAI is disabled.
- Use explicit canonical names and aliases. Do not use fuzzy substring/brand matching for
  plan identity, and never equate an unknown term with a rejected plan.
- Keep changes additive and rollout-safe. When production data or schema must change, add a
  forward migration and tests; do not mutate any external database.
- Prefer pure domain functions and transcript-like regression tests derived from the incident.
- A response that tells a patient to use a link must contain a newly generated real link or
  interactive action in the same reply.
- Run focused tests while iterating, then the relevant broader checks. Do not hide failures by
  weakening assertions or changing business facts.
- The WSL Node runtime is too old for Vitest. Run the focused suite through Windows with
  `powershell.exe -NoProfile -Command "Set-Location 'C:\Apps\Projeto_priscila'; pnpm vitest run tests/unit/whatsapp-routing-definitivo.test.ts tests/unit/verified-facts.test.ts tests/unit/messaging.test.ts"`.
- The first implementation left two old tests red. Reconcile them with the new deterministic
  contract instead of restoring fuzzy matching: register an explicit `Amil` alias in the coverage
  fixture, and replace the old fuzzy `Unimed` ambiguity expectation with (a) unknown generic text
  returning `not_found` and (b) an exact duplicate public term being rejected by the catalog
  invariant. Saved-plan + explicit coverage questions must still resolve coverage.
- Independent database review rejected the current catalog direction. The authoritative root
  `PRD.md` lines 608-649 maps Bradesco Dental, Odontoprev, BB Dental and Previan to the canonical
  Rede UNNA plan. The forward migration must remap every local FK/reference and compatible
  coverage row to Rede UNNA before deactivating the duplicate canonical rows, then register those
  four public terms (plus Odontopreve) as Rede UNNA aliases. Do not merely disable those aliases.
  Fail closed and roll back on conflicting coverage facts rather than choosing one silently.
- Do not model private-pay as a null patient plan or a synthetic `particular` id. The portal
  requires an active UUID plan (`src/app/api/appointments/route.ts` and `src/app/agenda/page.tsx`).
  Ensure an active canonical `Particular` plan exists, resolve explicit private-pay phrases to its
  real UUID, persist it as the existing `accepted` session state before sending, and verify that the
  emitted portal link can use that completed profile. Remove the null-plan `particular` status.
- Persist plan acceptance and the patient profile atomically in one database RPC/transaction before
  any outbound send. Two sequential upserts are not sufficient: if the second fails, a retry sees an
  accepted session while the portal profile remains incomplete.
- The current statement-trigger-only catalog assertion is MVCC-racy across concurrent plan/alias
  writes. Back the public-term ownership with a real PostgreSQL UNIQUE key/index (for example,
  canonical self-alias rows plus a unique normalized active alias term, maintained by a trigger),
  so conflicting concurrent transactions cannot both commit. Keep the application assertion as a
  defense in depth. Make the migration safe on reexecution.
- Add a partial `(phone, created_at)` index matching the 10-second debounce lookup. Avoid a full
  unindexed backlog scan. Since private-pay no longer needs a new session status, avoid rewriting and
  validating the entire triage table just to change its CHECK constraint.
- Revoke default PUBLIC execute privileges from new helper functions/RPCs and grant only the roles
  actually used by the application, consistent with existing migrations.
- The plan-management write path is currently multiple independent operations. Introduce and use a
  transactional database RPC for saving the canonical plan and its complete alias set, or otherwise
  ensure the new single public-term registry cannot be left partially updated.
- Add worker-boundary transcript tests for patient names during `awaiting_plan`, the DentalPar/card
  screenshot, child policy, real link replacement, canonical Rede UNNA aliases, and Particular.
  Static `readFileSync(...).toContain(...)` checks are supporting evidence only, not acceptance tests.
- Payment language (`pagar`, `cartão`, `crédito`, `débito`, `pix`, `parcelar`) has priority over a
  procedure noun in the same message. If a uniquely categorized payment FAQ exists, use it;
  otherwise hand off safely. The DentalPar/card transcript must not answer with generic procedure
  information and must never mention the saved plan.
- Keep the child-policy matcher conservative: require both a child/age term and an attendance,
  consultation or age-policy cue. A mere possessive such as `plano do meu filho` must not suppress
  an insurance question.
- Do not special-case `plan.id === "particular"`; IDs are UUIDs. Detect private-pay only by the
  canonical normalized plan name (or an explicit typed property) everywhere, including legacy
  structured helpers and templates.
- Reconcile compatible coverage facts across the entire set `{Rede UNNA + every legacy duplicate}`
  before changing any foreign key. Two identical legacy rows for a procedure must collapse into
  one Rede UNNA row even when Rede UNNA did not already have that procedure; any distinct
  `(accepted, instructions)` pair must abort the migration before data is changed.
- Harden `accept_whatsapp_plan_triage` against stale state. Serialize by phone, lock and validate
  the current session/prompt, reject an expired or superseded prompt, make an exact accepted replay
  idempotent, lock the active plan strongly enough to block concurrent deactivation, and set the
  24-hour expiry on the server. Do not trust arbitrary pending text from the caller.
- Make readiness prove that the definitive schema is installed and usable: exercise the catalog
  assertion and query the physical normalized-term registry columns/index-backed representation.
  A web/worker version that needs migrations 024/025 must not report ready against migration 023.
- Extend the executable PostgreSQL regression (not source-text assertions) to cover compatible
  Rede UNNA consolidation, conflicting coverage rollback, patients/appointments/triage remapping,
  active-term uniqueness, atomic Particular acceptance, stale-session rejection, and the
  transactional administrative RPC. Run it on a disposable local PostgreSQL instance when
  available; never connect to production.
- Finish worker-boundary transcripts for `Não possuo esse link` while `awaiting_plan`, all three
  negative link phrasings, child-policy single-answer/no-plan behavior, and `Mas a clínica atende?`
  with the scheduling FAQ loaded. Include an explicit Amil plan/alias in the Camila/Amilton fixture
  so those regressions prove bounded matching. When acceptance RPC fails, assert no outbound reply
  or portal token is emitted.
- Preserve the original pending request across retries after acceptance. If the RPC succeeds but
  token creation, provider send, or inbox finalization fails, reprocessing the same inbox must
  idempotently resume the accepted session's `pending_message` and recreate the intended response;
  it must not reinterpret the literal answer `Particular` as a new conversation/fallback.
- Give every accepted triage an explicit `accepted_by_inbox_id`. The acceptance RPC must receive the
  answer inbox ID, validate and lock the current prompt, and allow replay only when prompt, answer
  inbox, phone and plan are exactly the same. The worker must resume `pending_message` only for that
  exact inbox; later messages must not revive an old accepted prompt.
- On accepted replay, lock and revalidate both the patient row and the selected active plan before
  returning success. A deactivated plan or concurrently changed patient profile must fail closed.
- The worker must call the idempotent acceptance RPC on every `resume`, including a session it just
  recognized as already accepted; an `alreadyAccepted` shortcut that skips database revalidation is
  forbidden.
- Do not let blind session upserts race with acceptance. Beginning, replacing, expiring or rejecting
  triage must use a compare-and-set RPC under the same per-phone advisory lock as acceptance. A worker
  that read `awaiting_plan` before another worker accepted it must be unable to overwrite `accepted`.
- Prepare portal access links idempotently per source inbox. Persist one delivery record with a UNIQUE
  `source_inbox_id`, the access-token row, and the encrypted opaque token in a single database RPC;
  decrypt and reuse the same URL on retry. Reuse the existing AES-GCM secret, never store the raw token,
  and document that the provider cannot guarantee exactly-once delivery without an idempotency key.
- Never add test-only production fallbacks when the required RPC or mock is missing. Tests must model
  the real RPC contract, and production code must fail closed in every environment.
- Bind the decrypted token back to its stored access-token hash, phone, active status and expiry.
  Record link delivery status/sent_at; after a confirmed send, a finalize-only retry must not call the
  provider again. Document the unavoidable ambiguous timeout window when the provider has no key.
- `replace` is not compare-and-set unless it receives and validates the expected old prompt. Prefer a
  single locked transition that rejects/supersedes exactly the observed prompt and starts the new one;
  stale workers cannot overwrite a newer awaiting prompt.
- Backfill or safely expire legacy accepted sessions without provenance, add FK/check invariants for
  `accepted_by_inbox_id`, and make readiness verify those constraints/rows, not only column existence.
- Include legacy canonical `Odontopreve` in Rede UNNA reconciliation (prefer normalized-term matching),
  remapping its references and coverage before deactivation just like the other legacy spellings.
- Negative PostgreSQL tests must not catch their own failure sentinel. Assert an exact expected error
  or SQLSTATE and use a sentinel whose text cannot match the expected application exception.
- Execute the readiness `GET` in tests: no OpenAI plus healthy required dependencies/schema returns
  200 with `openai: disabled`; a missing or incompatible routing RPC/schema returns 503. Source-string
  assertions do not satisfy this requirement.
- Add a disposable PostgreSQL runner and real two-connection concurrency cases. Exercise fresh all
  migrations plus seed, a compatible pre-024 upgrade (including `Odontopreve`), a conflicting upgrade
  that rolls back fully, concurrent public-term ownership, and acceptance-vs-rejection interleaving.
- Do not keep brittle tests that merely require an exact SQL source substring such as
  `status = 'failed'`; assert runtime behavior in the database regression instead.

## Required output

Summarize files changed, behavior fixed, migrations added, and exact validation results. State
`READY_FOR_REVIEW` only when all incident acceptance cases are covered and passing. If blocked,
state the concrete blocker without claiming completion.
