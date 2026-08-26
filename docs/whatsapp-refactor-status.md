# Status da Execução — Plano Refatoração WhatsApp

## Decisões

- **Plano**: 8 PRs sequenciais com paralelização interna
- **Default pós-PR7**: LLM ativo
- **Orquestração**: CronCreate com agents em background
- **Branch**: main (commits granulares)

## Cadeia de PRs

```
PR1 [A] Foundation: slots + RPCs        → bloqueia PR6
PR2 [B] OpenAI routeWithTools            → bloqueia PR4, PR6
PR3 [C] Tool registry + executor         → bloqueia PR4, PR6
PR4 [D] Shadow mode                      → depende de PR2+PR3
PR5 [E] Feature flag + label             → depende de PR2; bloqueia PR6
PR6 [F] LLM-primary + fallback no worker → depende de PR1+PR2+PR3+PR5
PR7 [G] Prod flip + dashboards/alerts    → depende de PR6
PR8 [H] Deprecate legacy                 → depende de PR7 (após 7 dias prod)
```

## Cronograma de agendamento (CronCreate)

| PR | Agent | Cron | Dependência |
|----|-------|------|-------------|
| PR 1 | Agent A | imediatamente (background) | nenhuma |
| PR 2 | Agent B | imediatamente (background) | nenhuma |
| PR 3 | Agent C | imediatamente (background) | nenhuma |
| PR 4 | Agent D | após PR2+PR3 | PR2+PR3 |
| PR 5 | Agent E | após PR2 | PR2 |
| PR 6 | Agent F | após PR1+PR5 | PR1+PR5 |
| PR 7 | Agent G | após PR6 | PR6 |
| PR 8 | Agent H | após PR7 (≥7 dias) | PR7 |

## Critérios de aceitação por PR

### PR 1 (foundation)
- [ ] `src/domain/messaging/slots.ts` criado
- [ ] `src/integrations/openai/router-types.ts` criado (tipos básicos)
- [ ] `supabase/migrations/202608140030_whatsapp_conversation_slots.sql` aplicado
- [ ] `tests/unit/whatsapp-conversation-slots.test.ts` verde
- [ ] 246 testes existentes continuam verdes
- [ ] `pnpm lint && pnpm typecheck && pnpm build && pnpm migration:check` verde

### PR 2 (routeWithTools)
- [ ] `routeWithTools()` em `src/integrations/openai/chat.ts`
- [ ] `validateRouterDecision()` em `src/integrations/openai/grounding.ts`
- [ ] `tests/unit/openai-router.test.ts` verde
- [ ] `generateClinicReply` intacto

### PR 3 (router-tools)
- [ ] `src/domain/messaging/router-tools.ts` criado
- [ ] `tests/unit/router-tools.test.ts` verde

### PR 4 (shadow)
- [ ] `shadowRoute()` em worker
- [ ] Métricas `luna_routing_shadow_total` e `luna_routing_disagreement_total` aparecem

### PR 5 (flag)
- [ ] `Config.llmRouting` em worker
- [ ] Novos env vars documentados
- [ ] CI verde com flag off

### PR 6 (worker integration)
- [ ] `processInbox` reescrito com router+fallback
- [ ] 8 novos testes passam
- [ ] 246+8 verdes
- [ ] Métricas novas aparecem

### PR 7 (prod flip)
- [ ] Dashboard `luna-routing.json` criado
- [ ] 5 alertas adicionados
- [ ] Runbook criado

### PR 8 (deprecate)
- [ ] `intent.ts` → `intent.legacy.ts`
- [ ] `router-legacy-cascade.ts` criado
- [ ] `legacy-intent-cascade.test.ts` verde

## Comandos de verificação

```bash
# Após cada PR
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm migration:check
pnpm observability:validate
```

## URL do plano

`C:\Users\CristianPaxur\.claude\plans\velvet-hopping-raven.md`