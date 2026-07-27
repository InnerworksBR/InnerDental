---
id: "016"
title: "Confirmação de presença e resumo diário"
status: approved
priority: high
risk: high
created_at: 2026-07-27
updated_at: 2026-07-27
owner: ai-agent
depends_on: ["004", "006", "011"]
requirements: [RF-058, RF-059, RF-060, RNF-019, RNF-020]
---
# Especificação

## Objetivo

Reduzir o esforço do paciente para confirmar presença e dar à doutora uma visão acionável das pendências antes dos atendimentos do dia.

## Escopo e critérios

- **RF-058 / CA-058:** disponibilizar às 20h de São Paulo uma solicitação por consulta do dia seguinte, com confirmação por botão ou pela palavra “confirmo” e link de apoio para gerenciar a agenda.
- **RF-058 / CA-058:** registrar presença separadamente do estado da consulta, de modo idempotente e vinculado ao telefone remetente; remarcação reinicia a confirmação.
- **RF-058 / CA-058:** quando não houver consulta elegível ou houver mais de uma, não confirmar silenciosamente a consulta errada e orientar o paciente a usar a agenda segura.
- **RF-059 / CA-059:** disponibilizar uma única vez por data, no horário configurável padrão de 08h, um resumo ao número da doutora com total, confirmadas e lista de pendentes com horário, nome e telefone.
- **RNF-019:** reutilizar fila, leases, retry, deduplicação, política de destinatários e redaction existentes; ausência de resposta nunca cancela a consulta.
- **RF-060 / CA-060:** sincronizar periodicamente eventos diretos válidos do Google Calendar, vinculá-los de forma idempotente a paciente/profissional e incluí-los no fluxo existente sem duplicar eventos já ligados.
- **RNF-020:** aceitar apenas evento cronometrado, opaco, de 15/30 minutos e título `Nome Telefone`; leitura parcial ou indisponível não pode cancelar projeções, e paciente existente não tem o nome sobrescrito pela agenda externa.

## Fora de escopo

Cancelamento automático por falta de confirmação, ligação automática, campanhas, cobrança, escrita no Google Calendar, importação de evento integral/transparente/sem telefone, tela gerencial nova e aplicação da migration ou envio em ambiente externo.

## Aprovação

O solicitante aprovou em 2026-07-27 a recomendação de confirmação pelo chat com link como apoio e pediu explicitamente o resumo diário no número da doutora. O horário matinal foi assumido como configurável com padrão às 08h de São Paulo; essa escolha é reversível por configuração. Em seguida, aprovou com “pode seguir então” a inclusão controlada de eventos criados diretamente no Google Calendar conforme RF-060/RNF-020. A aprovação cobre implementação e testes locais, mas não migration externa, deploy, leitura de dados reais ou envio real.
