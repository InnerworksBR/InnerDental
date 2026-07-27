# Evidências de validação — implementação 003

## Resultado

Concluída em 2026-07-16. Slots de 15 minutos são calculados em `America/Sao_Paulo`, conflitos do Google Calendar fecham a agenda e holds são exclusivos e expirável no PostgreSQL.

## Matriz de requisitos

| Requisito | Evidência | Resultado |
|---|---|---|
| RF-001 | `availability-slots.test.ts`: períodos, passado e limites | aprovado |
| RF-002/RF-003 | `google-calendar-gateway.test.ts` e matriz de sobreposição | aprovado |
| RF-010 | migration `202607160007_slot_holds.sql`, teste PostgreSQL de corrida/expiração | aprovado |
| RF-011 | `verifySlotFresh` consulta novamente o Calendar antes do hold | aprovado |
| CA-304 | gateway normaliza toda falha para `CalendarUnavailableError`; API responde 503 | aprovado |

## Comandos executados

- `pnpm test -- tests/unit/availability-slots.test.ts tests/unit/google-calendar-gateway.test.ts` — 7 testes aprovados.
- `pnpm run typecheck` — exit code 0.
- PostgreSQL 17 isolado: todas as migrations aplicadas; segundo hold retornou `NULL`; hold expirado voltou a ser adquirível.
- `pnpm run lint` — exit code 0.
- `pnpm test` — 8 arquivos, 25 testes aprovados.
- `pnpm run build` — exit code 0; endpoints de disponibilidade e holds compilados.

## Limitações conhecidas

- A integração externa real não foi acionada: requer conta de serviço configurada, Calendar API ativa e calendário compartilhado com `GOOGLE_SERVICE_ACCOUNT_EMAIL`.
- A meta de p95 de 3 s foi sustentada por timeout de 2,5 s no fornecedor; medição sob carga real fica para a implementação operacional (007).

## Adaptação de autenticação — 2026-07-17

- Aprovação: solicitante autorizou adaptar a integração para `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` no ambiente local/deploy; nenhum secret real foi lido, alterado ou enviado.
- Impacto: substitui o token estático por OAuth 2.0 server-to-server, com JWT RS256 e cache do token temporário. O rollback é reverter o provider e restaurar a configuração anterior, sem mudança de banco.
- Testes focados: `pnpm test -- tests/unit/google-calendar-auth.test.ts tests/unit/google-calendar-gateway.test.ts` — 2 arquivos, 6 testes aprovados.
- Typecheck: `pnpm run typecheck` — exit code 0.
- Suíte completa: `pnpm test` — 13 arquivos, 44 testes aprovados, exit code 0.
- Lint: `pnpm run lint` — exit code 0; permanece um warning preexistente de incompatibilidade de memoização entre React Compiler e `react-hook-form` em `src/app/agenda/page.tsx`.
- Build: `pnpm run build` — exit code 0; 13 páginas geradas e todas as rotas Calendar compiladas.
- Limite: não houve chamada externa nem validação com credencial real; o smoke integrado depende da nova chave rotacionada e do calendário compartilhado.
- Correção de regressão em 2026-07-17: o schema de `POST /api/slot-holds` passou a aceitar horários `HH:mm`; o teste `slot-hold-schema.test.ts` cobre horários válidos e inválidos.
- Validação da regressão: `pnpm test -- tests/unit/slot-hold-schema.test.ts` — 1 arquivo, 7 testes aprovados; `pnpm run typecheck` — exit code 0; `pnpm run lint` — exit code 0, com o warning preexistente de `react-hook-form`.

## Otimização da seleção de datas — 2026-07-27

- `availability-window.test.ts` comprova uma única leitura do Google Calendar para a janela e zero slots para dia bloqueado e dia integralmente ocupado.
- A API em lote filtra dias sem slots e limita a resposta aos seis primeiros dias disponíveis; a UI recebe datas e horários juntos, troca de data sem nova chamada e oferece estados de carregamento, vazio, erro e nova tentativa.
- `pnpm test`: 25 arquivos e 105 testes aprovados.
- `pnpm run test:e2e`: 8 cenários aprovados em mobile e desktop, incluindo troca instantânea entre datas pré-carregadas sem nova requisição.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run security:scan` e `pnpm run build`: aprovados.
- Limite: `pnpm run test:load` não foi executado porque exige `LOAD_TEST_URL` e cookie de uma homologação autorizada; nenhuma chamada externa real foi feita.
