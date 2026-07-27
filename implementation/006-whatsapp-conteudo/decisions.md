# Decisões

- **D-001 — Executada:** bot/worker não busca, oferece, escolhe nem confirma horários.
- **D-002 — Executada conforme ADR-001:** worker TypeScript separado do processo web.
- **D-003 — Executada:** inbox/outbox persistentes, dedupe por evento/chave e claims concorrentes com lease recuperável.
- **D-004 — Executada:** classificação determinística de intenção; conteúdo crítico vem apenas de consultas estruturadas.
- **D-005 — Executada:** lembrete inicial 24 horas antes, idempotente por consulta.
- **D-006 — Executada:** OTP permanece com hash para autenticação e cópia cifrada temporária exclusivamente para entrega pelo worker.
- **D-007 — Aprovada em 2026-07-24 pelo solicitante:** adotar experiência híbrida no WhatsApp, com botões para escolhas objetivas, fallback textual, parsing de respostas interativas, tratamento explícito de mídia não suportada e templates mais legíveis. A ativação de mensagens interativas permanece condicionada a flag e homologação na instância Evolution.
- **D-008 — Aprovada em 2026-07-24 pelo solicitante:** substituir a allowlist implícita por política explícita `allowlist|all`; produção deve declarar conscientemente a política e sandbox permanece restrito por padrão documentado.
- **D-009 — Executada:** a resposta da OpenAI declara `handoff_required` em saída estruturada, evitando prometer atendimento humano sem criar o encaminhamento correspondente.

Pendências externas: versão/contrato da instância Evolution, credenciais sandbox, SLA e equipe responsável pelos encaminhamentos humanos.
