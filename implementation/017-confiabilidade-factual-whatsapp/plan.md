# Plano

## Estratégia

Reforçar o fluxo existente sem reconstruí-lo. O worker continuará classificando e roteando mensagens de forma determinística. Uma nova camada de fatos verificados resolverá exatamente os registros necessários para a mensagem atual e retornará um contrato discriminado, incluindo ausência, ambiguidade, cobertura positiva/negativa e necessidade de fallback.

Planos, procedimentos, coberturas, preços e resultados de ações serão tratados como fatos críticos. Para esses fatos, respostas determinísticas são preferidas; o LLM só poderá redigir quando receber um conjunto explícito e suficiente de fatos e sua saída passar pela validação em código.

O readiness da Evolution deixará de considerar apenas URL/key/instância preenchidas e consultará a instância configurada sem enviar mensagens.

## Arquivos previstos

- `src/domain/knowledge/service.ts`: resolução inequívoca de planos/procedimentos e contratos de ausência/ambiguidade.
- `src/domain/knowledge/verified-facts.ts`: montagem direcionada de fatos oficiais, incluindo `procedure_coverage`.
- `src/domain/messaging/intent.ts`: interpretação estruturada mínima necessária ao roteamento, sem delegar ações ao LLM.
- `src/domain/messaging/templates.ts`: respostas críticas e fallback seguro determinísticos.
- `src/integrations/openai/chat.ts`: prompt menor, entrada baseada em fatos verificados e contexto estruturado.
- `src/integrations/openai/grounding.ts`: validação em código da resposta gerada.
- `src/integrations/evolution/client.ts`: leitura normalizada do estado real da instância.
- `src/app/api/health/ready/route.ts`: readiness real da Evolution.
- `worker/index.ts`: roteamento por fatos verificados, bloqueio/fallback e observabilidade.
- `tests/unit/messaging.test.ts`, `tests/unit/observability.test.ts` e testes focados novos de grounding/readiness.
- `worker/README.md`, `.env.example` e documentação operacional diretamente afetada.
- `implementation/017-confiabilidade-factual-whatsapp/validation.md`: evidências produzidas durante a execução.

Nenhuma migration é prevista inicialmente, pois `procedure_coverage`, planos, aliases, procedimentos, inbox, handoff e auditoria já existem. Se a implementação demonstrar necessidade de schema novo, o contrato deverá voltar ao planner e exigir aprovação específica antes da migration.

## Sequência reversível

1. Tornar a resolução de plano fail-closed e cobrir ambiguidade com testes.
2. Introduzir o contrato de fatos verificados e consulta de cobertura sem alterar o envio atual.
3. Adicionar templates críticos e fallback/handoff seguro.
4. Reduzir o contexto do LLM e adicionar grounding em código.
5. Conectar o worker ao novo contrato e registrar resultados sanitizados.
6. Implementar readiness real da Evolution.
7. Executar testes adversariais, suíte relevante e atualizar documentação.

Cada etapa deve permanecer pequena e testável. O rollback de aplicação pode restaurar o roteamento anterior sem perda de dados, pois não há remoção ou reinterpretação de schema prevista.

## Testes e validações

- Unitários de resolução: alias exato, nome canônico, abreviação inequívoca, dois candidatos, plano inativo e plano ausente.
- Unitários de fatos: plano, procedimento, cobertura positiva, negativa, ausente e conflitante.
- Unitários de grounding: URL inventada, plano/procedimento não verificado, afirmação positiva sem cobertura e saída válida.
- Worker: fallback/handoff idempotente, perguntas de preço, contexto sem mensagens anteriores, preservação dos fluxos de agenda e confirmação.
- Evolution: instância encontrada/open, ausente, close, resposta 401/404/5xx e timeout.
- Observabilidade: decisão reconstruível e ausência de PII/secrets.
- Regressão: `pnpm typecheck`, testes focados, `pnpm test`, `pnpm lint`, `pnpm worker:check`, `pnpm security:scan` e build quando o ambiente permitir.
- Homologação externa posterior: readiness contra a instância aprovada e envio controlado em sandbox, mediante autorização separada.

## Rollback

- Reverter o uso da camada de fatos verificados e restaurar o roteamento anterior em uma revisão de aplicação.
- Manter dados e logs já existentes; nenhuma exclusão é necessária.
- Em caso de incompatibilidade da Evolution, marcar readiness como indisponível e manter o worker pausado em vez de enviar por uma instância não confirmada.
- Não alterar automaticamente o nome de instância ou secrets durante rollback.

## Aprovações necessárias

- Aprovação explícita de `spec.md` antes de qualquer alteração em código.
- Aprovação adicional se surgir migration, nova dependência, mudança de secrets ou custo externo.
- Aprovação separada para corrigir `EVOLUTION_INSTANCE`, criar `METRICS_TOKEN`, aplicar deploy, promover worker ou enviar WhatsApp real.
