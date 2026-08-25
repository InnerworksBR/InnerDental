# Observabilidade

## Perguntas e sinais

| Pergunta operacional | Sinal | Dimensões permitidas | Ação |
|---|---|---|---|
| O portal está atendendo? | `GET /api/health/live` | serviço | reiniciar somente se o processo não responder |
| É seguro receber novos agendamentos? | `GET /api/health/ready` | database, calendar, openai, evolution, portal | bloquear rollout e consultar integrações |
| O worker está consumindo filas? | `GET /health` do worker e `luna_worker_messages_total` | queue, result, routing | verificar Supabase e Evolution |
| Há repetição de falhas? | `luna_worker_failures_total` e eventos JSON `*_failed` | queue/evento | seguir runbook de incidente; não registrar payload |
| O tráfego mudou? | `luna_http_requests_total` | method, area | comparar com baseline de homologação |
| Qual caminho respondeu a inbox? | `luna_worker_messages_total` | queue=inbox, routing ∈ {regex, llm, hybrid} | comparar `routing="llm"` vs `routing="regex"` para auditoria |

Todas as dimensões são de cardinalidade limitada. IDs de correlação podem aparecer somente em logs, nunca como label de métrica.

O evento `inbox_message_processed` inclui `factResolution`, `factSource` e `groundingResult` para reconstruir a decisão (`resolved`, `not_found`, `ambiguous_plan`, `price_unavailable`; fonte `faq`, `plan`, `procedure` ou `coverage`; resultado `accepted`, `fallback`, `disabled` ou `not_used`). Esses campos não incluem texto do paciente, resposta, telefone, payload ou segredo.

## Segurança e acesso

- `/api/metrics` e `/metrics` do worker exigem o mesmo `METRICS_TOKEN` em Bearer e não devem ser expostos publicamente.
- Logs não incluem telefone, corpo de webhook, texto de mensagem, OTP, cookie, Authorization ou segredo.
- Retenção, destino de logs, dashboards e alertas precisam ser aprovados no ambiente antes da publicação.

## Coleta versionada

O perfil opcional `observability` do Compose inicia Prometheus ligado apenas a `127.0.0.1`. Os alvos são `web:3000` e `worker:3001` no backplane; o Bearer é lido do secret externo `metrics_token`. Antes de promover configurações, execute `pnpm observability:validate`. Dashboards ficam em `ops/observability/dashboards/` e não contêm telefone, mensagem, payload ou correlation ID.

`PROMETHEUS_RETENTION` tem default local de sete dias. Retenção, armazenamento e acesso reais continuam exigindo aprovação do ambiente. Logs JSON devem ser coletados pelo runtime sem copiar stdout para artefatos públicos; o destino deve aplicar acesso mínimo e descarte aprovado. Para depuração local, `LOG_FORMAT=pretty` habilita a visualização legível e `LOG_LEVEL=debug` inclui o início de cada ciclo; produção deve manter `LOG_FORMAT=json`.

## SLI/SLO propostos para homologação

- Disponibilidade de leitura: 99,5% de respostas não-5xx em 30 dias.
- Latência de disponibilidade: p95 menor ou igual a 3 s, medida sem cache e com sandbox Calendar.
- Worker: nenhuma mensagem em `processing` além do lease; crescimento de falhas por 5 minutos exige investigação.

Os valores são proposta até existir baseline de homologação. Não são SLOs de produção aprovados.

## Alertas propostos

- readiness 503 por 3 verificações: impacto em novas marcações; confirmar também se a instância Evolution configurada está `open`; runbook `docs/runbooks/deploy-easypanel.md`.
- worker unhealthy por 3 verificações ou falhas crescentes por 5 min: impacto em confirmação/OTP; runbook `docs/runbooks/incident-response.md`.
- p95 acima de 3 s por 10 min: impacto em disponibilidade; confirmar Calendar antes de escalar.

As regras executáveis em `ops/observability/alerts.yml` incluem owner, severidade, impacto, janela e runbook. Elas não executam restart, reprocessamento ou qualquer mitigação automática.

## Roteamento LLM (PR 5 em diante)

O worker oferece um flag opt-in para introduzir roteamento por LLM com fallback determinístico:

- `WORKER_LLM_ROUTING_ENABLED` aceita `off` (default, regex puro), `shadow` (LLM observa em paralelo, regex responde), `llm` (PR 6, LLM primário) ou `regex_only` (modo de emergência, regex sem LLM). Valores herdados: `true` ≡ `llm`, `false` ≡ `off`. Qualquer outro valor é rejeitado na inicialização (`WORKER_LLM_ROUTING_ENABLED_INVALID`).
- Variáveis opcionais complementares: `OPENAI_ROUTING_MODEL` (default `OPENAI_CHAT_MODEL` ou `gpt-4o-mini`), `OPENAI_ROUTING_TIMEOUT_MS` (default `4000`, faixa `250–12000`), `OPENAI_ROUTING_MAX_RETRIES` (default `1`, faixa `0–3`), `OPENAI_ROUTING_DAILY_TOKEN_BUDGET` (default `200000`, inteiro positivo). Cada uma lança `<NOME>_INVALID` quando fora da faixa.
- A label `routing` em `luna_worker_messages_total` é bounded: os valores possíveis são exatamente `regex` e `llm`. Em PR 5 todos os incrementos saem com `routing="regex"`; PR 6 introduz `llm` (rota LLM-primário bem-sucedida) e mantém `regex` (fallback determinístico ou flag off/shadow).

