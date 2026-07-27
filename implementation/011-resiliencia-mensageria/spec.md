---
id: "011"
title: "Resiliência e escalabilidade da mensageria"
status: completed
priority: critical
risk: critical
created_at: "2026-07-23"
updated_at: "2026-07-23"
owner: ai-agent
depends_on: ["009"]
requirements: ["RF-029", "RF-030", "RF-031", "RF-032", "RF-033"]
approval: "Usuário aprovou explicitamente as implementações 010 a 013 em 2026-07-23 e autorizou execução sequencial até a conclusão."
---

# Especificação

## Objetivo e escopo

Evoluir outbox/inbox e o worker para operação concorrente verificável, com lease explícito, fechamento protegido contra worker obsoleto, dead-letter operacional, retries limitados e métricas de backlog. A fila continua no PostgreSQL/Supabase e o worker continua proibido de decidir agenda.

## Fora de escopo

- Introduzir Kafka, RabbitMQ, n8n ou serviço externo de filas.
- Permitir que o worker crie, remarque ou cancele consultas.
- Reprocessar manualmente mensagens reais ou aplicar migration remotamente.
- Alterar o conteúdo clínico autorizado para respostas.

## Requisitos e critérios

- **RF-029 — Lease verificável:** cada claim deve identificar consumidor e expiração; apenas o dono vigente pode concluir a tentativa.
  - **CA-029:** teste concorrente prova que claim duplicado e ack de lease vencido não produzem sucesso incorreto.
- **RF-030 — Dead-letter explícito:** itens acima do limite devem sair do fluxo automático sem serem apagados.
  - **CA-030:** atividade administrativa mostra fila, motivo seguro, tentativas e instante terminal; reprocessamento permanece fora do escopo.
- **RF-031 — Retry seguro:** chamadas Evolution/OpenAI devem possuir timeout, classificação segura e backoff com jitter limitado.
  - **CA-031:** testes cobrem timeout, 429/5xx, erro permanente e ausência de loop infinito.
- **RF-032 — Escala horizontal:** múltiplos workers devem compartilhar a fila sem sobrescrever trabalho vigente.
  - **CA-032:** worker possui identidade efêmera, limite de concorrência e encerramento que não reivindica novos itens.
- **RF-033 — Sinais de fila:** backlog, idade do item mais antigo, claims, retries e dead-letters devem ser observáveis sem labels de alta cardinalidade.
  - **CA-033:** endpoint de métricas expõe sinais agregados e testes impedem telefone, mensagem ou ID como label.

## Restrições

- Migration somente aditiva e preparada para forward-fix.
- Payloads e PII nunca entram em logs, métricas ou incidentes.
- Nenhuma mensagem pendente é apagada durante rollout ou rollback.

## Riscos

- Mudança de lease envolve concorrência e compatibilidade entre versões do worker.
- Migration deve entrar antes do worker novo e requer backup/janela para ambiente compartilhado.
- Dead-letter sem processo operacional pode acumular itens silenciosamente; alertas dependem da implementação 012.
