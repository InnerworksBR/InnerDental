# Remodelação do Agente WhatsApp — Status

## Contexto

O projeto anterior tinha um agente LLM que tomava decisões operacionais críticas
(escolher horário, decidir se plano era aceito, criar consultas). Esse modelo
gerava erros operacionais — o próprio PRD.md lista:

- informar que não havia horários quando havia
- oferecer horários ocupados
- informar incorretamente sobre planos não aceitos
- criar conflitos de agenda
- responder com informações não confirmadas

A remodelação separa **decisão** (código) de **interpretação** (LLM).

## Arquitetura nova

```
Paciente envia mensagem
         │
         ▼
┌─────────────────────────────────────┐
│ 1. parseIntent()                    │  ← única chamada LLM
│    Devolve JSON validado por Zod:   │
│    { intent, slots, sentiment,      │
│      needs_human, confidence }      │
└──────────────┬──────────────────────┘
               │ JSON tipado
               ▼
┌─────────────────────────────────────┐
│ 2. resolveHintsAgainstKnowledge()   │  ← código puro
│    Converte hints textuais em IDs   │
│    validados contra verified-facts  │
└──────────────┬──────────────────────┘
               │ Estado validado
               ▼
┌─────────────────────────────────────┐
│ 3. decide()                         │  ← máquina de estados pura
│    Decide ação:                     │
│    - send_text / send_interactive   │
│    - ask_qualification_slot         │
│    - qualification_complete         │
│    - escalate_to_human              │
└──────────────┬──────────────────────┘
               │ Action tipada
               ▼
┌─────────────────────────────────────┐
│ 4. actionToOperations()             │  ← adapter
│    Traduz Action em operações pro   │
│    worker executar                  │
└─────────────────────────────────────┘
```

## Arquivos criados

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/domain/messaging/intent-parser.ts` | Única chamada LLM. Devolve JSON com intent + slots + sentiment. |
| `src/domain/messaging/decisor.ts` | Máquina de estados pura. Decide ação com base em regras. |
| `src/domain/messaging/qualification-templates.ts` | Templates textuais do novo fluxo. |
| `src/domain/messaging/orchestrator.ts` | Conecta parser + decisor. Função `orchestrate()`. |
| `src/domain/messaging/worker-adapter.ts` | Traduz Action em operações pro worker. |
| `tests/messaging/run-flow-tests.ts` | 15 cenários reais de clínica dental. |

## As 6 intenções (em vez das 18 ferramentas antigas)

| Intent | Decisor faz |
|--------|-------------|
| `saudacao` | Envia menu de opções |
| `faq` | Consulta verified-facts; responde ou fallback |
| `plano` | Verifica se aceita; rejeita ou lista |
| `procedimento` | Verifica se faz; lista se não achou |
| `agendar` | Inicia qualificação (4 campos) |
| `humano` ou `needs_human` | Escala pro humano |

## Qualificação de 4 campos

Para agendar, o agente coleta:

1. **nome** — nome completo
2. **procedimento** — com resolução contra knowledge.procedures
3. **plano** — com resolução contra knowledge.plans (ou particular)
4. **para_quem** — pra ela mesma ou outra pessoa

Quando os 4 estão preenchidos, dispara handoff estruturado pra doutora.

## Handoff

Mensagem enviada **no WhatsApp da doutora** (configurado em `HANDOFF_NOTIFICATION_PHONE`):

```
🔔 Novo paciente quer agendar

Nome: Maria Silva
Procedimento: Limpeza
Plano: Unimed
Para: Paciente
Telefone: +55 (11) 98765-4321

Toque no número acima pra abrir a conversa no WhatsApp.
```

Paciente recebe ack:

```
Perfeito, anotado! ✅
Vou passar seu pedido pra equipe da Dra. Priscila agora.
```

## Resultados dos testes

```
✓ Cenário 1: Saudação → envia menu
✓ Cenário 2: FAQ sobre endereço → responde com FAQ verificada
✓ Cenário 3: Plano aceito (Unimed) → confirma
✓ Cenário 4: Procedimento (clareamento) → responde
✓ Cenário 4b: Procedimento inexistente (implante) → mostra lista
✓ Cenário 5a: Agendamento → pede nome
✓ Cenário 5b: Após nome → pede procedimento
✓ Cenário 5c: Qualificação completa → qualification_complete
✓ Cenário 5d: Falta para_quem → pergunta
✓ Cenário 6: Paciente irritado → escala
✓ Cenário 7: Pedido explícito de humano → escala
✓ Cenário 8: Urgência médica → escala
✓ Cenário 9: Resolução de hints (plano/procedimento)
✓ Cenário 10: Mudança de assunto no meio da qualificação

Resultados: 15 passou, 0 falhou
```

## O que NÃO foi tocado (e não deve ser)

- `src/app/agenda/` — link de agendamento (já funciona)
- `src/app/interno/` — painel admin (já funciona)
- `src/integrations/evolution/` — integração WhatsApp
- `src/domain/knowledge/` — verified-facts (reaproveitado)
- `src/domain/messaging/templates.ts` — templates base (reaproveitado)
- `worker/index.ts` — outbox, dedupe, retries, handoff infra

## Próximos passos

1. **Migrar o worker** pra chamar `orchestrate()` em vez de `routeWithTools()`.
   Esse é o passo mais delicado — mexer no pipeline de mensagens.
2. **Criar migration** pra tabela nova `whatsapp_qualification_state`
   (substituindo `whatsapp_conversation_slots`).
3. **Deletar código legado**:
   - `src/domain/messaging/router-tools.ts` (648 linhas)
   - `src/domain/messaging/router-legacy-cascade.ts`
   - `src/domain/messaging/intent.legacy.ts`
   - `src/integrations/openai/conversation-classifier.ts`
4. **Modo shadow por 1 semana** comparando orquestrador novo com regex antigo.
5. **Remover modo shadow** quando confiança estiver alta.

## Como rodar os testes

```bash
# Ambiente Linux/macOS com Node 22+
node --experimental-strip-types --no-warnings tests/messaging/run-flow-tests.ts

# Ambiente com tsx instalado
./node_modules/.bin/tsx tests/messaging/run-flow-tests.ts
```

## Etapa 4 — Remoção do código legado (após validação em produção)

Após 7 dias rodando com `LUNA_USE_NEW_FLOW=true` e zero incidentes, executar:

```bash
# 1. Deletar arquivos legados (fluxo antigo)
rm src/domain/messaging/router-tools.ts       # 648 linhas
rm src/domain/messaging/router-legacy-cascade.ts
rm src/domain/messaging/intent.legacy.ts
rm src/integrations/openai/conversation-classifier.ts

# 2. Remover imports do worker (worker/index.ts):
#    - import classifyIntent de intent.legacy
#    - import routeWithTools, executeRouterTool, router-tools

# 3. Remover do .env / .env.example:
#    - LUNA_USE_NEW_FLOW (mudar para default true)
#    - LUNA_SHADOW_NEW_FLOW (remover)

# 4. Remover rota /api/whatsapp/shadow se existir

# 5. Commit
git add -u && git commit -m "refactor(whatsapp): etapa4 - remover código legado
- Deleta router-tools.ts, router-legacy-cascade.ts, intent.legacy.ts,
  conversation-classifier.ts
- Remove imports do worker
- Remove flags de transição LUNA_USE_NEW_FLOW e LUNA_SHADOW_NEW_FLOW
- Limpa .env e .env.example"
```
