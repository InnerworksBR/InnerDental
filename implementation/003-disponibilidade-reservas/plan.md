# Plano

## Estratégia

Criar núcleo puro de intervalos, encapsular Google Calendar atrás de porta testável e usar constraint/índice parcial no PostgreSQL para exclusividade de holds ativos.

## Arquivos previstos

`src/domain/availability/`, `src/integrations/google-calendar/`, `src/app/api/availability/`, `src/app/api/slot-holds/`, migrations e testes.

## Sequência reversível

Intervalos → regras/exceções → adapter Calendar → agregação → holds → APIs → carga/falhas.

## Testes e validações

Unitários com limites e timezone; integração com respostas Calendar gravadas; concorrência real no PostgreSQL; contrato HTTP; medição p95.

## Rollback

Desabilitar endpoint por feature flag; expirar holds; revogar credencial Google sem apagar regras.

## Aprovações necessárias

Aprovar `spec.md`, autenticação Google, calendário(s), tratamento de all-day, TTL do hold e carga-alvo.
