# Runbook de deploy no EasyPanel

Versão 1.0 — preparação de homologação. Este documento não autoriza deploy, DNS, TLS, migration ou produção.

## Pré-requisitos

- Responsável e janela registrados; commit/tag imutável selecionado.
- Backup recente com restore isolado aprovado.
- Domínio de homologação e TLS gerenciado pelo EasyPanel.
- Secrets cadastrados no EasyPanel, nunca em build args: `SUPABASE_SECRET_KEY`, `AUTH_SESSION_SECRET`, `GOOGLE_PRIVATE_KEY`, `OTP_ENCRYPTION_SECRET`, `EVOLUTION_API_KEY`, `HANDOFF_NOTIFICATION_PHONE`, `METRICS_TOKEN`.
- Configurar `GOOGLE_CALENDAR_ID` e `GOOGLE_SERVICE_ACCOUNT_EMAIL` somente no serviço web. O calendário deve estar compartilhado com a conta de serviço com permissão para alterar eventos.
- Valores públicos `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` fornecidos também como build args do serviço web.
- Manifesto de release presente com revisão, digests web/worker, recibo de testes, checksums do lockfile e migrations. `pnpm migrations:check` deve passar antes da janela.

## Serviços

Na borda, configure `TRUST_PROXY=true` somente quando `PORTAL_BASE_URL` corresponder exatamente ao host HTTPS publicado pelo EasyPanel. O worker não recebe domínio nem porta pública.

| Serviço | Dockerfile | Porta | Health | Usuário | Persistência |
|---|---|---:|---|---|---|
| `luna-web` | `Dockerfile.web` | 3000 | `/api/health/live`; readiness `/api/health/ready` | `nextjs` (1001) | nenhuma |
| `luna-worker` | `Dockerfile.worker` | 3001 interna | `/health` | `node` | nenhuma |

O Supabase é externo. Não criar volume local para dados do produto. Expor somente o serviço web pelo proxy; health e métricas do worker ficam na rede privada.

Crie dois **App Services** a partir do mesmo repositório e da mesma revisão. Em **Fonte > Build**, selecione `Dockerfile` e informe obrigatoriamente o caminho relativo:

- web: `Dockerfile.web`, domínio configurado e proxy na porta `3000`;
- worker: `Dockerfile.worker`, sem domínio, sem porta publicada e uma réplica inicial.

Não existe intencionalmente um arquivo chamado apenas `Dockerfile` na raiz. Assim, um serviço sem o caminho explícito falha no build em vez de iniciar acidentalmente a aplicação web no lugar do worker.

## Build e configuração

Antes do rollout, execute `pnpm config:verify` com a configuração de runtime injetada. O comando relata apenas nomes e categorias inválidas, nunca valores.

1. Construir as duas imagens a partir da mesma revisão e registrar digest.
2. Configurar CPU/memória iniciais: web 0,5 CPU/512 MiB; worker 0,25 CPU/256 MiB. Ajustar somente após medição.
3. Configurar restart `unless-stopped`, uma réplica inicial e health checks acima.
4. Configurar domínio HTTPS e redirecionamento HTTP→HTTPS. Confirmar HSTS somente depois de TLS válido.
5. Aplicar migrations aditivas em etapa separada, com evidência. Não fazer rollback destrutivo automático de banco.

## Deploy e checkpoints

O gate HTTP mínimo pode ser executado com `SMOKE_BASE_URL=https://<host> pnpm smoke:deployment`; ele exige liveness e readiness 200.

1. Exige aprovação específica do ambiente imediatamente antes da ação.
2. Implantar web; esperar liveness saudável e readiness 200.
3. Implantar worker; esperar health saudável e confirmar um ciclo de polling sem falha.
4. Executar smoke: página inicial, `/acesso`, disponibilidade autenticada, criação controlada, confirmação pendente/processada e correlação nos logs.
5. Observar por 15 minutos: 5xx, readiness, falhas do worker e latência p95.

Abortar se readiness falhar por 3 checks, houver segredo/PII em log, qualquer consulta inconsistente, 5xx sustentado ou worker sem consumir.

## Rollback

1. Parar o rollout e preservar logs sanitizados/timestamps.
2. Selecionar o digest anterior conhecido e saudável para web e worker.
3. Fazer rollback da aplicação; não reverter migration com DROP/DELETE.
4. Repetir liveness, readiness e smoke de leitura.
5. Se incompatibilidade de schema impedir rollback, aplicar migration compensatória previamente revisada ou manter versão nova isolada até decisão.

O rollback não apaga inbox/outbox, leases, auditoria, backups ou eventos externos. Registre revisão/digests anterior e atual, recibo de migration, motivo, horário, health/readiness, smoke e estado das filas. Se a versão anterior não for compatível com o schema expandido, não force o rollback: isole a versão nova e prepare forward-fix.

## Evidências

Registrar solicitante, aprovador, ambiente, tag/digest, horário, backup usado, respostas de health, resultado do smoke, métricas dos 15 minutos, decisão final e eventual rollback. Remover tokens e PII dos anexos.
