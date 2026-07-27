# Validação — WhatsApp, worker e conhecimento

## Evidências locais

- `pnpm typecheck` — aprovado.
- `pnpm test` — 24 arquivos e 100 testes aprovados; 22 testes focados em mensageria.
- `pnpm lint` — aprovado, mantendo apenas o aviso conhecido do React Hook Form na implementação 005.
- `pnpm run build` — aprovado; rotas `/api/webhooks/evolution` e `/api/auth/link` incluídas.
- `node --check worker/index.ts` — aprovado no Node 24.
- PostgreSQL 17 descartável — migrations 001–009 aplicadas; lembrete deduplicado (`1`, depois `0`), segundo claim concorrente vazio e lease vencido recuperado.
- `docker build -f Dockerfile.worker -t luna-worker:local .` — aprovado.
- Imagem `luna-worker:local` — processo iniciou e permaneceu em execução com configuração fictícia, sem acessar serviços reais.
- `pnpm typecheck` e `pnpm lint` — aprovados após a revisão de UX do WhatsApp.
- `pnpm worker:check` — adapter/worker importado com sucesso.
- `docker compose config --quiet` com política `allowlist` fictícia — aprovado.
- `pnpm run build` — build Next.js 16 aprovado com 22 páginas/rotas geradas.
- `pnpm security:scan` — aprovado para 233 arquivos rastreados.

## Revisão de UX do WhatsApp — 2026-07-24

- Menu inicial com três ações objetivas e fallback textual.
- Links de agenda enviados como CTA quando `EVOLUTION_INTERACTIVE_MESSAGES=true`; texto preserva o link quando a flag está desligada ou o endpoint falha.
- Webhook normaliza respostas de botão, lista, template e native flow para ações estáveis.
- Áudio, imagem, vídeo, documento e sticker recebem orientação explícita em vez de descarte silencioso.
- OTP, confirmação, remarcação, cancelamento e lembrete usam hierarquia visual, data por extenso e ação de gerenciamento.
- `WORKER_RECIPIENT_POLICY=allowlist|all` torna explícita a restrição de sandbox ou o atendimento a clientes reais.
- Handoffs criam `human_handoff.created` de forma transacional e idempotente; o worker envia nome, telefone e motivo ao `HANDOFF_NOTIFICATION_PHONE`, com fallback de nome e sem PII nos logs.
- Respostas OpenAI usam Structured Outputs com `handoff_required`; a mensagem só promete continuidade humana quando o registro de handoff é criado.

## Rastreabilidade

| Critério | Evidência |
| --- | --- |
| CA-601 | classificador de agenda produz somente link opaco para o portal |
| CA-602 | `findStructuredAnswer` consulta planos/aliases/procedimentos/FAQs fornecidos pelo repositório |
| CA-603 | `external_id` único, `dedupe_key` único e claims com `SKIP LOCKED` |
| CA-604 | HMAC com comparação constante, Zod e ausência de payloads em logs |
| CA-605 | backoff, lease recuperável e falha de entrega não altera consulta |

## Limitações

Não houve chamada à Evolution API real, envio de WhatsApp ou aplicação em Supabase externo. A T-007 permanece aberta até o teste sandbox com credenciais fornecidas pelo responsável pelo ambiente.

Mensagens interativas permanecem desativadas por padrão. A homologação deve confirmar entrega e retorno em Android, iOS, WhatsApp Web e Desktop antes de definir `EVOLUTION_INTERACTIVE_MESSAGES=true` em produção.
