# Validação

## Matriz de rastreabilidade

| Requisito | Critério | Tarefa | Teste | Evidência | Status |
|---|---|---|---|---|---|
| RF-029 | CA-029 | T-1101, T-1102, T-1106 | CT-1101, CT-1103, CT-1107 | migration e worker validam token/expiração | passed |
| RF-030 | CA-030 | T-1101, T-1104, T-1106 | CT-1102, CT-1105, CT-1107 | `dead_lettered_at` e projeção administrativa | passed |
| RF-031 | CA-031 | T-1103 | CT-1104 | retry limitado com jitter e timeouts | passed |
| RF-032 | CA-032 | T-1102, T-1106 | CT-1103, CT-1107 | `SKIP LOCKED`, identidade e concorrência limitada | passed |
| RF-033 | CA-033 | T-1105, T-1106 | CT-1106, CT-1107 | gauges/counters agregados e teste sem IDs | passed |

## Comandos e resultados

- `pnpm exec vitest run tests/unit/messaging.test.ts tests/unit/observability.test.ts tests/unit/message-leases-migration.test.ts tests/unit/admin-projections.test.ts` — exit 0; 23 testes.
- `pnpm typecheck` — exit 0.
- `pnpm test` — exit 0; 21 arquivos e 76 testes.
- `pnpm lint` — exit 0.
- `docker compose config --quiet` — exit 0.

## Achados e riscos restantes

- Aplicação remota continua pendente de backup, volume, owner e janela. Índices normais e futura validação das constraints devem ser medidos em ambiente representativo.

## Limitações

- Não houve conexão com Supabase real; a evidência de concorrência é estática/unitária e deve ser repetida em banco descartável antes do rollout.
