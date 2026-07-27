# Validação — confirmação de presença e resumo diário

## Estado

Implementação concluída e validada localmente em 2026-07-27. Aplicação da migration, promoção do worker e envio pela Evolution permanecem pendentes de autorização e homologação externas.

## Evidências por tarefa

| Tarefa | Teste | Evidência | Resultado |
| --- | --- | --- | --- |
| T-1601 | CT-1601 | PostgreSQL 17 descartável aplicou migrations 001–016; confirmou uma consulta, repetiu como `already_confirmed` e resetou para `pending` após remarcação | aprovado |
| T-1602 | CT-1602 | PostgreSQL descartável criou uma solicitação e outra versão após remarcação; teste unitário verifica 20h, timezone e dedupe | aprovado |
| T-1603 | CT-1603 | `tests/unit/messaging.test.ts` cobre texto, botão, fallback, RPC e resposta ao paciente | aprovado |
| T-1604 | CT-1604 | PostgreSQL validou resumo e dedupe `1` depois `0`; testes cobrem total, pendentes, telefone legível e destino da doutora | aprovado |
| T-1605 | CT-1605 | `pnpm worker:check`, exemplos de ambiente, Compose, README e runbook | aprovado |
| T-1606 | CT-1606 | suíte, tipos, lint, build, preflight de migrations e scan de secrets | aprovado |
| T-1607 | CT-1607 | parser cobre título/telefone, duração, evento integral, transparência e passado; worker importa o cliente Google no Node 24 e na imagem | aprovado |
| T-1608 | CT-1608 | PostgreSQL 17 aplicou migrations 001–017 e executou importação, preservação do nome, atualização e reconciliação com `direct_calendar_flow_ok` | aprovado |
| T-1609 | CT-1609 | sincronização testada sem reconciliação após falha; configuração, build web e imagem do worker aprovados | aprovado |

## Comandos e resultados

- `pnpm vitest run tests/unit/messaging.test.ts tests/unit/appointment-confirmations-migration.test.ts` — 2 arquivos e 34 testes aprovados.
- `pnpm test` — 41 arquivos e 168 testes aprovados.
- `pnpm lint` — aprovado sem erros.
- `pnpm typecheck` — aprovado.
- `pnpm worker:check` — import direto do worker aprovado após corrigir a extensão do novo import runtime.
- `pnpm migrations:check` — 17 migrations ordenadas; preflight aprovado e 11 migrations sinalizadas para revisão de rollout.
- `pnpm build` — build de produção aprovado com 24 páginas/rotas geradas.
- `pnpm security:scan` — aprovado para 281 arquivos rastreados.
- PostgreSQL 17 Alpine descartável — migrations 001–017 aplicadas com `ON_ERROR_STOP`; fluxo direto concluiu com `direct_calendar_flow_ok`, incluindo update e remoção controlada.
- `docker build -f Dockerfile.worker -t luna-worker:calendar-sync-validation .` e importação do worker dentro da imagem — aprovados.
- `git diff --check` — aprovado.

## Arquivos alterados

- Dados: `supabase/migrations/202607270016_appointment_confirmations.sql`, `supabase/migrations/202607270017_direct_calendar_appointments.sql`.
- Worker e domínio: `worker/index.ts`, `worker/calendar-sync.ts`, `src/domain/appointments/calendar-import.ts`, mensageria e integração Google.
- Testes: testes de mensageria, migrations, parser, sincronizador e scripts de entrega.
- Configuração/operação: `.env.example`, `deploy/worker.env.example`, `compose.yaml`, `worker/README.md`, `docs/runbooks/deploy-vps-docker.md`.
- Produto/rastreabilidade: `docs/product/PRD.md`, `implementation/README.md`, `implementation/016-confirmacao-presenca/`.

## Limitações e riscos restantes

- A migration não foi aplicada em Supabase externo e nenhuma mensagem real foi enviada.
- Botões interativos continuam condicionados a `EVOLUTION_INTERACTIVE_MESSAGES=true`; com a flag desligada ou falha do endpoint, o texto “CONFIRMO” e o link são preservados.
- O resumo usa 08h de São Paulo por padrão e pode ser alterado por `WORKER_DAILY_SUMMARY_HOUR` antes do rollout.
- Eventos diretos só entram quando o título termina com telefone e duram 15 ou 30 minutos; a homologação deve orientar a doutora a usar, por exemplo, `Maria Silva — (13) 99999-9999`.
- O sincronizador consulta uma janela de oito dias a cada 60 segundos por padrão; falha de leitura adia o resumo matinal e nunca reconcilia aquele calendário parcialmente.
- Homologação deve verificar número da doutora, política de destinatários, entrega/retorno em clientes WhatsApp e comportamento com dados reais controlados.
