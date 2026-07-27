# Plano

## Estratégia

Criar primeiro a fronteira de identidade interna e as tabelas aditivas, depois os serviços e APIs protegidos. Reutilizar a agenda, Calendar, auditoria, inbox/outbox e correlation IDs existentes. Construir a UI somente sobre contratos administrativos estáveis; validar Calendar all-day em sandbox antes de habilitar a ação.

## Arquivos previstos

`supabase/migrations/`, políticas RLS, módulos de auth/admin/incidents, adapter Calendar, rotas `src/app/api/admin/`, páginas `src/app/interno/`, testes unitários/integração/E2E, `.env.example`, documentação e runbook.

## Sequência reversível

Schema/RLS → guard e convite → leituras operacionais → incidentes → ações sobre consultas → bloqueio all-day → APIs → UI → testes/E2E → rollout controlado.

## Testes e validações

Unitários de papéis, mascaramento, filtros, incidentes, idempotência e payload all-day; integração de RLS e APIs; Calendar sandbox para criação/falha parcial; E2E para login, agenda, busca, incidente e bloqueio; typecheck, lint, build e revisão de segredo/PII.

## Rollback

Desabilitar rotas/menu interno por feature flag; revogar perfil interno; preservar auditoria, incidentes e eventos externos. Migrations só possuem rollback compensatório revisado; eventos Calendar não são removidos automaticamente em falha parcial.

## Aprovações necessárias

Executar código requer aprovação explícita deste `spec.md`. Aplicar migration remota, criar o primeiro proprietário, enviar convite Supabase Auth, configurar e-mail/Auth e chamar Calendar sandbox/produção requerem autorizações operacionais específicas.
