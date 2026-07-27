# ADR-001: Worker para mensageria no lugar do n8n

- Status: accepted
- Data: 2026-07-16

## Contexto

O PRD previa n8n para fluxos do WhatsApp, lembretes, confirmações e sincronizações não críticas. O solicitante decidiu remover o n8n. A agenda continua transacional no backend e o Google Calendar permanece a fonte de ocupação.

## Decisão

Usar um worker TypeScript separado do processo web para consumir `notification_outbox`, entregar mensagens pela Evolution API e executar lembretes agendados. O worker reivindica mensagens com `claim_notification_outbox`, processa de modo idempotente e registra êxito/falha no banco.

O backend web cria consultas, tokens e outbox; o worker nunca decide horários, altera disponibilidade ou confirma consulta sem o fluxo transacional do backend.

## Alternativas

- n8n: removido por decisão do solicitante.
- Processar mensagens dentro das rotas web: rejeitado por acoplar latência/falhas externas à resposta do paciente.
- Serviço externo de filas: adiado; a outbox PostgreSQL já existe e reduz infraestrutura no MVP.

## Consequências

- O deploy terá dois processos: aplicação Next.js e worker.
- O worker precisará de health check, concorrência limitada, retry com backoff e logs redigidos.
- A Evolution API permanece encapsulada por adapter; nenhuma credencial será exposta ao portal.
- A implementação 006 deve substituir referências a workflows n8n por código/configuração do worker.

## Evidências

- Outbox e função de reivindicação foram criadas e validadas na implementação 001.
- Decisão explícita do solicitante em 2026-07-16.
