# Validação

## Matriz de rastreabilidade

| Requisito | Critério | Tarefa | Teste | Evidência | Status |
|---|---|---|---|---|---|
| RF-024 | CA-024 | T-1001, T-1003 | CT-1001, CT-1004 | testes de origem e `docker compose config` | passed |
| RF-025 | CA-025 | T-1002 | CT-1002 | testes de env e `config:verify` | passed |
| RF-026 | CA-026 | T-1002 | CT-1003 | `security:scan` sem achados | passed |
| RF-027 | CA-027 | T-1003, T-1004 | CT-1004, CT-1005 | labels OCI e recibo de imagens versionados na CI | passed |
| RF-028 | CA-028 | T-1005 | CT-1006 | smoke script e runbook atualizados | passed |

## Comandos e resultados

- `pnpm exec vitest run tests/unit/env.test.ts tests/unit/request-origin.test.ts` — exit 0; 8 testes.
- `pnpm typecheck` — exit 0.
- `pnpm lint` — exit 0.
- `pnpm build` — exit 0; 22 páginas geradas e rotas compiladas.
- `pnpm security:scan` — exit 0; 220 arquivos verificados.
- `docker compose config --quiet` — exit 0.
- `node scripts/verify-runtime-config.mjs` com valores sintéticos — exit 0.

## Achados e riscos restantes

- DNS, TLS, secrets, registry e deploy exigem aprovações específicas posteriores; nenhum foi alterado.

## Limitações

- O smoke contra ambiente real e a inspeção de digests reais permanecem para o rollout autorizado.
