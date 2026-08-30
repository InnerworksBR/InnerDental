# LLM Routing — Guia de Rollout

## Status atual

PR 7 entregou **executors reais** para todas as 18 tools do router LLM. Cada tool agora chama os RPCs Supabase corretos ou lê knowledge diretamente, em vez de devolver `__stub__:<name>`. O worker também:

- Lê `whatsapp_conversation_slots` reais antes de chamar o router (`readConversationSlots`).
- Aplica `slotWrites` retornado pelo executor via `apply_whatsapp_conversation_slots` (necessário para `ask_plan` e `ask_procedure`).
- Limpa slots antes do `enqueue_human_handoff` via `clear_whatsapp_conversation_slots`.
- Marca `accept_whatsapp_plan_triage` com a assinatura da migration 027 (com `p_answer_inbox_id`).
- Encaminha `inboxAccessLink` do executor para o worker chamar `mark_whatsapp_access_link_delivered` (necessário para `request_scheduling_link`, `accept_plan`, `confirm_attendance`, `lookup_upcoming_appointment` e `answer_procedure` quando `online_booking=true`).

O fallback automático do worker para o regex cascade **continua funcionando**: qualquer falha do LLM (timeout, schema inválido, RPC quebrado, falta de API key) faz o `tryRouter` devolver `regex_fallback` e o `processInbox` roda `runRegexCascade` inalterado. Métricas `luna_routing_calls_total{outcome}` continuam incrementando.

## Pré-requisitos para ligar

Antes de mudar `LLM_ROUTING_MODE`, o `.env` precisa ter:

- `OPENAI_API_KEY` (já existe).
- `OPENAI_CHAT_MODEL` (já existe; pode ser o mesmo `gpt-4o-mini`).
- `LLM_ROUTING_MODE` — **ainda não definido** (mantém o caminho regex ativo).

Variáveis opcionais:

- `OPENAI_ROUTING_MODEL` — modelo dedicado para o router. Default é o mesmo `OPENAI_CHAT_MODEL`.
- `OPENAI_ROUTING_TIMEOUT_MS` — timeout por chamada. Default 4000.
- `OPENAI_ROUTING_MAX_RETRIES` — retries além do primeiro. Default 1.
- `OPENAI_ROUTING_DAILY_TOKEN_BUDGET` — limite diário em tokens. Default 200000. Reset à meia-noite BRT.

## Plano de rollout recomendado

### Passo 1 — Shadow mode (recomendado começar aqui)

```bash
LLM_ROUTING_MODE=shadow
```

Comportamento:
- O LLM observa cada mensagem e registra qual tool **teria** escolhido.
- O paciente continua recebendo a resposta do regex cascade.
- Métricas: `luna_routing_shadow_total{tool, outcome}` e `luna_routing_disagreement_total{regex_tool, llm_tool}` sobem.
- Risco para o paciente: zero.

Por 5-10 dias, acompanhar:
- `luna_routing_disagreement_total` — divergências entre regex e LLM.
- `luna_routing_shadow_total{outcome="ungrounded"}` — tools fora do allowlist (raro; indica prompt injection ou modelo desatualizado).
- Distribuição de `tool` mais frequente — confirma que o LLM está raciocinando nos mesmos domínios do regex.

### Passo 2 — LLM-primary

```bash
LLM_ROUTING_MODE=llm
```

Comportamento:
- O LLM decide; o executor real roda.
- Falha do LLM → regex cascade (fallback automático).

Observar:
- `luna_routing_calls_total{outcome="success"}` vs `{outcome="unreachable"|"timeout"|"schema_invalid"|"tool_rpc_failed"}` — taxa de fallback deve ficar <5%.
- `luna_routing_tool_total{outcome="rpc_failed"}` — alguma tool quebrada isoladamente.
- `luna_openai_ready` — gauge deve estar em 1 quando o LLM responde.
- `luna_routing_tokens_total` — custo diário. Se ultrapassar o budget, o worker cai para regex automaticamente.

### Passo 3 — Rollback de emergência

```bash
LLM_ROUTING_MODE=regex_only
```

O LLM é totalmente bypassado (sem shadow também). Útil quando OpenAI está fora do ar.

## Métricas para acompanhar

Todas já existem no `luna_worker_messages_total` e família `luna_routing_*`. Veja [docs/operations/observability.md](observability.md) para a lista completa.

Pontos críticos:

| Métrica | Quando alertar |
|---------|---------------|
| `luna_routing_calls_total{outcome="timeout"}` crescente | LLM lento — ajustar `OPENAI_ROUTING_TIMEOUT_MS` |
| `luna_routing_tool_total{outcome="rpc_failed"}` não-zero | Tool com bug — verificar logs `routing_tool_failed` |
| `luna_routing_disagreement_total` alta taxa | Regex e LLM discordando muito — investigar mensagens divergentes |
| `luna_routing_tokens_total` alto | Custo OpenAI — apertar prompt, considerar modelo menor |

## O que **não** foi alterado

- **Templates** em [src/domain/messaging/templates.ts](../../src/domain/messaging/templates.ts) — os reescritos no PR anterior (microcopy acolhedor, fallback inteligente) permanecem.
- **Regex cascade** — `runRegexCascade` é o fallback e não mudou.
- **Plan triage** — `preparePlanTriage` continua rodando antes do LLM. Se o LLM escolher `accept_plan`, o RPC é chamado pelo executor com a assinatura correta.
- **Shadow/observability** — `recordDisagreement` e `shadowRoute` continuam intactos.

## Testes adicionados

- [tests/unit/router-tools.test.ts](../../tests/unit/router-tools.test.ts) — 35 testes cobrindo todos os 18 executors com mocks de Supabase/knowledge/Evolution.
- [tests/unit/whatsapp-routing-definitivo.test.ts](../../tests/unit/whatsapp-routing-definitivo.test.ts) — atualizados os testes E2E que esperavam `__stub__:foo` para esperar a resposta real.

## Próximos passos (fora do escopo desta PR)

- Coletar divergências reais do shadow mode para ajustar prompts de tools.
- Adicionar mais tools se necessário (ex.: `transfer_to_human` específico para casos sensíveis).
- Avaliar custo por conversa para decidir se vale a pena manter o LLM em horário comercial vs. fora.