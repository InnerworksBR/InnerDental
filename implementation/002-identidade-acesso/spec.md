---
id: "002"
title: "Identidade e acesso sem senha"
status: completed
priority: high
risk: high
created_at: 2026-07-16
updated_at: 2026-07-16
owner: ai-agent
depends_on: ["001"]
requirements: [RF-007, RF-008, RNF-004]
---
# Especificação

## Objetivo e escopo

Identificar o paciente pelo telefone sem senha por dois caminhos: token opaco temporário emitido para links do WhatsApp e OTP solicitado no acesso direto. Criar sessão curta e autorizar somente recursos ligados ao telefone verificado.

## Fora de escopo

Login administrativo, senha, MFA tradicional, identificação clínica e interface completa do portal.

## Requisitos e critérios

- **RF-007:** normalizar telefone brasileiro para formato internacional e associá-lo à identidade da sessão.
- **RF-008:** emitir/validar token opaco e OTP com hash, expiração, uso único e origem.
- **RNF-004:** aplicar rate limit e respostas que não permitam enumerar pacientes.
- **CA-201:** telefone nunca aparece em URL; tokens/OTPs brutos não são persistidos.
- **CA-202:** token expirado, reutilizado ou adulterado é rejeitado.
- **CA-203:** acesso direto só cria sessão após prova pelo WhatsApp.
- **CA-204:** sessão não acessa consultas de outro telefone.

## Restrições

Sem senha; HTTPS obrigatório em produção; cookies `HttpOnly`, `Secure` e `SameSite`; mensagens via adaptador assíncrono.

## Riscos

Abuso de envio, SIM swap, normalização ambígua e vazamento de tokens em logs/referrers.
