# Validação

## Matriz de rastreabilidade

| Requisito | Critério | Tarefa | Teste | Evidência | Status |
|---|---|---|---|---|---|
| RF-044 | CA-044 | T-001–T-003, T-006 | CT-1401–CT-1403, CT-1406 | slots consecutivos, intervalos 30 min, schemas, service fake e E2E | passed_local |
| RF-045 | CA-045 | T-005, T-006 | CT-1405, CT-1406 | query `online_booking = false`, descrições e aviso E2E | passed_local |
| RF-046 | CA-046 | T-004, T-007 | CT-1404, CT-1407 | payload Calendar, PATCH sem summary e projeção interna | passed_local |
| RNF-016 | CA-044, CA-046 | T-003, T-004, T-006, T-008 | CT-1403, CT-1404, CT-1406 | teste de service e varredura sem campo persistente | passed_local |

## Comandos e resultados — 2026-07-27

- `pnpm vitest run` focado em disponibilidade, schemas, Calendar, migration e projeções: 7 arquivos/29 testes aprovados.
- `pnpm vitest run tests/unit/joint-appointment-service.test.ts`: 2 testes aprovados; confirma 30 minutos, payload externo e ausência do segundo nome nas chamadas de persistência.
- `pnpm test`: 30 arquivos e 117 testes aprovados.
- `pnpm run test:e2e`: 10 cenários aprovados em mobile e desktop; inclui nome obrigatório, somente início consecutivo e limitações antes da confirmação.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run security:scan` e `pnpm run build`: aprovados.
- `pnpm run migrations:check`: 13 migrations ordenadas, sem achado destrutivo pelo preflight; 8 migrations sinalizadas para revisão de rollout.
- Tentativa de validação PostgreSQL isolada: não executada porque o Docker Desktop/daemon não está disponível nesta máquina; `psql` também não está instalado.

## Revalidação da orientação de procedimentos — 2026-07-27

- `pnpm vitest run tests/unit/not-offered-procedures.test.ts`: 1 teste aprovado; confirma o filtro `online_booking = false` e o retorno conjunto de Canal em molar, Extração de siso e Urgência.
- `pnpm run test:e2e`: 10 cenários aprovados; desktop e mobile confirmam os três procedimentos e suas orientações antes do botão final.
- `pnpm test`: 30 arquivos e 117 testes aprovados.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run security:scan` e `pnpm run build`: aprovados; a compilação de produção terminou sem erro.

## Achados e riscos restantes

- A migration `202607270013_joint_appointments.sql` valida checks e cria exclusion constraints, o que pode adquirir lock e percorrer as tabelas. Volume real, duração do lock e concorrência precisam ser medidos em homologação.
- O telefone completo foi liberado somente na linha do tempo interna autenticada, conforme pedido explícito; a lista de pacientes continua usando `maskedPhone`.
- A correção aprovada determina que o aviso use `procedures.online_booking = false`, inclusive para registros ativos, preservando a descrição como orientação sem afirmar genericamente que o procedimento não é realizado.

## Limitações

- Nenhuma migration foi aplicada em Supabase local/remoto e nenhum evento Google real foi criado ou remarcado.
- Antes do rollout: backup verificável, aplicação em homologação, teste concorrente de holds 15×30/30×30, smoke de criação/remarcação no Calendar e observação de locks.
