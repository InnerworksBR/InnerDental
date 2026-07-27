# Evidências da implementação 007

Este arquivo registra validações locais. Resultados externos permanecem pendentes e não são tratados como concluídos.

| Item | Evidência |
|---|---|
| T-001 | logs JSON redigidos, correlation ID, métricas autenticadas e health live/ready; testes `observability.test.ts` |
| T-002 | headers/CSP/HSTS, CSRF por origem, containers não-root e threat model; revisão estática sem critical/high aberto localmente |
| T-003 | workflow CI com lint, types, unit, build, E2E, secret scan, audit e container gates |
| T-004 | Dockerfiles por digest, usuários não-root, compose e runbook EasyPanel; build/smoke local a registrar abaixo |
| T-005 | scripts de backup/restore com guarda de banco isolado e fluxo LGPD documentado; ensaio real pendente |
| T-006 | script de carga pronto; sandbox e metas operacionais pendentes |
| T-007 | matriz CA01–CA15 em `acceptance-matrix.md`; integrações reais pendentes |
| T-008 | runbooks de deploy, rollback, incidentes e observabilidade; ensaio EasyPanel pendente |

## Comandos executados

| Comando | Resultado |
|---|---|
| `pnpm lint` | exit 0; 1 warning conhecido do React Compiler/RHF, sem erros |
| `pnpm test` | exit 0; 12 arquivos e 40 testes aprovados |
| `pnpm build` | exit 0; rotas e proxy compilados |
| `pnpm typecheck` | exit 0 |
| `pnpm test:e2e` | exit 0; 6 cenários mobile/desktop aprovados |
| `pnpm security:scan` | exit 0; 141 arquivos verificados |
| `pnpm audit --audit-level high --prod` | exit 0; 0 high/critical e 1 moderate transitiva |
| `docker compose config --quiet` | exit 0 |
| build `luna-web:local` e `luna-worker:local` | exit 0; usuários `nextjs` e `node` configurados |
| smoke do web | liveness 200, métricas 200 com token, headers/correlation presentes, readiness 503 com banco falso |
| smoke do worker | processo ativo como `node`, log JSON, métricas 200 com token e health 503 com banco falso |
| backup/restore PostgreSQL 17 | dump validado e restore isolado com 18 tabelas |
