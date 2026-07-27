# Plano

## Estratégia

1. Adicionar metadados de lease e dead-letter por migration aditiva.
2. Criar RPCs de claim/finalização que validem o token do lease.
3. Adaptar o worker com identidade, concorrência limitada, timeout e retry classificado.
4. Expor projeções administrativas e métricas agregadas.
5. Validar compatibilidade, concorrência e rollback por pausa do worker.

## Arquivos previstos

- `supabase/migrations/20260723*_message_leases.sql`
- `worker/index.ts`
- `src/integrations/evolution/client.ts`, `src/integrations/openai/chat.ts`
- `src/lib/admin/repository.ts`, `src/components/admin-console.tsx`
- `src/lib/observability/metrics.ts`
- `tests/unit/messaging.test.ts`, novos testes de migration/worker/admin
- `worker/README.md`, `docs/runbooks/incident-response.md`

## Sequência reversível

1. Aplicar schema/RPC compatível com o worker atual.
2. Implantar worker novo com lease protegido.
3. Habilitar projeções e métricas.
4. Manter colunas antigas durante todo o rollout.

## Testes e validações

- Testes estáticos da migration e testes de contrato dos RPCs.
- Unitários para classificação de falhas, jitter, timeout, lease e dead-letter.
- Testes de múltiplos consumidores e encerramento gracioso.
- Suíte completa, build e smoke do worker com Supabase controlado.

## Rollback

Parar consumidores, preservar filas e retornar ao digest anterior. O schema aditivo permanece; nenhuma linha ou coluna é removida.

## Aprovações necessárias

- Aprovação desta especificação antes de código.
- Aprovação separada, com backup e janela, antes de aplicar migration fora do workspace.
