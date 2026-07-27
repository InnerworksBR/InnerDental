# Plano

## Estratégia

Instrumentar antes do deploy, automatizar gates no CI, endurecer configuração, criar ambiente de homologação e executar matriz de aceite com doubles/sandboxes e smoke controlado.

## Arquivos previstos

Logging/metrics/health, `Dockerfile`, compose de desenvolvimento, configuração EasyPanel, pipeline CI, runbooks, scripts seguros e testes E2E.

## Sequência reversível

Observabilidade → segurança → CI → imagem → backup/LGPD → homologação → aceite → prontidão de produção.

## Testes e validações

SAST/dependency scan, secret scan, RLS/auth, carga, falhas injetadas, restore, E2E mobile, smoke e rollback ensaiado.

## Rollback

Imagem anterior imutável, migrations compensatórias aprovadas, feature flags e runbook; nunca usar rollback destrutivo automático de banco.

## Aprovações necessárias

Aprovar `spec.md`, infraestrutura, domínio, RPO/RTO, retenção, alertas e autorização separada antes de qualquer produção.
