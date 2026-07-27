# Plano

## Estratégia

1. Completar instrumentação de latência, resultado e dependências com labels limitadas.
2. Preservar e propagar correlation ID pelos fluxos assíncronos.
3. Versionar configuração de coleta privada e dashboards mínimos.
4. Versionar regras de alerta ligadas aos runbooks.
5. Automatizar validação de sintaxe, redaction e ausência de PII.

## Arquivos previstos

- `src/lib/observability/metrics.ts`, `src/lib/observability/logger.ts`, `src/proxy.ts`
- `worker/index.ts`, migration/adaptação prevista em 011
- `ops/observability/prometheus.yml`, `ops/observability/alerts.yml`
- `ops/observability/dashboards/*.json`, `compose.yaml`
- `tests/unit/observability.test.ts`, novos testes de configuração
- `docs/operations/observability.md`, `docs/runbooks/incident-response.md`

## Sequência reversível

1. Adicionar métricas e correlação sem remover sinais atuais.
2. Adicionar arquivos de coleta/dashboard como perfil opcional.
3. Adicionar alertas inicialmente inativos fora de homologação.
4. Documentar limites e operação.

## Testes e validações

- Unitários de métricas, histograma, labels, correlation ID e sanitização.
- Validação de configuração Prometheus e regras de alerta em container/CLI fixado.
- Testes que procuram PII e secrets nos artefatos de observabilidade.
- Suíte completa e smoke local de scrape autenticado.

## Rollback

Desabilitar o perfil de coleta e voltar ao digest anterior; endpoints autenticados e logs JSON existentes continuam funcionais.

## Aprovações necessárias

- Aprovação desta especificação antes de código.
- Aprovação separada para destino externo, retenção, destinatários de alerta e recursos de produção.
