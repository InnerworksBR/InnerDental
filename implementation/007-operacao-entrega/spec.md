---
id: "007"
title: "Operação, segurança e entrega do MVP"
status: in_progress_external_validation
priority: critical
risk: high
created_at: 2026-07-16
updated_at: 2026-07-16
owner: ai-agent
depends_on: ["001", "002", "003", "004", "005", "006"]
requirements: [RNF-002, RNF-003, RNF-004, RNF-005, RNF-006, RNF-007, RNF-009, RNF-010]
---
# Especificação

## Objetivo e escopo

Preparar segurança, observabilidade, métricas, backup, Docker/EasyPanel, HTTPS, CI/CD, smoke/rollback e validação integrada de CA01–CA15 para entrega controlada do MVP.

## Fora de escopo

Publicar em produção sem aprovação explícita, painel analítico, operação 24x7 e funcionalidades futuras.

## Requisitos e critérios

- **RNF-002–RNF-007/RNF-009/RNF-010:** desempenho, segurança, privacidade, confiabilidade, disponibilidade, auditoria, idempotência e acessibilidade verificáveis.
- **CA-701:** todos CA01–CA15 do PRD possuem teste/evidência ou aceite manual registrado.
- **CA-702:** falha Calendar fecha marcação; falha WhatsApp cria pendência sem perder consulta.
- **CA-703:** restore em ambiente isolado recupera banco dentro dos objetivos aprovados.
- **CA-704:** nenhum segredo ou telefone completo aparece em imagem, bundle, URL ou logs.
- **CA-705:** deploy de homologação passa health, smoke, E2E e checklist de rollback.

## Restrições

Produção requer aprovação explícita; segredos fora da imagem; migrations aditivas; telemetria minimizada.

## Riscos

Deploy sem credenciais/infra, backup não restaurável, alert fatigue, vazamento de PII e E2E dependente de serviços reais.
