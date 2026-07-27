---
id: "004"
title: "Ciclo de vida das consultas"
status: awaiting_approval
priority: critical
risk: critical
created_at: 2026-07-16
updated_at: 2026-07-16
owner: ai-agent
depends_on: ["002", "003"]
requirements: [RF-004, RF-005, RF-006, RF-012, RNF-005, RNF-006, RNF-009]
---
# Especificação

## Objetivo e escopo

Criar, listar, remarcar e cancelar consultas do paciente autenticado, coordenando hold, segunda consulta ao Calendar, evento Google, estado Supabase, idempotência, auditoria e pendência de notificação.

## Fora de escopo

UI, prontuário, pagamentos, múltiplas durações e edição administrativa.

## Requisitos e critérios

- **RF-004:** criar evento Calendar de 15 minutos e persistir seu ID e estado.
- **RF-005:** remarcar atualizando o mesmo evento somente após garantir o novo slot.
- **RF-006:** cancelar evento futuro conforme antecedência configurável e liberar o horário.
- **RF-012:** listar futuras e registrar histórico de todas as transições.
- **CA-401:** confirmação concorrente nunca cria duas consultas no slot.
- **CA-402:** falha do Calendar não cria consulta `scheduled` somente no Supabase.
- **CA-403:** título contém `Nome | Telefone` e descrição contém ID interno e dados previstos.
- **CA-404:** remarcação preserva `calendar_event_id`; falha mantém consulta anterior válida.
- **CA-405:** cancelamento confirmado torna o slot disponível e é idempotente.
- **CA-406:** alterações manuais são verificadas antes de exibir/modificar a consulta.

## Restrições

Paciente só acessa consultas do telefone da sessão; idempotency key em mutações; notificações não revertem sucesso Calendar.

## Riscos

Transação distribuída sem atomicidade, timeout após sucesso externo, evento manualmente removido e replay.
