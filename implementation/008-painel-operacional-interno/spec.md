---
id: "008"
title: "Painel operacional interno"
status: in_progress_external_validation
priority: high
risk: critical
created_at: 2026-07-17
updated_at: 2026-07-27
owner: ai-agent
depends_on: ["001", "002", "003", "004", "005", "006", "007"]
requirements: [RF-016, RF-017, RF-018, RF-019, RF-020, RF-021, RF-022, RF-023, RNF-011, RNF-012, RNF-013, RNF-014, RNF-015]
---
# Especificação

## Objetivo e escopo

Entregar um painel interno autenticado por Supabase Auth para o proprietário da clínica e, por convite, para a dentista. O painel permite supervisionar agenda, atividade do agente/worker, falhas e incidentes, além de executar ações administrativas seguras sobre consultas e bloquear dias inteiros por meio de eventos all-day no Google Calendar.

## Fora de escopo

Prontuário, dados clínicos, pagamentos, relatórios financeiros, múltiplas unidades, papéis granulares além de proprietário/operador, MFA, reenfileiramento manual de mensagens e deploy/convite real sem autorização específica.

## Requisitos e critérios

- **RF-016 / RNF-012 / RNF-015 / CA-016:** autenticação interna via Supabase Auth; proprietário convida/revoga, operador não gerencia acessos.
- **RF-017 / RF-018 / CA-017 / CA-018:** agenda diária/semanal, filtros e busca por telefone, data, consulta ou correlation ID com projeções seguras.
- **RF-019 / RNF-013 / CA-019:** criar, remarcar e cancelar administrativamente preservando verificação fresca, idempotência, Calendar e auditoria.
- **RF-020 / CA-022:** atividade de inbox/outbox, intenção, link, notificação e origem de consulta distinguíveis.
- **RF-021 / RF-022 / RNF-011 / RNF-014 / CA-020 / CA-021:** incidentes correlacionados, notas e encerramento auditável sem expor PII excessiva ou segredos.
- **RF-023 / CA-023:** bloqueio integral cria evento de dia inteiro no Calendar e só confirma sucesso após persistência/auditoria ou entra em reconciliação.

## Restrições

Google Calendar permanece fonte oficial de ocupação; paciente nunca acessa rota ou dado administrativo; listas mascaram telefone; toda mutação administrativa exige confirmação, correlation ID e idempotência; migrations são aditivas e RLS nega por padrão.

## Riscos

Escalonamento de privilégio por RLS/guard incorreto, convite ou primeiro proprietário mal provisionado, inconsistência após sucesso parcial no Calendar, exposição de PII em atividade/logs e regressão em fluxos já existentes de pacientes.
