# ADR-003: Bloqueio administrativo integral cria evento no Google Calendar

- Status: accepted
- Data: 2026-07-17

## Contexto

RF-023 e CA-023 exigem que um bloqueio feito no painel impeça novas marcações no mesmo dia e preserve o Google Calendar como fonte oficial de ocupação.

## Decisão

O painel criará um evento de dia inteiro no calendário do profissional antes de confirmar o bloqueio. O sistema persistirá o identificador do evento em `calendar_blocks`, junto com idempotência, autor e status de reconciliação.

## Alternativas

- Criar apenas `availability_exception`: rejeitada, pois produziria bloqueio invisível no Calendar e duas fontes de verdade.
- Criar evento em horário fixo de 24 horas: rejeitada, pois sofre com timezone/DST e não representa corretamente um evento all-day do Google.

## Consequências

Falha do Calendar impede concluir a ação. Sucesso externo seguido de falha local requer reconciliação, não remoção automática do evento. O evento fica visível para a dentista e bloqueia disponibilidade pelo mecanismo atual.

## Evidências

Decisão explícita do solicitante em 2026-07-17; RF-023 e CA-023 do [PRD interno](../../product/PRD.md).
