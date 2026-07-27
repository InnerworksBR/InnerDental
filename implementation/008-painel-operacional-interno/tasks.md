# Tarefas

- [x] **T-001:** Criar migration aditiva para perfis internos, incidentes, notas e bloqueios Calendar, com índices, constraints, auditoria e RLS.
  - **Cobre:** RF-016, RF-021, RF-022, RF-023, RNF-011, RNF-015 | **Valida:** CA-016, CA-020, CA-021, CA-023 | **Testes:** CT-801 schema/RLS/constraints
  - **Arquivos esperados:** `supabase/migrations/`, testes PostgreSQL | **Dependências:** 001, 007 | **Risco:** critical
  - **Critério de conclusão:** tabelas são aditivas, `anon`/paciente não leem dados internos e todo incidente/bloqueio tem integridade verificável.

- [x] **T-002:** Implementar sessão Supabase Auth, guard interno e autorização `owner`/`operator`.
  - **Cobre:** RF-016, RNF-012, RNF-015 | **Valida:** CA-016 | **Testes:** CT-802 login/guard/papéis
  - **Arquivos esperados:** auth/admin guard, rotas de login/logout | **Dependências:** T-001 | **Risco:** critical
  - **Critério de conclusão:** sessão de paciente não acessa `/interno`; somente proprietário administra convites e operador executa operações permitidas.

- [x] **T-003:** Implementar projeções administrativas seguras de agenda, consultas, auditoria, inbox e outbox.
  - **Cobre:** RF-017, RF-018, RF-020, RNF-011 | **Valida:** CA-017, CA-018, CA-022 | **Testes:** CT-803 filtros/mascaramento/correlação
  - **Arquivos esperados:** repositories/services admin, testes unitários | **Dependências:** T-001, T-002 | **Risco:** high
  - **Critério de conclusão:** consultas por período, telefone, ID e correlação retornam somente a projeção autorizada e distinguem origem/estado.

- [x] **T-004:** Implementar ciclo de vida de incidentes e notas com classificação segura de origem.
  - **Cobre:** RF-021, RF-022, RNF-014 | **Valida:** CA-020, CA-021 | **Testes:** CT-804 transições/incidente/nota
  - **Arquivos esperados:** domain/services/repositories de incidentes | **Dependências:** T-001, T-003 | **Risco:** high
  - **Critério de conclusão:** falha pode ser correlacionada, anotada e encerrada sem apagar evidências nem revelar segredo/payload bruto.

- [x] **T-005:** Adaptar os casos de uso de consulta para operações administrativas idempotentes e auditadas.
  - **Cobre:** RF-019, RF-022, RNF-013 | **Valida:** CA-019, CA-022 | **Testes:** CT-805 criar/remarcar/cancelar admin
  - **Arquivos esperados:** appointment admin service/repository, Calendar adapter, testes | **Dependências:** T-002, T-003 | **Risco:** critical
  - **Critério de conclusão:** nenhuma operação administrativa cria conflito, ignora Calendar ou perde auditoria/notification outbox.

- [x] **T-006:** Implementar bloqueio administrativo de dia inteiro com evento all-day, idempotência e reconciliação.
  - **Cobre:** RF-023, RF-022, RNF-013 | **Valida:** CA-019, CA-023 | **Testes:** CT-806 all-day/falha parcial/reconciliação
  - **Arquivos esperados:** block service/repository, Calendar adapter, testes sandbox/fake | **Dependências:** T-001, T-002 | **Risco:** critical
  - **Critério de conclusão:** evento Calendar é criado antes de sucesso; erro parcial torna o bloqueio reconciliável e o portal fecha a data após sucesso.

