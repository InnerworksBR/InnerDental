# Tarefas

- [x] **T-001:** Definir máquina de estados e repositório de consultas/operações.
  - **Cobre:** RF-012 | **Valida:** CA-405 | **Testes:** CT-401 transições/constraints
  - **Arquivos esperados:** domain, repositories, migration | **Dependências:** 001 | **Risco:** high
  - **Evidência:** `appointment_operations`, repositório e `validation.md`.
- [x] **T-002:** Implementar listagem futura reconciliada para a sessão.
  - **Cobre:** RF-012 | **Valida:** CA-406 | **Testes:** CT-402 autorização/evento alterado
  - **Arquivos esperados:** appointments service/API | **Dependências:** 002, 003/T-003, T-001 | **Risco:** high
  - **Evidência:** `GET /api/appointments` consulta o evento Calendar e sinaliza divergência; `validation.md`.
- [x] **T-003:** Implementar criação idempotente com segunda validação.
  - **Cobre:** RF-004 | **Valida:** CA-401–CA-403 | **Testes:** CT-403 concorrência/replay/falha parcial
  - **Arquivos esperados:** appointment create use case/API | **Dependências:** 003/T-005–T-007, T-001 | **Risco:** critical
  - **Evidência:** `createPatientAppointment`, operações idempotentes e build/testes locais em `validation.md`.
- [x] **T-004:** Implementar remarcação segura do mesmo evento.
  - **Cobre:** RF-005 | **Valida:** CA-404, CA-406 | **Testes:** CT-404 sucesso/falha/concorrência/manual edit
  - **Arquivos esperados:** reschedule use case/API | **Dependências:** T-002, T-003 | **Risco:** critical
  - **Evidência:** `POST /api/appointments/[id]/reschedule`; valida novo slot antes do `updateEvent`.
- [x] **T-005:** Implementar cancelamento futuro idempotente.
  - **Cobre:** RF-006 | **Valida:** CA-405, CA-406 | **Testes:** CT-405 política/replay/evento ausente
  - **Arquivos esperados:** cancel use case/API | **Dependências:** T-002, T-003 | **Risco:** high
  - **Evidência:** `POST /api/appointments/[id]/cancel`, antecedência de 24 horas e exclusão idempotente.
- [x] **T-006:** Integrar auditoria, outbox e reconciliação de falhas ambíguas.
  - **Cobre:** RF-012 | **Valida:** CA-402–CA-406 | **Testes:** CT-406 timeout/retry/reconcile
  - **Arquivos esperados:** audit/outbox/reconciliation | **Dependências:** T-003–T-005 | **Risco:** critical
  - **Evidência:** triggers existentes de auditoria/outbox e status `reconciliation_required`; detalhes em `validation.md`.


## Limite de evidência

Os fluxos foram validados localmente por typecheck, lint, testes unitários e build. A validação contra Google Calendar e Supabase reais permanece pendente de ambiente configurado.
