---
id: "010"
title: "Plataforma segura de produção"
status: completed
priority: critical
risk: high
created_at: "2026-07-23"
updated_at: "2026-07-23"
owner: ai-agent
depends_on: ["007", "009"]
requirements: ["RF-024", "RF-025", "RF-026", "RF-027", "RF-028"]
approval: "Usuário aprovou explicitamente as implementações 010 a 013 em 2026-07-23 e autorizou execução sequencial até a conclusão."
---

# Especificação

## Objetivo e escopo

Materializar a borda HTTPS e o contrato operacional do serviço web representados no TO-BE. O resultado deve deixar somente o Next.js publicamente acessível, manter o worker em rede privada, validar configuração de produção no início do processo e produzir imagens imutáveis com rollout e rollback verificáveis.

## Fora de escopo

- Alterar regras de agendamento, autenticação de pacientes ou autorização interna.
- Comprar domínio, emitir certificados, cadastrar secrets ou executar deploy real.
- Substituir EasyPanel, Supabase, Google Calendar, Evolution API ou OpenAI.
- Aumentar réplicas sem medição e aprovação do ambiente.

## Requisitos e critérios

- **RF-024 — Borda única:** tráfego público deve terminar em uma borda HTTPS e alcançar somente o serviço web.
  - **CA-024:** a configuração local/deploy não publica a porta do worker; headers encaminhados são aceitos somente segundo contrato documentado e testado.
- **RF-025 — Configuração fail-fast:** web e worker devem rejeitar configuração crítica ausente, insegura ou incompatível com produção antes de atender trabalho.
  - **CA-025:** testes cobrem URLs públicas HTTPS, chaves mínimas, origem confiável, portas e diferenças entre desenvolvimento e produção.
- **RF-026 — Segredos externos:** secrets devem entrar somente em runtime e nunca integrar imagem, build arg público, log ou artefato de CI.
  - **CA-026:** scanner e testes de configuração detectam exposição; documentação lista origem, consumidor e rotação sem registrar valores.
- **RF-027 — Artefatos imutáveis:** web e worker devem ser construídos da mesma revisão, identificados por digest e promovidos sem rebuild.
  - **CA-027:** CI gera os dois artefatos, verifica usuário não-root, healthcheck e registra metadados de revisão/digest.
- **RF-028 — Rollout seguro:** implantação deve usar liveness, readiness, smoke e janela de observação com rollback por digest.
  - **CA-028:** runbook e checks automatizáveis impedem promoção com readiness, configuração ou smoke inválidos.

## Restrições

- Nenhuma mudança externa de DNS, TLS, secrets ou produção nesta implementação local.
- Não confiar cegamente em `x-forwarded-*`; o contrato da borda deve ser explícito.
- Imagens continuam não-root e sem persistência local de dados do produto.

## Riscos

- Configuração incorreta de proxy pode alterar origem, cookies seguros ou rate limiting.
- Readiness excessivamente rígida pode bloquear rollout por dependência opcional.
- Publicação de imagem ou alteração de secret exige aprovação separada.