- [x] **T-007:** Publicar contratos HTTP administrativos com Zod, correlação, autorização e respostas seguras.
  - **Cobre:** RF-016 a RF-023, RNF-011 a RNF-015 | **Valida:** CA-016 a CA-023 | **Testes:** CT-807 contrato/401/403/409/503
  - **Arquivos esperados:** `src/app/api/admin/`, testes de rota | **Dependências:** T-002 a T-006 | **Risco:** critical
  - **Critério de conclusão:** todas as rotas administrativas autenticam, autorizam, validam entrada e não retornam detalhes sensíveis.

- [ ] **T-008:** Construir UI interna mobile-first para dashboard, agenda, consulta, atividade e incidentes.
  - **Cobre:** RF-017, RF-018, RF-020, RF-021 | **Valida:** CA-017, CA-018, CA-020, CA-021, CA-022 | **Testes:** CT-808 UI/acessibilidade
  - **Arquivos esperados:** `src/app/interno/`, componentes e testes E2E | **Dependências:** T-007 | **Risco:** high
  - **Critério de conclusão:** operador navega, filtra, investiga e executa ações confirmadas por teclado e celular, com estados de falha claros.

- [ ] **T-009:** Implementar convite/revogação de operador e provisionamento controlado do primeiro proprietário.
  - **Cobre:** RF-016, RNF-015 | **Valida:** CA-016 | **Testes:** CT-809 convite/revogação/auditoria
  - **Arquivos esperados:** API/UI owner, integração Supabase Auth, runbook | **Dependências:** T-002, T-007 | **Risco:** critical
  - **Critério de conclusão:** apenas proprietário pode convidar/revogar; ações são auditadas e nenhum convite real é enviado sem autorização operacional.

- [ ] **T-010:** Executar matriz de segurança, Calendar sandbox, E2E e rollout/rollback do painel.
  - **Cobre:** RNF-011 a RNF-015 | **Valida:** CA-016 a CA-023 | **Testes:** CT-810 RLS/E2E/smoke/rollback
  - **Arquivos esperados:** testes, `docs/runbooks/`, `validation.md` | **Dependências:** T-001 a T-009 | **Risco:** critical
  - **Critério de conclusão:** todos os critérios têm evidência local/sandbox; pendências externas, incidentes e rollback ficam registrados antes de habilitar usuários reais.

## Progresso e evidências — 2026-07-17

- **T-001 a T-007 concluídas localmente:** migration aditiva, guard Supabase Auth, projeções mascaradas, incidentes, APIs de consulta, bloqueio all-day e contratos administrativos foram implementados e compilados.
- **T-008 parcial:** dashboard responsivo com agenda diária e semanal real por dia, atividade, incidentes, bloqueio e eventos criados diretamente no Google Calendar foi implementado; o E2E público mobile/desktop passou, enquanto filtros avançados, detalhe de consulta e E2E interno autenticado continuam pendentes.
- **T-009 aberta:** o primeiro proprietário será provisionado manualmente; convite/revogação real depende de autorização operacional para e-mail do Supabase Auth.
- **T-010 aberta:** testes unitários, typecheck, lint, scanner e build passaram; migration Cloud, RLS real, Calendar sandbox e E2E ainda precisam de evidência externa.

## Matriz de rastreabilidade

| Requisitos | Critérios | Tarefas | Testes |
|---|---|---|---|
| RF-016, RNF-012, RNF-015 | CA-016 | T-001, T-002, T-007, T-009 | CT-801, CT-802, CT-807, CT-809 |
| RF-017, RF-018 | CA-017, CA-018 | T-003, T-007, T-008 | CT-803, CT-807, CT-808 |
| RF-019, RNF-013 | CA-019 | T-005, T-007 | CT-805, CT-807 |
| RF-020 | CA-022 | T-003, T-007, T-008 | CT-803, CT-807, CT-808 |
| RF-021, RF-022, RNF-011, RNF-014 | CA-020, CA-021 | T-001, T-004, T-007, T-008 | CT-801, CT-804, CT-807, CT-808 |
| RF-023 | CA-023 | T-001, T-006, T-007, T-008 | CT-801, CT-806, CT-807, CT-808 |
