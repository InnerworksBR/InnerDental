# Observabilidade

## Perguntas e sinais

| Pergunta operacional | Sinal | Dimensões permitidas | Ação |
|---|---|---|---|
| O portal está atendendo? | `GET /api/health/live` | serviço | reiniciar somente se o processo não responder |
| É seguro receber novos agendamentos? | `GET /api/health/ready` | database, calendar | bloquear rollout e consultar integrações |
| O worker está consumindo filas? | `GET /health` do worker e `luna_worker_messages_total` | queue, result | verificar Supabase e Evolution |
| Há repetição de falhas? | `luna_worker_failures_total` e eventos JSON `*_failed` | queue/evento | seguir runbook de incidente; não registrar payload |
| O tráfego mudou? | `luna_http_requests_total` | method, area | comparar com baseline de homologação |

Todas as dimensões são de cardinalidade limitada. IDs de correlação podem aparecer somente em logs, nunca como label de métrica.

## Segurança e acesso

- `/api/metrics` e `/metrics` do worker exigem o mesmo `METRICS_TOKEN` em Bearer e não devem ser expostos publicamente.
- Logs não incluem telefone, corpo de webhook, texto de mensagem, OTP, cookie, Authorization ou segredo.
- Retenção, destino de logs, dashboards e alertas precisam ser aprovados no ambiente antes da publicação.

## Coleta versionada

O perfil opcional `observability` do Compose inicia Prometheus ligado apenas a `127.0.0.1`. Os alvos são `web:3000` e `worker:3001` no backplane; o Bearer é lido do secret externo `metrics_token`. Antes de promover configurações, execute `pnpm observability:validate`. Dashboards ficam em `ops/observability/dashboards/` e não contêm telefone, mensagem, payload ou correlation ID.

`PROMETHEUS_RETENTION` tem default local de sete dias. Retenção, armazenamento e acesso reais continuam exigindo aprovação do ambiente. Logs JSON devem ser coletados pelo runtime sem copiar stdout para artefatos públicos; o destino deve aplicar acesso mínimo e descarte aprovado. Para depuração local, `LOG_FORMAT=pretty` habilita a visualização legível e `LOG_LEVEL=debug` inclui o início de cada ciclo; produção deve manter `LOG_FORMAT=json`.

## SLI/SLO propostos para homologação

- Disponibilidade de leitura: 99,5% de respostas não-5xx em 30 dias.
- Latência de disponibilidade: p95 menor ou igual a 3 s, medida sem cache e com sandbox Calendar.
- Worker: nenhuma mensagem em `processing` além do lease; crescimento de falhas por 5 minutos exige investigação.

Os valores são proposta até existir baseline de homologação. Não são SLOs de produção aprovados.

## Alertas propostos

- readiness 503 por 3 verificações: impacto em novas marcações; runbook `docs/runbooks/deploy-easypanel.md`.
- worker unhealthy por 3 verificações ou falhas crescentes por 5 min: impacto em confirmação/OTP; runbook `docs/runbooks/incident-response.md`.
- p95 acima de 3 s por 10 min: impacto em disponibilidade; confirmar Calendar antes de escalar.

As regras executáveis em `ops/observability/alerts.yml` incluem owner, severidade, impacto, janela e runbook. Elas não executam restart, reprocessamento ou qualquer mitigação automática.
