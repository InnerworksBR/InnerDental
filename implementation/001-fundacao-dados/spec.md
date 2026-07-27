---
id: "001"
title: "Fundação da aplicação e dados"
status: completed
priority: critical
risk: high
created_at: 2026-07-16
updated_at: 2026-07-16
owner: ai-agent
depends_on: []
requirements: [RNF-003, RNF-004, RNF-007, RNF-008]
---
# Especificação

## Objetivo e escopo

Criar a base executável do Luna Agenda: aplicação Next.js/TypeScript, padrões de qualidade, ambientes, cliente Supabase e schema versionado para profissionais, pacientes, disponibilidade, consultas, reservas, acesso, conteúdo estruturado, notificações e auditoria.

## Fora de escopo

Integrações externas funcionais, telas finais, regras completas de agenda e deploy em produção.

## Requisitos e critérios

- **RNF-003/RNF-004:** proteger transporte, configuração, tokens, telefone e segredos.
- **RNF-007:** fornecer auditoria imutável das mutações relevantes.
- **RNF-008:** armazenar instantes em UTC e aplicar `America/Sao_Paulo` no negócio.
- **CA-101:** projeto instala, compila, verifica tipos, lint e testes em ambiente limpo.
- **CA-102:** migrations sobem em banco vazio e constraints rejeitam estados inválidos.
- **CA-103:** cliente anônimo não lê nem altera dados protegidos.
- **CA-104:** segredos não chegam ao bundle do navegador nem aos logs.

## Restrições

Next.js com App Router e API Route Handlers; Supabase PostgreSQL; migrations versionadas; nenhum dado clínico sensível.

## Riscos

Schema prematuro, políticas RLS incompletas e vazamento de service role. Alterações destrutivas exigem aprovação separada.