### Métricas adicionais (PR 6)

Quando o flag está em `llm` ou `shadow`, o worker emite as seguintes séries novas (todas com cardinalidade limitada — `routing` ∈ {`regex`, `llm`}, `tool` ∈ 18 nomes do router, `outcome` ∈ conjunto finito):

| Pergunta operacional | Sinal | Dimensões permitidas | Observação |
|---|---|---|---|
| Quantas chamadas o router fez e com qual resultado? | `luna_routing_calls_total` | `routing="llm"`, `outcome` ∈ `success`, `unreachable`, `timeout`, `empty_decision`, `schema_invalid`, `ungrounded`, `api_key_missing`, `budget_exceeded`, `flag_off`, `tool_rpc_failed` | `flag_off` e `api_key_missing` não disparam OpenAI; o restante cobre cada caminho do tryRouter |
| Quantos tokens o router consumiu? | `luna_routing_tokens_total` | `routing="llm"` | soma de tokens_in + tokens_out por turno |
| Qual ferramenta o router invocou? | `luna_routing_tool_total` | `tool` ∈ 18 nomes, `outcome` ∈ `success`, `rpc_failed` | cada turno bem-sucedido emite exatamente uma chamada |
| Qual a latência do router? | `luna_routing_call_duration_seconds` | `routing="llm"`, buckets `0.25, 0.5, 1, 2, 4, 6` segundos | histogram; p95 deve ficar abaixo do timeout configurado |
| O router está alcançável? | `luna_openai_ready` | gauge 0/1 | marca 1 quando uma chamada recente terminou sem `unreachable` |

### Razões de fallback (PR 6)

Quando `WORKER_LLM_ROUTING_ENABLED="llm"` e o router recusa ou falha, a cascata regex assume sem retry adicional. As razões determinísticas (esgotam o orçamento sem chamar OpenAI):

- `flag_off` — flag diferente de `llm`. Não incrementa métrica.
- `api_key_missing` — `OPENAI_API_KEY` vazio. Incrementa `luna_routing_calls_total{outcome="api_key_missing"}`.
- `budget_exceeded` — contador in-memory de tokens para o dia BRT atual atinge `OPENAI_ROUTING_DAILY_TOKEN_BUDGET`. Incrementa `luna_routing_calls_total{outcome="budget_exceeded"}` e emite log `routing_budget_exceeded`.

Razões dinâmicas (após a chamada OpenAI):

- `unreachable` — 5xx/429 esgotado após retries, fetch rejeitado.
- `timeout` — AbortError após `OPENAI_ROUTING_TIMEOUT_MS`.
- `empty_decision` / `schema_invalid` — corpo da resposta vazio ou fora do json_schema.
- `ungrounded` — ferramenta fora do allowlist (validação estrutural).
- `tool_rpc_failed` — `executeRouterTool` rejeitou; a cascata regex absorve.

## Alertas de roteamento LLM (PR 7)

Os cinco alertas abaixo estão versionados em `ops/observability/alerts.yml` sob o grupo `luna-routing`. Todos referenciam o runbook `docs/runbooks/llm-routing-incident.md`.

| Alerta | Trigger | Janela | Severidade |
|---|---|---|---|
| `LunaRoutingFallbackHigh` | Razões dinâmicas (`timeout`, `5xx`, `fallback`, `unreachable`, `empty_decision`, `schema_invalid`, `ungrounded`, `budget_exceeded`) superam 10% das chamadas do router. | 5 min | warning |
| `LunaRoutingLatencyHigh` | p95 de `luna_routing_call_duration_seconds` acima de 4s. | 10 min | warning |
| `LunaRoutingShadowDrift` | Divergência entre decisão LLM e regex acima de 20% das observações de shadow. | 30 min | info |
| `LunaRoutingBudgetExhausted` | `increase(luna_routing_tokens_total[1h])` ultrapassa 120% do orçamento horário (`200000 / 24 * 1.2`). | 30 min | info |
| `LunaRoutingDeadLetterSpike` | Dead-letters da inbox (`>5` em 10min) **e** taxa de fallback do router acima de 0.2/s. | 10 min | critical |

## Dashboards

| UID | Arquivo | Painéis | Função |
|---|---|---|---|
| `luna-operations` | `ops/observability/dashboards/luna-operations.json` | 7 | Operação agregada (web, worker, filas, dead-letters). |
| `luna-routing` | `ops/observability/dashboards/luna-routing.json` | 6 | Roteamento LLM: routing mix, fallback rate, tool latency p95, disagreement rate, daily token spend, dead-letter correlation. |

O dashboard `luna-routing` é a fonte primária durante incidentes do router. Ele não contém telefone, payload, correlation ID ou qualquer PII — apenas séries agregadas por `routing`, `tool`, `outcome`.

## Runbooks

| Cenário | Runbook |
|---|---|
| Incidente geral de mensageria ou worker indisponível | `docs/runbooks/incident-response.md` |
| Falha ou degradação do router LLM | `docs/runbooks/llm-routing-incident.md` |
| Deploy / rollback operacional | `docs/runbooks/deploy-easypanel.md`, `docs/runbooks/deploy-vps-docker.md` |
| Restauração LGPD | `docs/runbooks/backup-restore-lgpd.md` |
| Painel interno | `docs/runbooks/painel-interno.md` |
