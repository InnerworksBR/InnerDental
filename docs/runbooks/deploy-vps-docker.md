# Deploy separado em VPS com Docker

Versão 1.0 — preparação para homologação. Este runbook não autoriza acesso à VPS, alteração de DNS, aplicação de migration ou deploy em produção. Essas ações exigem aprovação específica do ambiente.

## Pré-requisitos

- VPS Linux x86_64 com Docker Engine 24+ e Docker Compose 2.20+, no mínimo 2 vCPU, 2 GiB de RAM e 10 GiB livres.
- Repositório enviado para uma pasta dedicada da VPS e revisão imutável registrada em `APP_REVISION`.
- Responsável, janela, canal de incidente e tag anterior conhecida.
- Backup recente do Supabase com restore previamente validado.
- Domínio apontado para a VPS e proxy HTTPS. O exemplo `deploy/Caddyfile.example` pressupõe Caddy instalado no host e publica apenas o web; o worker não recebe domínio nem porta pública. Se o proxy também estiver em contêiner, conecte-o a uma rede Docker externa compartilhada em vez de abrir a porta do worker.
- `deploy/web.env` e `deploy/worker.env` criados a partir dos exemplos, com permissão `600`, fora de commits e anexos.
- Migrations ausentes identificadas. Para esta versão, confirmar especialmente `202607270014_management_soft_deactivation.sql` e `202607270015_handoff_notifications.sql`.

## Artefatos e isolamento

| Serviço | Dockerfile | Compose | Porta | Health | Usuário |
|---|---|---|---:|---|---|
| web | `Dockerfile.web` | `deploy/web.compose.yaml` | `127.0.0.1:3000` por padrão | `/api/health/live` e `/api/health/ready` | `nextjs` 1001 |
| worker | `Dockerfile.worker` | `deploy/worker.compose.yaml` | nenhuma pública | `/health` interno em 3001 | `node` |

Os projetos Compose são independentes (`luna-web` e `luna-worker`). Ambos usam filesystem somente leitura, `/tmp` temporário, capabilities removidas, limite de processos/CPU/memória e rotação local de logs. O Supabase e a Evolution são externos; nenhum volume de dados da aplicação deve ser criado na VPS.

## Build e configuração

Na raiz do repositório na VPS:

```bash
cp deploy/web.env.example deploy/web.env
cp deploy/worker.env.example deploy/worker.env
chmod 600 deploy/web.env deploy/worker.env
```

Preencher os arquivos sem reutilizar placeholders. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` são incorporados no build web; alterá-los exige novo build. `HANDOFF_NOTIFICATION_PHONE` existe somente no worker. Em homologação, manter `WORKER_RECIPIENT_POLICY=allowlist` e incluir apenas números autorizados.

Validar os manifests sem iniciar contêineres:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml config --quiet
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml config --quiet
```

Construir separadamente a partir da mesma revisão:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml build --pull web
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml build --pull worker
```

Checkpoint: registrar `APP_REVISION`, `IMAGE_TAG` e os IDs exibidos por:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml images
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml images
```

Se `WEB_IMAGE_REPOSITORY` ou `WORKER_IMAGE_REPOSITORY` apontarem para um registry, autenticar no registry fora do histórico do shell.

## Secrets e migrations

Nunca usar secrets como build args. Os únicos build args do web são os dois valores públicos do Supabase e a revisão; o worker recebe apenas a revisão.

Antes do rollout:

```bash
pnpm migrations:check
pnpm test
```

Aplicar somente migrations ausentes, em ordem, pela ferramenta oficial vinculada ao projeto Supabase ou pelo SQL Editor autorizado. Registrar checksum e resultado. Não reaplicar o schema inicial em banco existente e não tentar rollback com `DROP`, `DELETE` ou `TRUNCATE`; o rollback de schema é forward-fix revisado.

Checkpoint obrigatório: a RPC `replace_availability_rules` deve existir antes de testar a gestão de horários, e `enqueue_human_handoff` deve existir antes de iniciar o worker novo.

## Deploy

Exige aprovação explícita do ambiente imediatamente antes destes comandos.

Subir primeiro o web:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml up -d --no-deps web
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:3000/api/health/live
curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready
```

Somente com liveness e readiness em `200`, subir o worker:

```bash
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml up -d --no-deps worker
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml ps
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml exec -T worker node -e "fetch('http://127.0.0.1:3001/health').then(async r=>{console.log(r.status,await r.text());if(!r.ok)process.exit(1)})"
```

Se o proxy HTTPS estiver na própria VPS, manter `WEB_BIND_ADDRESS=127.0.0.1`. Não expor a porta 3001. Configurar o webhook Evolution para `https://<domínio>/api/webhooks/evolution` somente após TLS válido e health aprovado.

## Health check e smoke test

Executar contra o domínio publicado:

```bash
SMOKE_BASE_URL=https://agenda.example.com.br pnpm smoke:deployment
```

Smoke funcional controlado:

1. Abrir página inicial, `/acesso`, `/agenda` e login interno.
2. Confirmar disponibilidade sem dias bloqueados/lotados e troca rápida de horários.
3. Com número de homologação allowlisted, enviar “oi” e validar resposta do bot.
4. Solicitar “Falar com equipe”; confirmar uma única mensagem no `HANDOFF_NOTIFICATION_PHONE` com nome, número e motivo.
5. Criar uma consulta de teste autorizada, confirmar Google Calendar, visualização semanal e mensagem de confirmação; cancelar ao final pelo fluxo normal.
6. Verificar logs sanitizados sem telefone, mensagem, token, OTP ou secret.

Observar por pelo menos 15 minutos:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml logs --since=15m web
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml logs --since=15m worker
docker stats --no-stream
```

Abortar se ocorrer qualquer um destes critérios: readiness falhar em três verificações, restart contínuo, 5xx sustentado, worker sem consumir filas, duplicação de aviso, inconsistência de agenda, secret/PII em log ou uso de memória próximo do limite.

## Rollback

1. Preservar horários, IDs das imagens, health e logs sanitizados.
2. Restaurar `IMAGE_TAG` e `APP_REVISION` anteriores em cada arquivo de ambiente. Web e worker podem voltar separadamente.
3. Recriar primeiro o serviço afetado, sem remover volumes ou filas:

```bash
docker compose --env-file deploy/web.env -f deploy/web.compose.yaml up -d --no-deps --force-recreate web
docker compose --env-file deploy/worker.env -f deploy/worker.compose.yaml up -d --no-deps --force-recreate worker
```

4. Repetir health e smoke de leitura. Não reverter migrations aditivas; se a versão anterior não aceitar o schema expandido, interromper o rollback e preparar forward-fix.
5. Não usar `docker compose down -v`, `docker system prune` ou exclusão manual de inbox/outbox durante incidente.

## Validação pós-deploy

- Web e worker `healthy`, sem loop de reinício.
- Readiness web `200` e dependências `ok/configured`.
- Uma iteração do worker concluída e filas sem crescimento anormal.
- Agenda pública, painel interno, Google Calendar, mensagens ao paciente e handoff da doutora validados.
- Métricas, logs e alertas sem dados pessoais.

## Evidências e responsáveis

Registrar: solicitante, aprovador, ambiente, janela, revisão, tags e IDs das duas imagens, backup, migrations/checksums, saída dos health checks, smoke, observação de 15 minutos, decisão final e eventual rollback. Redigir tokens, números, mensagens e payloads antes de anexar evidências.
