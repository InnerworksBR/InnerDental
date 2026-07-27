# Plano

## Estratégia

Modelar máquina de estados e casos de uso idempotentes. Registrar intenção antes da chamada externa, reconciliar resultados ambíguos e enfileirar notificações pela outbox.

## Arquivos previstos

`src/domain/appointments/`, `src/app/api/appointments/`, adapter Calendar ampliado, repositories, migrations e testes.

## Sequência reversível

Estados/repositório → listagem reconciliada → criação → remarcação → cancelamento → reconciliação/auditoria.

## Testes e validações

Unitários de estados; integração com PostgreSQL/Calendar fake; concorrência; timeouts ambíguos; contratos HTTP; autorização horizontal.

## Rollback

Feature flags por operação; reconciliação de pendências; nenhuma reversão automática que apague evento confirmado.

## Aprovações necessárias

Aprovar `spec.md`, política de cancelamento, semântica de exclusão/cancelamento no Calendar e estratégia de reconciliação.
