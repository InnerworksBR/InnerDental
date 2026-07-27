# Validação — ciclo de vida das consultas

## Evidências locais — 2026-07-16

| Área | Evidência | Resultado |
| --- | --- | --- |
| Criação | segunda consulta de disponibilidade, operação idempotente e criação do evento antes da persistência | implementado |
| Listagem | consulta filtrada pelo telefone da sessão e leitura do evento no Calendar antes da resposta | implementado |
| Remarcação | novo slot é confirmado antes da atualização do mesmo `calendar_event_id` | implementado |
| Cancelamento | antecedência mínima de 24 horas, exclusão idempotente do evento e mudança para `cancelled` | implementado |
| Falhas ambíguas | mutações que podem ter alcançado o Calendar ficam em `reconciliation_required`, com contexto persistido na operação | implementado |
| Auditoria/outbox | triggers transacionais existentes em `appointments` registram cada inserção/atualização e enfileiram a notificação | integrado |

## Comandos executados

- `pnpm typecheck` — aprovado.
- `pnpm test` — aprovado: 9 arquivos e 27 testes.
- `pnpm lint` — aprovado.
- `pnpm run build` — aprovado; inclui as rotas dinâmicas de remarcação e cancelamento.

## Limites de validação

Não foi chamado um Google Calendar real nem aplicado migration em Supabase remoto. A confirmação efetiva depende da conta de serviço Google, da Calendar API ativa e do calendário profissional compartilhado/configurado no ambiente de implantação.

Em 2026-07-17, a autenticação foi adaptada para OAuth 2.0 server-to-server com conta de serviço. A suíte completa passou com 13 arquivos/44 testes, lint exit code 0 (um warning preexistente), typecheck e build aprovados. Criação, listagem reconciliada, remarcação e cancelamento usam o token temporário centralizado.
