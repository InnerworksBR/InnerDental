# Validação

## T-001 — Normalização de telefone

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`src/lib/phone/normalize.ts` e `tests/unit/phone-normalize.test.ts`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RF-007 | CA-201 | normalização sem exposição de telefone em URL | aprovado |

### Comandos e resultados

- `pnpm test -- tests/unit/phone-normalize.test.ts`: exit code 0; 11 vetores válidos e inválidos aprovados.

### Limitações

- O MVP aceita apenas números brasileiros completos; números internacionais exigirão decisão e regras próprias.

## T-002 — Token opaco de acesso

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`supabase/migrations/202607160004_access_token_consumption.sql`, `src/lib/auth/access-token.ts`, `src/lib/auth/access-token-repository.ts`, `tests/unit/access-token.test.ts`, `tests/mocks/server-only.ts`, `vitest.config.ts`, `package.json` e `pnpm-lock.yaml`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RF-008 | CA-201, CA-202 | hash SHA-256, TTL e consumo atômico | aprovado |

### Comandos e resultados

- `pnpm test -- tests/unit/access-token.test.ts`: exit code 0; geração, hash e TTL validados.
- Aplicação das migrations em PostgreSQL 17 descartável: exit code 0.
- Primeiro consumo de hash ativo: 1 registro retornado; segundo consumo do mesmo hash: 0 registros.

### Limitações

- O repositório está pronto, mas os route handlers que emitem e consomem links serão conectados junto à sessão na T-004.

## Resultado consolidado

T-001 a T-005 concluídas. Lint, typecheck, 18 testes e build passaram. OTPs e tokens são persistidos apenas como hash; o portal usa cookie de sessão assinado e o worker será responsável pela entrega de mensagens da outbox. Nenhuma integração externa foi chamada.
