# Validação

## T-001 — Fundação web

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` e `tests/unit/smoke.test.ts`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RNF-003 | CA-101 | aplicação compila e ferramentas executam localmente | aprovado |

### Comandos e resultados

- `pnpm install`: exit code 0 após fixar versões compatíveis. Lockfile verificado pela política de supply chain.
- `pnpm peers check`: exit code 0; sem problemas de peer dependency.
- `pnpm run lint`: exit code 0.
- `pnpm run typecheck`: exit code 0.
- `pnpm test`: exit code 0; 1 teste aprovado.
- `pnpm run build`: exit code 0; rota `/` gerada estaticamente.

### Riscos e limitações

- `sharp@0.34.5` e `unrs-resolver@1.12.2` têm scripts de build bloqueados explicitamente. A aplicação compilou sem eles; só devem ser liberados após revisão e aprovação específica.
- Não existem credenciais, dados reais, projeto Supabase ou migration aplicada.

## T-002 — Configuração e clientes Supabase

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.env.example`, `src/lib/config/env.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `tests/unit/env.test.ts` e `vitest.config.ts`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RNF-003, RNF-004 | CA-104 | schemas Zod separados, import `server-only` e busca no bundle estático | aprovado |

### Comandos e resultados

- `pnpm install`: exit code 0; lockfile e política de supply chain aprovados.
- `pnpm peers check`: exit code 0; sem conflitos de peer dependency.
- `pnpm run lint`: exit code 0.
- `pnpm run typecheck`: exit code 0.
- `pnpm test`: exit code 0; 2 arquivos e 4 testes aprovados.
- `pnpm run build`: exit code 0.
- `rg -n --glob '!*.map' 'SUPABASE_SECRET_KEY|server-secret' .next/static`: exit code 0 pelo wrapper; nenhuma referência no bundle estático.

### Riscos e limitações

- A configuração só é exercitada com variáveis de teste; nenhuma conexão Supabase foi realizada.
- A chave de servidor ainda deverá ser fornecida exclusivamente por secret manager do ambiente ao configurar uma instância real.

## T-003 — Schema e migration inicial

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`supabase/migrations/202607160001_initial_schema.sql`, `supabase/README.md` e `src/types/domain.ts`.

### Evidências disponíveis

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RNF-008 | CA-102 | migration aditiva com 14 tabelas, 8 índices e 10 triggers de `updated_at` | aprovado em PostgreSQL 17 descartável |

### Comandos e resultados

- `pnpm run lint`: exit code 0.
- `pnpm run typecheck`: exit code 0.
- Inspeção estática da migration: 14 tabelas, 8 índices, 10 triggers; nenhum `DROP`, `DELETE FROM` ou `TRUNCATE` encontrado.
- `docker pull postgres:17`: exit code 0; imagem oficial validada pelo digest `sha256:39fb82e41109483c81ac15422a302500b4a753777b47f8431038703536bc6c52`.
- Aplicação da migration em `luna-agenda-schema-test`: exit code 0; todos os objetos foram criados.
- Teste SQL de invariantes: exit code 0; 14 tabelas presentes, telefone e período inválidos rejeitados, e a segunda reserva ativa para o mesmo profissional/slot rejeitada por `unique_violation`.
- `docker rm -f luna-agenda-schema-test`: exit code 0; contêiner descartável removido após o teste.

### Riscos e limitações

- O teste usou PostgreSQL 17 puro, não uma stack Supabase completa. As políticas RLS serão validadas separadamente na T-005.
- Nenhum banco remoto foi acessado ou alterado.

## T-004 — Auditoria e outbox

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`supabase/migrations/202607160002_audit_and_outbox.sql`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RNF-007 | CA-102 | trigger de auditoria e outbox na mesma transação da consulta | aprovado em PostgreSQL 17 descartável |

### Comandos e resultados

- Aplicação ordenada das migrations em `luna-agenda-audit-test`: exit code 0.
- Inserção de consulta de teste: gerou um `audit_logs` com ação `insert` e uma outbox `appointment.created` sem PII no payload.
- `claim_notification_outbox(10)`: retornou uma mensagem, atualizando-a para `processing` e incrementando `attempts` para 1.

### Riscos e limitações

- A entrega efetiva/retry da mensagem será implementada na integração WhatsApp; a outbox apenas preserva a intenção transacional.

## T-005 — RLS por papel

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`supabase/migrations/202607160003_enable_rls.sql`.

### Matriz de acesso validada

| Papel | SELECT/INSERT direto em `patients` | Resultado |
|---|---|---|
| `anon` | negado por RLS | aprovado |
| `authenticated` | negado por RLS | aprovado |
| `service_role` | permitido para as Route Handlers do servidor | aprovado |

### Comandos e resultados

- Aplicação das migrations em PostgreSQL 17 descartável: exit code 0.
- Com privilégios SQL de teste concedidos, `anon` e `authenticated` visualizaram 0 registros por RLS.
- `service_role` com `BYPASSRLS` visualizou o único registro existente.
- Inserção como `anon`: bloqueada por violação de RLS, conforme esperado.

### Riscos e limitações

- Não há policy de paciente porque a identidade Supabase ainda não está vinculada a `patients`. Qualquer acesso direto do cliente deve permanecer bloqueado até uma revisão de autorização específica.

## T-006 — Seeds estruturados

**Estado:** concluída em 2026-07-16.

### Arquivos alterados

`supabase/seed.sql`.

### Evidências

| Requisito | Critério | Evidência | Resultado |
|---|---|---|---|
| RF-013, RF-014 | CA-102 | seed repetido em PostgreSQL descartável | aprovado |

### Comandos e resultados

- Aplicação das migrations e duas execuções consecutivas de `supabase/seed.sql`: exit code 0.
- Estado final: 1 profissional de placeholder, 9 períodos de atendimento, 12 planos, 4 aliases, 6 procedimentos, 3 FAQs e 0 pacientes.

### Riscos e limitações

- `CONFIGURE_GOOGLE_CALENDAR_ID` é um placeholder operacional e deve ser substituído por variável/configuração segura quando o calendário real for integrado.

## Resultado consolidado

As tarefas T-001 a T-006 foram concluídas. A fundação compila, é testada localmente, possui schema versionado, RLS negando acesso direto do cliente, auditoria/outbox e seeds idempotentes. Não houve acesso a Supabase remoto, credenciais reais, dados pessoais ou deploy.
