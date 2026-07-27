# Plano

## Estratégia

Centralizar normalização, usar tokens aleatórios opacos com hash e comparação segura, criar sessão assinada curta e separar emissão da entrega por WhatsApp.

## Arquivos previstos

`src/lib/phone/`, `src/lib/auth/`, `src/app/api/auth/`, middleware/guards, migrations complementares e testes.

## Sequência reversível

Normalização → repositório de desafios → token de link → OTP → sessão/guard → rate limit/auditoria.

## Testes e validações

Vetores de telefone, relógio controlado, replay/expiração, enumeração, autorização horizontal, contratos HTTP e redaction de logs.

## Rollback

Desativar emissão por feature flag, revogar sessões/tokens e manter trilha de auditoria.

## Aprovações necessárias

Aprovar `spec.md`, TTLs, limite de tentativas, duração de sessão e contrato interno para envio do OTP.
