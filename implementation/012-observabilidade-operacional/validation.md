# Validação

## Matriz de rastreabilidade

| Requisito | Critério | Tarefa | Teste | Evidência | Status |
|---|---|---|---|---|---|
| RF-034 | CA-034 | T-1201, T-1203, T-1206 | CT-1201, CT-1203, CT-1206 | scrape privado e secret externo no Compose | passed |
| RF-035 | CA-035 | T-1204, T-1206 | CT-1204, CT-1206 | seis regras com owner, impacto, janela e runbook | passed |
| RF-036 | CA-036 | T-1201, T-1203, T-1206 | CT-1201, CT-1203, CT-1206 | sete painéis e histogramas/counters/gauges | passed |
| RF-037 | CA-037 | T-1202, T-1206 | CT-1202, CT-1206 | validação e propagação de correlation ID disponível no payload | passed |
| RF-038 | CA-038 | T-1205, T-1206 | CT-1205, CT-1206 | redaction aninhada/query e política documentada | passed |

## Comandos e resultados

- `pnpm exec vitest run tests/unit/observability.test.ts tests/unit/observability-config.test.ts tests/unit/messaging.test.ts` — exit 0; 22 testes.
- `pnpm observability:validate` — exit 0; sete painéis validados.
- `pnpm typecheck` — exit 0.
- `docker compose config --quiet` — exit 0.
- `docker run ... promtool check config` — não executado: daemon Docker indisponível no host.

## Achados e riscos restantes

- Destino, retenção, destinatários e recursos de produção seguem sem aprovação; nenhum foi ativado.

## Limitações

- Thresholds são hipóteses de homologação até existir baseline. A validação oficial `promtool` deve ser repetida quando o daemon Docker estiver disponível.
