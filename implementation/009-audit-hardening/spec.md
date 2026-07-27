---
id: "009"
title: "Hardening pós-auditoria"
status: approved
priority: critical
risk: critical
created_at: 2026-07-20
updated_at: 2026-07-20
owner: ai-agent
depends_on: ["002", "003", "004", "005", "006", "007"]
approval: "Usuário aprovou explicitamente em 2026-07-20: resolver todos os achados da auditoria."
---

# Especificação

## Objetivo

Corrigir os achados confirmados na auditoria: reenvio de mensagens, reserva não consumida, proteção de OTP, logout, perfil inicial, readiness, reconciliação observável, qualidade do pipeline e dependência vulnerável.

## Critérios de aceite

- Uma mensagem recebida não é reenviada por incompatibilidade entre worker e schema.
- O worker verifica toda gravação de estado e não trata falha de persistência como sucesso.
- Criar ou remarcar consulta exige e consome um hold pertencente à sessão, telefone, profissional e horário.
- O banco rejeita duas consultas ativas no mesmo slot.
- Verificação de OTP é atômica por telefone e possui limite de tentativas.
- OTPs de seis dígitos não dependem de unicidade global histórica.
- Logout do paciente expira a sessão.
- A API informa explicitamente se o perfil inicial está completo.
- Readiness valida configuração crítica do portal, OTP, Evolution, OpenAI e Calendar.
- Lint, typecheck, unitários, E2E, build, secret scan e auditoria de dependências passam.

## Restrições

Migration aditiva, sem execução em produção, sem alteração de secrets ou DNS e sem leitura de dados pessoais reais.
