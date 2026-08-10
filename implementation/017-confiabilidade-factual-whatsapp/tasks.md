# Tarefas

- [x] **T-1701:** Tornar a resolução de planos inequívoca e fail-closed.
  - **Cobre:** RF-014
  - **Valida:** CA-012, CA-1701
  - **Testes:** CT-1701
  - **Arquivos esperados:** `src/domain/knowledge/service.ts`, `tests/unit/messaging.test.ts`
  - **Dependências:** nenhuma
  - **Risco:** critical
  - **Critério de conclusão:** correspondência com múltiplos planos retorna `ambiguous`; somente correspondência única ativa retorna `accepted`.

- [x] **T-1702:** Criar o contrato e o resolvedor de fatos verificados por mensagem.
  - **Cobre:** RF-013, RF-014
  - **Valida:** CA-1702, CA-1703, CA-1704
  - **Testes:** CT-1702
  - **Arquivos esperados:** `src/domain/knowledge/verified-facts.ts`, `src/domain/knowledge/service.ts`, testes unitários focados
  - **Dependências:** T-1701
  - **Risco:** critical
  - **Critério de conclusão:** o resolvedor diferencia plano/procedimento/cobertura positiva, negativa, ausente e ambígua usando apenas registros ativos do banco.

- [x] **T-1703:** Implementar respostas críticas determinísticas e fallback humano seguro.
  - **Cobre:** RF-014, RF-015
  - **Valida:** CA-1702, CA-1703, CA-1704
  - **Testes:** CT-1703
  - **Arquivos esperados:** `src/domain/messaging/templates.ts`, `worker/index.ts`, `tests/unit/messaging.test.ts`
  - **Dependências:** T-1702
  - **Risco:** critical
  - **Critério de conclusão:** nenhuma resposta positiva de plano/cobertura/preço é enviada sem fato suficiente; ausência ou conflito usa mensagem segura e handoff idempotente quando aplicável.

- [x] **T-1704:** Reduzir o contexto do LLM e impedir que histórico textual livre seja fonte factual.
  - **Cobre:** RF-013, RF-014
  - **Valida:** CA-1705
  - **Testes:** CT-1704
  - **Arquivos esperados:** `src/integrations/openai/chat.ts`, `worker/index.ts`, testes de contrato OpenAI
  - **Dependências:** T-1702
  - **Risco:** high
  - **Critério de conclusão:** o request OpenAI contém apenas mensagem atual, fatos verificados e contexto estruturado mínimo, sem mensagens anteriores brutas.

- [x] **T-1705:** Adicionar grounding em código antes do envio de resposta gerada.
  - **Cobre:** RF-013, RF-014, RF-015
  - **Valida:** CA-1703, CA-1706, CA-1709
  - **Testes:** CT-1705
  - **Arquivos esperados:** `src/integrations/openai/grounding.ts`, `src/integrations/openai/chat.ts`, testes unitários focados
  - **Dependências:** T-1702, T-1704
  - **Risco:** critical
  - **Critério de conclusão:** saída não fundamentada é bloqueada antes da Evolution e substituída por fallback seguro; saída válida preserva naturalidade sem alterar fatos.

- [x] **T-1706:** Registrar rota factual e resultado da validação de forma sanitizada.
  - **Cobre:** RNF-007
  - **Valida:** CA-1708
  - **Testes:** CT-1706
  - **Arquivos esperados:** `worker/index.ts`, `src/lib/observability/logger.ts`, testes de observabilidade
  - **Dependências:** T-1703, T-1705
  - **Risco:** high
  - **Critério de conclusão:** intenção, tipo de fato, fonte, resultado de grounding, fallback/handoff e erro são reconstruíveis sem resposta sensível, telefone, payload ou secret.

- [x] **T-1707:** Validar conectividade real da instância Evolution no readiness.
  - **Cobre:** RF-015, RNF-007
  - **Valida:** CA-1707, CA-1709
  - **Testes:** CT-1707
  - **Arquivos esperados:** `src/integrations/evolution/client.ts`, `src/app/api/health/ready/route.ts`, testes de readiness/adapter
  - **Dependências:** nenhuma
  - **Risco:** critical
  - **Critério de conclusão:** instância ausente, fechada, não autorizada ou indisponível produz readiness 503 sem envio; somente instância configurada e `open` é considerada pronta.

- [x] **T-1708:** Consolidar regressão, documentação e evidências para homologação.
  - **Cobre:** RF-013, RF-014, RF-015, RNF-007
  - **Valida:** CA-011, CA-012, CA-1701–CA-1709
  - **Testes:** CT-1708
  - **Arquivos esperados:** `worker/README.md`, `.env.example`, documentação operacional, `implementation/017-confiabilidade-factual-whatsapp/validation.md`
  - **Dependências:** T-1701–T-1707
  - **Risco:** high
  - **Critério de conclusão:** validações locais passam, limitações externas estão explícitas e existe checklist separado para corrigir configuração e realizar smoke autorizado sem registrar secrets.

## Matriz de rastreabilidade

| Requisito | Critérios | Tarefas | Evidência planejada |
|---|---|---|---|
| RF-013 | CA-1705, CA-1706 | T-1702, T-1704, T-1705, T-1708 | CT-1702, CT-1704, CT-1705, CT-1708 |
| RF-014 | CA-012, CA-1701–CA-1706 | T-1701–T-1705, T-1708 | CT-1701–CT-1705, CT-1708 |
| RF-015 | CA-1703, CA-1704, CA-1706, CA-1707 | T-1703, T-1705, T-1707, T-1708 | CT-1703, CT-1705, CT-1707, CT-1708 |
| RNF-007 | CA-1707, CA-1708 | T-1706–T-1708 | CT-1706–CT-1708 |
| CA-011 | Preservação do limite do bot | T-1708 | CT-1708 |
| CA-1709 | Casos adversariais | T-1705, T-1707, T-1708 | CT-1705, CT-1707, CT-1708 |
