---
name: whatsapp-review
description: Independently review and test the Luna WhatsApp incident fix without editing it.
---

# WhatsApp incident review

Review the current implementation against
`implementation/018-whatsapp-routing-definitivo/incident.md`.

## Review sequence

1. Read the incident file completely.
2. Inspect `git status`, the diff, every touched migration, and the relevant production code.
3. Preserve unrelated user changes. This is a read-only review: do not edit files, stage,
   commit, push, deploy, connect to external systems, read `.env`, or send messages.
4. Run focused regression tests plus type checking. Run broader validation when practical.
   Vitest requires the Windows Node 24 runtime in this workspace; invoke it with
   `powershell.exe -NoProfile -Command "Set-Location 'C:\Apps\Projeto_priscila'; pnpm vitest run tests/unit/whatsapp-routing-definitivo.test.ts tests/unit/verified-facts.test.ts tests/unit/messaging.test.ts"`.
5. Look actively for state-machine traps, false positive plan matches, stale-message merging,
   send-before-persist retries, schema/code mismatch, and behavior when OpenAI is absent.

## Approval standard

- Every acceptance transcript must be tested at the worker or domain boundary that previously
  failed, not only through unused helper functions.
- A catalog term can resolve to only one active plan ID after the migration.
- Unknown text and patient names cannot be labeled as unsupported insurance.
- Contextual plan data cannot become the answer to an unrelated question.
- FAQ selection cannot be triggered by one generic word or by words found only in an answer.
- The private-pay path must satisfy the real migration constraint and persist before sending.
- Rede UNNA consolidation must remap patients, appointments, triage sessions, and compatible
  coverage rows before deactivation; conflicting coverage must abort.
- Private-pay must use the real active `Particular` UUID and complete the same portal profile used
  by appointment creation. Triage and patient persistence must be one atomic RPC before send.
- Catalog uniqueness and administrative plan+alias replacement must be safe under concurrent writes,
  not only checked by a read-before-write application query.
- Compatible duplicate coverages must consolidate even when no Rede UNNA target row existed; a
  divergent legacy fact must roll the whole migration back.
- Plan acceptance must reject stale/expired/superseded sessions, be idempotent for the same accepted
  prompt, prevent concurrent plan deactivation, and never send when the RPC fails.
- A retry after successful acceptance but failed token/send/finalize must resume the same accepted
  prompt idempotently; it must not reinterpret `Particular` and fall into a different reply/handoff.
- Accepted replay must be bound to the exact answer inbox (`accepted_by_inbox_id`), prompt and plan;
  a different inbox cannot resume old pending text.
- Accepted replay must re-lock and revalidate the active plan and patient profile; it cannot return
  success merely because the session row still says `accepted`.
- Reject any worker shortcut that recognizes accepted replay but skips calling the idempotent RPC.
- Rejection/replacement of an awaiting session must be compare-and-set under the same phone lock as
  acceptance. Reject any design where a stale blind upsert can overwrite a concurrent `accepted` row.
- Link creation must be idempotent per source inbox and transactional with its access token. Retries
  reuse one encrypted opaque token/URL; raw tokens are never stored.
- The worker must validate decrypted token hash/status/expiry/phone, persist sent state, and avoid a
  second provider call when only inbox finalization failed. Test-only fallbacks for missing RPCs are a
  blocking defect.
- Triage replacement must validate the expected old prompt; a `replace` action that can overwrite any
  awaiting row is not CAS. Legacy accepted rows without provenance must be reconciled and constrained.
- Rede UNNA migration fixtures must include legacy canonical `Odontopreve`, not only an alias.
- Negative SQL tests must prove the application exception rather than catch their own sentinel, and
  concurrency claims require two real database connections/interleavings.
- Readiness acceptance requires executing `GET` for both healthy-no-OpenAI and incompatible-schema
  outcomes; source inspection alone is insufficient.
- Readiness must fail against a pre-024/025 schema or a conflicting catalog; static source checks do
  not satisfy this gate.
- The executable database regression must cover remapping, rollback, registry uniqueness, atomic
  Particular acceptance, stale-session behavior, and the administrative catalog RPC.
- No known high-severity finding or unexplained failing check may remain.

## Required output

List findings first, ordered by severity, with files and lines. End with exactly one clear
judgment token: `APPROVED` or `NEEDS_REWORK`. Do not approve merely because existing tests pass.
