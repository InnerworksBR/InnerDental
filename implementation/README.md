# Implementações — Luna Agenda

Planejamento criado a partir de `PRD.md` em 2026-07-16. As implementações 010 a 013 foram aprovadas e concluídas localmente em 2026-07-23; ações externas continuam sujeitas a autorização específica.

| ID | Implementação | Estado | Depende de | Foco |
|---|---|---|---|---|
| 001 | Fundação da aplicação e dados | aguardando aprovação | — | Next.js, Supabase, schema, RLS e base de testes |
| 002 | Identidade e acesso sem senha | aguardando aprovação | 001 | telefone, token temporário, OTP e sessão |
| 003 | Disponibilidade, Calendar e reservas | aguardando aprovação | 001 | slots, conflitos, Calendar e holds transacionais |
| 004 | Ciclo de vida das consultas | concluída (validação local) | 002, 003 | criar, listar, remarcar e cancelar |
| 005 | Portal mobile do paciente | concluída (validação local) | 002, 003, 004 | jornadas e acessibilidade |
| 006 | WhatsApp e conhecimento estruturado | implementada localmente; sandbox pendente | 001, 002, 004 | Evolution API, worker TypeScript, FAQ, planos e lembretes |
| 007 | Operação, segurança e entrega do MVP | implementada localmente; validações externas pendentes | 001–006 | observabilidade, LGPD, deploy e E2E |
| 008 | Painel operacional interno | aguardando aprovação | 001–007 | acesso interno, agenda, operação, incidentes e bloqueios Calendar |
| 009 | Hardening pós-auditoria | implementado localmente; rollout externo pendente | 002–007 | mensageria, reservas, OTP, portal, readiness e qualidade |
| 010 | Plataforma segura de produção | concluída localmente; rollout externo pendente | 007, 009 | borda HTTPS, configuração, secrets, containers e artefatos imutáveis |
| 011 | Resiliência e escalabilidade da mensageria | concluída localmente; migration externa pendente | 009 | leases, dead-letter, retry, concorrência e métricas de fila |
| 012 | Observabilidade e resposta operacional | concluída localmente; ativação externa pendente | 010, 011 | coleta privada, dashboards, alertas, correlação e redaction |
| 013 | Proteção de dados e entrega controlada | concluída localmente; ensaio real e rollout externo pendentes | 010, 012 | backup criptografado, restore, migrations, release e rollback |
| 014 | Atendimento conjunto e confirmação informada | implementada localmente; migration e smoke externos pendentes | 003, 004, 005, 008 | 15/30 minutos, segundo nome transitório, limitações e padrão da agenda |
| 015 | Central de gestão clínica e operacional | implementada e validada localmente; migration e smoke autenticado externos pendentes | 001, 006, 008, 009 | cadastros, agenda, conteúdo, pacientes, equipe e auditoria |
| 016 | Confirmação de presença e resumo diário | concluída e validada localmente; migrations e rollout externos pendentes | 004, 006, 011 | confirmação às 20h, resposta no chat, eventos diretos e resumo matinal para a doutora |

## Ordem recomendada

`001 → (002 + 003) → 004 → (005 + 006) → 007`

`001–007 → 008`

`(010 + 011) → 012 → 013`

`(003 + 004 + 005 + 008) → 014`

`(001 + 006 + 008 + 009) → 015`

`(004 + 006 + 011) → 016`

## Cobertura do PRD

- RF-001–RF-003, RF-010–RF-011: implementação 003.
- RF-004–RF-006, RF-012: implementação 004.
- RF-007–RF-008: implementação 002.
- RF-009, RF-013–RF-015: implementação 006.
- RNF-001–RNF-010 e aceite integrado CA-001–CA-015: distribuídos nas especificações e consolidados em 007.
- RF-016–RF-023, RNF-011–RNF-015 e CA-016–CA-023: implementação 008.
- RF-044–RF-046, RNF-016 e CA-044–CA-046: implementação 014.
- RF-047–RF-056, RNF-017 e CA-047–CA-056: implementação 015.
- RF-058–RF-060, RNF-019–RNF-020 e CA-058–CA-060: implementação 016.

## Matriz de rastreabilidade do PRD

| Requisito/critério original | Implementação | Tarefas principais | Evidência planejada | Estado |
|---|---|---|---|---|
| RF-001–RF-003; CA-001–CA-003, CA-010 | 003 | T-001–T-007 | CT-301–CT-307 | planejado |
| RF-004; CA-004–CA-007, CA-013 | 003, 004, 006 | 003/T-005–T-007; 004/T-003; 006/T-004 | CT-305–CT-307, CT-403, CT-604 | planejado |
| RF-005; CA-008 | 004, 005 | 004/T-004; 005/T-005 | CT-404, CT-505 | planejado |
| RF-006; CA-009 | 004, 005 | 004/T-005; 005/T-005 | CT-405, CT-505 | planejado |
| RF-007–RF-008; CA-015 | 002, 005 | 002/T-001–T-005; 005/T-002 | CT-201–CT-205, CT-502 | planejado |
| RF-009 | 006 | T-001–T-004, T-007 | CT-601–CT-604, CT-607 | planejado |
| RF-010–RF-011 | 003, 004 | 003/T-005–T-007; 004/T-003 | CT-305–CT-307, CT-403 | planejado |
| RF-012 | 001, 004 | 001/T-004; 004/T-001–T-006 | CT-104, CT-401–CT-406 | planejado |
| RF-013–RF-015; CA-011–CA-012 | 001, 006 | 001/T-006; 006/T-003, T-005–T-007 | CT-106, CT-603, CT-605–CT-607 | planejado |
| RNF-001, RNF-010; CA-014 | 005, 007 | 005/T-001, T-006; 007/T-007 | CT-501, CT-506, CT-707 | planejado |
| RNF-002 | 003, 007 | 003/T-007; 007/T-006 | CT-307, CT-706 | planejado |
| RNF-003–RNF-009 | 001–004, 006, 007 | tarefas de segurança, concorrência, auditoria e operação | CT-101–CT-406, CT-601–CT-708 | planejado |

Os critérios `CA-101+` dentro de cada pasta são critérios técnicos derivados e não substituem `CA-001–CA-015` do PRD.

## Gate de execução

Antes de escrever código, revisar e aprovar explicitamente os `spec.md`, sobretudo as decisões marcadas como pendentes. Mudanças posteriores devem ser registradas no `decisions.md` da implementação correspondente.
