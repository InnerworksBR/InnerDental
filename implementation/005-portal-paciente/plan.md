# Plano

## Estratégia

Construir shell e componentes acessíveis, depois jornadas verticais ligadas às APIs, mantendo estado sensível no servidor e confirmação explícita.

## Arquivos previstos

`src/app/acesso/`, `src/app/agenda/`, `src/components/`, `src/features/`, estilos e testes E2E/acessibilidade.

## Sequência reversível

Design base → acesso → início → marcação → listagem → remarcação/cancelamento → erros/a11y.

## Testes e validações

Componentes, Playwright mobile/desktop, teclado, axe, dupla submissão, expiração e contratos simulados.

## Rollback

Feature flags por jornada e manutenção de endpoint de acesso seguro.

## Aprovações necessárias

Aprovar `spec.md`, identidade visual/nome final, comportamento de dias lotados e textos finais.
