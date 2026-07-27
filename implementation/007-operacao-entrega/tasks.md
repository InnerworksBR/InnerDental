# Tarefas

- [x] **T-001:** Implementar logs, correlation ID, métricas e health checks seguros.
  - **Cobre:** RNF-004–RNF-007 | **Valida:** CA-702, CA-704 | **Testes:** CT-701 redaction/health/metrics
  - **Arquivos esperados:** observability modules/endpoints | **Dependências:** 001–006 | **Risco:** high
  - **Critério de conclusão:** falhas são rastreáveis sem PII/segredos e health distingue dependências.
- [x] **T-002:** Executar hardening e revisão de segurança/LGPD.
  - **Cobre:** RNF-003, RNF-004 | **Valida:** CA-704 | **Testes:** CT-702 auth/RLS/CSRF/headers/rate limits
  - **Arquivos esperados:** security config, threat model, policies | **Dependências:** 001–006 | **Risco:** critical
  - **Critério de conclusão:** nenhum achado critical/high fica aberto para release.
- [ ] **T-003:** Configurar CI com gates de qualidade e segurança.
  - **Cobre:** RNF-005–RNF-010 | **Valida:** CA-701 | **Testes:** CT-703 pipeline limpo/falha esperada
  - **Arquivos esperados:** CI workflow | **Dependências:** 001–006 | **Risco:** medium
  - **Critério de conclusão:** build, lint, types, testes e scans bloqueiam regressões.
- [x] **T-004:** Criar imagem Docker e configuração de homologação EasyPanel.
  - **Cobre:** RNF-003, RNF-005 | **Valida:** CA-705 | **Testes:** CT-704 container non-root/health/smoke
  - **Arquivos esperados:** `Dockerfile.web`, `Dockerfile.worker`, deploy config, `.env.example` | **Dependências:** T-001, T-003 | **Risco:** high
  - **Critério de conclusão:** imagem imutável roda sem root e recebe segredos em runtime.
- [ ] **T-005:** Implementar e testar backup, restore e direitos LGPD.
  - **Cobre:** RNF-004, RNF-005 | **Valida:** CA-703 | **Testes:** CT-705 restore/anonimização
  - **Arquivos esperados:** runbooks/scripts/tests | **Dependências:** 001, T-002 | **Risco:** critical
  - **Critério de conclusão:** restore isolado e fluxo de anonimização têm evidência e limites documentados.
- [ ] **T-006:** Executar testes de carga, falhas e concorrência.
  - **Cobre:** RNF-002, RNF-005, RNF-006, RNF-009 | **Valida:** CA-701, CA-702 | **Testes:** CT-706 p95/calendar-down/race
  - **Arquivos esperados:** load/chaos tests, report | **Dependências:** T-001, 003, 004 | **Risco:** critical
  - **Critério de conclusão:** metas aprovadas são medidas e nenhuma falha confirma consulta indevida.
- [ ] **T-007:** Executar matriz E2E CA01–CA15 e acessibilidade mobile.
  - **Cobre:** RF-001–RF-015, RNF-001–RNF-010 | **Valida:** CA-701 | **Testes:** CT-707 acceptance E2E
  - **Arquivos esperados:** E2E tests, validation report | **Dependências:** T-002–T-006 | **Risco:** high
  - **Critério de conclusão:** cada critério tem evidência e bloqueadores permanecem explícitos.
- [ ] **T-008:** Criar runbook de deploy, smoke, alertas e rollback.
  - **Cobre:** RNF-003, RNF-005–RNF-007 | **Valida:** CA-705 | **Testes:** CT-708 rehearsal
  - **Arquivos esperados:** `docs/runbooks/` | **Dependências:** T-001–T-007 | **Risco:** high
  - **Critério de conclusão:** ensaio em homologação comprova deploy e rollback operáveis.

## Progresso e evidências — 2026-07-16

- **T-001 concluída localmente:** logs JSON com redaction, correlation ID, métricas autenticadas, liveness/readiness e 3 testes focados.
- **T-002 concluída no escopo local:** CSP/headers, proteção de origem, RLS revisada, imagens não-root e threat model; audit sem high/critical. Há um advisory moderado transitivo de PostCSS e validações externas registradas no threat model.
- **T-003 preparada, aberta até executar no GitHub:** workflow contém lint, types, unit, build, E2E, secret scan, audit e gates de usuário de container; equivalentes locais passaram.
- **T-004 concluída localmente:** `luna-web:local` e `luna-worker:local` construídas por base digest; web executou como `nextjs`, liveness 200, métricas 200 autenticadas e readiness 503 com dependência falsa.
- **T-005 parcial:** backup/restore foi ensaiado em PostgreSQL 17 descartável, recuperando 18 tabelas. Anonimização permanece aberta até decisão de retenção e autorização destrutiva específica.
- **T-006 aberta:** script de carga pronto; p95, Calendar-down e corrida E2E precisam de homologação com sandboxes.
- **T-007 aberta:** 6 E2E mobile/desktop e matriz CA01–CA15 executados localmente; integrações reais seguem pendentes.
- **T-008 aberta:** runbooks prontos; ensaio EasyPanel/HTTPS/rollback requer ambiente e aprovação específica.
