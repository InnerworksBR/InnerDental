---
id: "005"
title: "Portal mobile do paciente"
status: awaiting_approval
priority: high
risk: medium
created_at: 2026-07-16
updated_at: 2026-07-16
owner: ai-agent
depends_on: ["002", "003", "004"]
requirements: [RF-004, RF-005, RF-006, RF-007, RF-008, RNF-001, RNF-010, CA-014, CA-015]
---
# Especificação

## Objetivo e escopo

Entregar portal mobile-first, sem instalação, para acesso por link/OTP, início, marcação, consultas futuras, remarcação e cancelamento, com estados de carga, vazio, expiração, conflito e indisponibilidade.

## Fora de escopo

Painel administrativo, escolha de duração, prontuário, pagamento e recomendações de horário.

## Requisitos e critérios

- **RF-004–RF-008:** oferecer jornadas autenticadas de criar, remarcar e cancelar, coletando somente dados mínimos e exibindo slots sem priorização.
- **RNF-001/RNF-010:** interface mobile-first, legível e acessível.
- **CA-501:** fluxos completos funcionam a 320 px e com teclado.
- **CA-502:** controles têm nome acessível, foco visível, alvo adequado e contraste verificável.
- **CA-503:** indisponibilidade, conflito, token expirado e ausência de consulta têm mensagens acionáveis do PRD.
- **CA-504:** paciente sem consulta futura não recebe ações inválidas.
- **CA-505:** nenhuma tela coleta informação clínica sensível ou exige senha.

## Restrições

Mobile-first, server-side authorization, formulários React Hook Form/Zod, português do Brasil e reduced motion.

## Riscos

Calendário inacessível, dupla submissão, estado obsoleto e exposição de dados no cache do navegador.
