---
id: "006"
title: "WhatsApp e conhecimento estruturado"
status: approved
priority: high
risk: high
created_at: 2026-07-16
updated_at: 2026-07-24
owner: ai-agent
depends_on: ["001", "002", "004"]
requirements: [RF-009, RF-013, RF-014, RF-015, CA-011, CA-012]
---
# Especificação

## Objetivo e escopo

Integrar Evolution API e um worker TypeScript separado para entrada/saída WhatsApp, detectar intenção de agenda sem oferecer horários, gerar links seguros, enviar OTP/confirmações/lembretes e responder FAQs, planos e procedimentos somente com dados estruturados, encaminhando incerteza a humano.

## Fora de escopo

Decisões de disponibilidade no bot/worker, respostas críticas por memória da IA, campanhas e painel administrativo.

## Requisitos e critérios

- **RF-009:** enviar confirmações e registrar/reprocessar falhas.
- **RF-013/RF-014:** responder FAQ/planos/aliases/procedimentos ativos a partir do banco.
- **RF-015:** encaminhar ausência de correspondência segura e regras especiais.
- **CA-601:** intenções marcar/remarcar/cancelar recebem link, nunca horários.
- **CA-602:** plano só é confirmado por correspondência estruturada ativa; alias resolve para o plano correto.
- **CA-603:** mensagens de entrada duplicadas não duplicam respostas/operações.
- **CA-604:** assinatura/autenticidade do webhook é validada e payloads são redigidos.
- **CA-605:** falha de WhatsApp não desfaz consulta e gera pendência observável.

## Restrições

O worker apenas processa comunicação e jobs não críticos; consome a outbox com concorrência limitada e idempotência, nunca decide horários ou confirma consultas. Webhooks são idempotentes e nenhum segredo ou payload sensível aparece em logs.

## Riscos

Contrato variável da Evolution API, retries duplicados, prompt injection, mensagem fora da janela, indisponibilidade do worker e acúmulo da outbox.
