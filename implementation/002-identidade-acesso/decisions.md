# Decisões

- **D-001 — Confirmada pelo PRD:** telefone não aparece na URL; link usa token opaco temporário.
- **D-002 — Proposta:** token de link com uso único e sessão separada após consumo. **Estado:** pendente.
- **D-003 — Proposta:** OTP de 6 dígitos, TTL de 5 minutos, 5 tentativas e limites por telefone/IP. **Estado:** pendente.
- **D-004 — Proposta:** cookie de sessão assinado, `HttpOnly`, duração de 30 minutos e renovação limitada. **Estado:** pendente.
- **D-005 — Executada em 2026-07-16:** assumir Brasil como país padrão somente para números nacionais completos com DDD. A normalização não infere país, DDD ou dígitos ausentes; telefones são persistidos como `55` + DDD + número.
- **D-006 — Executada em 2026-07-16:** token opaco com 256 bits aleatórios, hash SHA-256 persistido, TTL de 5 minutos e consumo atômico. O usuário autorizou a implementação 002 no ambiente local; rollback é não emitir novos links e revogar tokens ativos por migration compensatória aprovada.

Pendências: país padrão quando DDI ausente, provedor de rate limit e texto/consentimento das mensagens.
