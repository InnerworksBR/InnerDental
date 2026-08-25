# Runbook: Incidente de roteamento LLM (Luna)

## Sintomas

Qualquer um destes alertas pode estar disparando:

- `LunaRoutingFallbackHigh` (warning) — mais de 10% das chamadas do router estão caindo para fallback determinístico.
- `LunaRoutingLatencyHigh` (warning) — p95 da latência do router acima de 4s por 10min.
- `LunaRoutingShadowDrift` (info) — divergência entre LLM e regex acima de 20% por 30min.
- `LunaRoutingBudgetExhausted` (info) — gasto de tokens acima de 120% do orçamento horário.
- `LunaRoutingDeadLetterSpike` (critical) — dead-letters da inbox crescendo simultaneamente a uma alta taxa de fallback.

Dashboards a consultar antes de agir:

- **Luna Routing** (`ops/observability/dashboards/luna-routing.json`) — painel `routing mix`, `fallback rate`, `tool latency p95`, `disagreement rate`, `daily token spend`, `dead-letter correlation`.
- **Luna Agenda — Operação** (`ops/observability/dashboards/luna-operations.json`) — backlog e dead-letters agregados para confirmar impacto fora do router.

## Ações imediatas

1. **Forçar modo regex (sem deploy)**:
   - Definir `WORKER_LLM_ROUTING_ENABLED=regex_only` no worker.
   - Esse flag reusa o cascade atual (`runRegexCascade`) e desliga completamente a chamada OpenAI. Não exige deploy — apenas mudança de env var + reinício do worker.

2. **Confirmar drenagem**:
   - Aguardar 5 minutos.
   - Verificar `luna_worker_messages_total{routing="regex"}` no painel **Routing mix** — a taxa deve voltar ao baseline sem queda de mensagens.
   - Confirmar que `luna_routing_calls_total` parou de crescer (router não está mais sendo chamado).

3. **Verificar OpenAI**:
   - Consultar [https://status.openai.com/](https://status.openai.com/) para incidentes em andamento.
   - Se houver incidente confirmado no provedor, manter `regex_only` até resolução.
   - Se o provedor está saudável e o sintoma persiste, abrir investigação mais profunda (logs do worker, correlacionando `routing_ungrounded`, `routing_skipped`, `routing_budget_exceeded`).

## Rollback / modos de operação

| Modo | `WORKER_LLM_ROUTING_ENABLED` | Quando usar |
|---|---|---|
| `llm` (default pós-PR 7) | `llm` | Operação normal; router LLM primário com fallback regex. |
| `shadow` | `shadow` | Diagnóstico: LLM observa em paralelo, regex responde. Útil para comparar decisões via `luna_routing_disagreement_total`. |
| `regex_only` | `regex_only` | Emergência: desliga OpenAI completamente, mantém o cascade determinístico. |
| `off` | `off` (ou unset) | Pré-PR 6 / desligar totalmente — equivalente a `regex` legacy. |

Para **restaurar LLM-primário**: voltar `WORKER_LLM_ROUTING_ENABLED=llm`.
Para **diagnóstico sem responder via LLM**: `WORKER_LLM_ROUTING_ENABLED=shadow` e inspecionar `luna_routing_disagreement_total{regex_tool, llm_tool}` no painel **Disagreement rate**.
Para **desligar completamente**: `WORKER_LLM_ROUTING_ENABLED=off` ou unset.

## Escalação

- Owner primário: `messaging` (ver labels `owner: messaging` nos alertas).
- Dashboard operacional: [Luna Routing](ops/observability/dashboards/luna-routing.json) (`uid: luna-routing`).
- Antes de escalar, anexar:
  - Screenshot ou print JSON do painel **Routing mix** mostrando a janela do incidente.
  - Últimas 24h de `luna_routing_calls_total` por `outcome` (extrair do Prometheus).
  - Correlação com status.openai.com quando aplicável.
