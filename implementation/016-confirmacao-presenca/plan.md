# Plano

## Estratégia

1. Adicionar estado de presença e reset aditivo na tabela de consultas.
2. Enfileirar cada solicitação com `available_at` correspondente às 20h do dia anterior e chave ligada à versão do horário.
3. Tratar botão/texto de confirmação no worker por RPC atômica e gerar respostas seguras para sucesso, repetição, ausência ou ambiguidade.
4. Enfileirar e montar o resumo diário idempotente para o número operacional da doutora.
5. Cobrir horários, deduplicação, templates, worker, configuração e regressão.
6. Adicionar leitura periódica do Calendar ao worker e parser estrito de títulos, sem conceder escrita externa ao novo fluxo.
7. Importar/reconciliar por RPC transacional; somente uma leitura completa de cada calendário pode marcar projeções importadas como removidas.

## Arquivos previstos

- `supabase/migrations/202607270016_appointment_confirmations.sql`
- `supabase/migrations/202607270017_direct_calendar_appointments.sql`
- `worker/index.ts`
- `worker/calendar-sync.ts`
- `src/domain/appointments/calendar-import.ts`
- `src/integrations/google-calendar/service-account-auth.ts`, `auth.ts`, `http-gateway.ts`, `error.ts`
- `src/domain/messaging/intent.ts`, `src/domain/messaging/templates.ts`
- `.env.example`, `deploy/worker.env.example`, `compose.yaml`, `worker/README.md`
- `tests/unit/messaging.test.ts`, `tests/unit/appointment-confirmations-migration.test.ts`
- `tests/unit/calendar-appointment-import.test.ts`, testes de autenticação/gateway e migration.
- documentação da implementação 016, PRD e índice.

## Riscos e validações

- Migration será apenas preparada; aplicação externa exige autorização específica.
- Solicitações antigas após remarcação devem ser ignoradas comparando o horário do payload com a consulta atual.
- Telefones completos só podem aparecer na mensagem privada à doutora, nunca nos logs.
- Validar testes focados, suíte unitária, tipos, lint, migration preflight e build.
- Falha ou leitura parcial do Google Calendar não pode executar reconciliação destrutiva; validar explicitamente esse caminho.
- O worker passa a receber credenciais Google já usadas pelo web; secrets continuam fora de logs e artefatos.
