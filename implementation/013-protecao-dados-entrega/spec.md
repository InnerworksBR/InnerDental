---
id: "013"
title: "Proteção de dados e entrega controlada"
status: completed
priority: critical
risk: critical
created_at: "2026-07-23"
updated_at: "2026-07-23"
owner: ai-agent
depends_on: ["010", "012"]
requirements: ["RF-039", "RF-040", "RF-041", "RF-042", "RF-043"]
approval: "Usuário aprovou explicitamente as implementações 010 a 013 em 2026-07-23 e autorizou execução sequencial até a conclusão."
---

# Especificação

## Objetivo e escopo

Completar o plano operacional com backup criptografado e verificável, restore isolado ensaiável, gate de migrations, artefatos de release rastreáveis e rollback baseado em evidências. A implementação cria automação local/CI e documentação; não toca produção.

## Fora de escopo

- Executar backup, restore, migration ou deploy em banco real.
- Escolher fornecedor, bucket, região, retenção jurídica ou credencial sem decisão da controladora.
- Automatizar exclusão LGPD ou rollback destrutivo de schema.
- Publicar imagens ou criar custos externos.

## Requisitos e critérios

- **RF-039 — Backup protegido:** dumps devem ser criptografados, possuir checksum e destino externo configurável.
  - **CA-039:** script falha fechado sem chave/destino, usa permissões mínimas e não imprime URL, chave ou conteúdo.
- **RF-040 — Restore comprovável:** restauração deve ocorrer somente em banco isolado identificado, com validação de schema/RLS e relatório sem PII.
  - **CA-040:** guardas rejeitam produção e o ensaio produz tempos, contagens seguras e resultado verificável.
- **RF-041 — Gate de migrations:** migration deve ser validada, acompanhada de backup e aplicada separadamente da aplicação.
  - **CA-041:** checklist/automação registra revisão, ordem, lock risk, backup e decisão; rollback é forward-fix.
- **RF-042 — Release rastreável:** release deve referenciar revisão, digests de web/worker, testes, SBOM/checksum e migrations compatíveis.
  - **CA-042:** manifesto é produzido localmente/CI sem segredo e falha se artefatos não compartilham revisão.
- **RF-043 — Rollback evidenciado:** decisão de rollback deve preservar filas, auditoria e dados externos.
  - **CA-043:** runbook lista gatilhos, digest anterior, compatibilidade de schema, smoke e evidência pós-ação.

## Restrições

- Nenhuma operação externa ou destrutiva sem aprovação específica.
- Arquivos de backup e chaves não entram no repositório ou artefatos públicos.
- RPO/RTO permanecem desconhecidos até ensaio com volume representativo.

## Riscos

- Backup não testado é falsa segurança; restore isolado é gate obrigatório.
- Criptografia mal configurada pode tornar o backup irrecuperável.
- Compatibilidade de migration pode bloquear rollback da aplicação.
