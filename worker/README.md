# Worker de mensageria

Processo separado do Next.js que consome `notification_outbox` e `whatsapp_inbox`, entrega mensagens pela Evolution API, agenda lembretes e sincroniza consultas criadas diretamente no Google Calendar.

## Execução local

Configure as variáveis documentadas em `.env.example` e execute `pnpm worker`. O health check fica em `GET /health` na porta `WORKER_HEALTH_PORT`. Métricas Prometheus ficam em `GET /metrics` e exigem `Authorization: Bearer <METRICS_TOKEN>`.

## Concorrência, retry e desligamento

As funções PostgreSQL usam `FOR UPDATE SKIP LOCKED`, permitindo múltiplas instâncias sem reivindicar a mesma linha. Falhas voltam a `failed` com backoff exponencial limitado a 60 segundos. `SIGTERM` e `SIGINT` interrompem novas iterações e fecham o servidor de health check.

Em um terminal local, os logs usam automaticamente um formato legível e colorido, com nível, serviço, evento, contagens e duração. Em produção, permanecem em JSON por linha para coleta estruturada. Telefones, mensagens, OTPs, tokens e cabeçalhos sensíveis são redigidos antes da emissão.

Use `LOG_LEVEL=debug` para acompanhar o início de cada processamento. `LOG_FORMAT=pretty` força o formato amigável e `LOG_FORMAT=json` força JSON. As cores podem ser controladas por `LOG_COLOR=always|never|auto`; a variável padrão `NO_COLOR` também é respeitada.

`WORKER_RECIPIENT_POLICY` é obrigatório e aceita `allowlist` ou `all`. Use `allowlist` em sandbox, preenchendo `WORKER_ALLOWED_RECIPIENTS` com números E.164 sem o sinal de `+`; use `all` somente no ambiente aprovado para atender clientes reais. Na política restrita, o worker bloqueia inbox, OTP e notificações fora da lista; números nunca são incluídos nos logs.

`HANDOFF_NOTIFICATION_PHONE` é obrigatório e recebe o WhatsApp da doutora em formato E.164 brasileiro. Quando uma conversa precisa de atendimento humano, uma mensagem com nome cadastrado, telefone e motivo é enfileirada de forma idempotente e enviada diretamente a esse número. O mesmo destino recebe o resumo diário de confirmações, sem que os dados do paciente sejam escritos nos logs.

Cada consulta futura agenda uma solicitação de presença para as 20h do dia anterior em `America/Sao_Paulo`. O paciente confirma pelo botão ou escrevendo “confirmo”; a resposta é idempotente, vinculada ao telefone e não cancela consultas sem resposta. `WORKER_DAILY_SUMMARY_HOUR` define a hora inteira do resumo da doutora, de `0` a `23`, com padrão `8`.

O worker lê os próximos oito dias do Calendar a cada `WORKER_CALENDAR_SYNC_INTERVAL_MS` (padrão: 60 segundos). Um evento direto entra no fluxo somente quando bloqueia horário, não é de dia inteiro, dura 15 ou 30 minutos e termina em `Nome do paciente — telefone`. Exemplo: `Maria Silva — (13) 99999-9999`. Eventos inválidos são ignorados; remoções e mudanças são reconciliadas sem apagar histórico. Se a leitura falhar, o resumo da manhã é adiado para evitar contagem incompleta.

`EVOLUTION_INTERACTIVE_MESSAGES=true` habilita botões nativos. Enquanto estiver `false`, ou se o endpoint interativo falhar, o worker envia o mesmo conteúdo como texto. Antes de habilitar, valide a versão/integração da Evolution e teste respostas de botão em Android, iOS, WhatsApp Web e Desktop.

Cada claim novo recebe `lease_token`, `lease_owner` e expiração. A conclusão exige o token vigente; uma instância atrasada não sobrescreve o trabalho de outra. `WORKER_CONCURRENCY` limita o paralelismo local e `WORKER_LEASE_SECONDS` deve permanecer entre 30 e 900 segundos. Após seis tentativas, o item recebe `dead_lettered_at`, sai do retry automático e permanece visível no painel interno.

Rollout compatível: aplicar `202607230012_message_leases.sql`, `202607270015_handoff_notifications.sql`, `202607270016_appointment_confirmations.sql` e `202607270017_direct_calendar_appointments.sql`; configurar o telefone da doutora, as credenciais Google e os intervalos; confirmar as RPCs e somente então promover o worker. Para rollback, parar o worker novo e retornar ao digest anterior; o schema aditivo e todas as mensagens permanecem preservados.

## Rollback

Pare o serviço worker. Inbox e outbox permanecem persistidas para retomada; não apague mensagens pendentes. O processo web continua disponível e agendamentos confirmados não são revertidos por falhas de mensageria.
