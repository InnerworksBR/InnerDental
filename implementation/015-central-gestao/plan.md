# Plano

## Estratégia

1. Preparar desativação lógica aditiva para aliases/exceções e atualizar consumidores.
2. Criar contratos discriminados e serviço server-only com snapshot, validações cruzadas e auditoria.
3. Expor API interna protegida e integrar hub à aba Gestão.
4. Implementar editores por domínio e visão de auditoria.
5. Cobrir autorização, schemas, regras de conflito, projeções e jornada E2E.

## Arquivos previstos

- `supabase/migrations/202607270014_management_soft_deactivation.sql`
- `src/domain/admin/management.ts`
- `src/lib/admin/management.ts`
- `src/app/api/admin/management/route.ts`
- `src/components/admin-management.tsx`, `admin-console.tsx`, `src/app/globals.css`
- `src/lib/availability/repository.ts`, `worker/index.ts`
- `tests/unit/`, `tests/e2e/portal.spec.ts`
- documentação da implementação 015 e arquitetura/PRD.

## Riscos e validações

- Migration e convite são gates externos; somente código/migration local serão produzidos.
- Aliases exigem normalização consistente e cobertura de colisões.
- Agenda exige validação de horário, sobreposição e dia da semana.
- Validar unitários, E2E mobile/desktop, tipos, lint, scan de secrets, migration preflight e build.
