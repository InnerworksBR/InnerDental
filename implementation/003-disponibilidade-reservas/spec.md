---
id: "003"
title: "Disponibilidade, Google Calendar e reservas"
status: completed
priority: critical
risk: critical
created_at: 2026-07-16
updated_at: 2026-07-27
owner: ai-agent
depends_on: ["001"]
requirements: [RF-001, RF-002, RF-003, RF-010, RF-011, RNF-002, RNF-005, RNF-006, RNF-008, RNF-009]
---
# Especificação

## Objetivo e escopo

Calcular slots determinísticos de 15 minutos a partir de regras/exceções, remover passado e limites configurados, consultar eventos do Google Calendar em tempo real e criar reservas temporárias exclusivas.

## Fora de escopo

Criação/alteração de consultas, UI, notificações e sincronização completa de eventos manuais para o Supabase.

## Requisitos e critérios

- **RF-001:** gerar slots por períodos múltiplos e limites mínimo/máximo.
- **RF-002/RF-003:** consultar Calendar e bloquear toda janela sobreposta (`eventStart < slotEnd && eventEnd > slotStart`).
- **RF-010:** hold configurável, expirável e exclusivo por profissional/instante.
- **RF-011:** expor verificação fresca reutilizável pela confirmação final.
- **CA-301:** evento 10:10–10:40 bloqueia 10:00, 10:15 e 10:30.
- **CA-302:** evento de dia inteiro configurado bloqueia o expediente do dia.
- **CA-303:** dois concorrentes não mantêm hold ativo no mesmo slot.
- **CA-304:** falha/timeout do Calendar fecha a agenda, sem retornar disponibilidade positiva.
- **CA-305:** consulta responde preferencialmente em até 3 segundos sob carga-alvo definida.

## Restrições

Calendar é fonte de ocupação; timezone `America/Sao_Paulo`; sem sugestão/priorização; o worker de mensageria não participa do lock transacional.

## Riscos

DST/timezone, paginação/recorrência do Calendar, latência, quota, all-day e corrida entre verificação e criação.
