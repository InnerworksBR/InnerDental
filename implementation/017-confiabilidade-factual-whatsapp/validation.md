# Validação local — implementação 017

Data: 2026-08-10

## Evidências

- Resolução de plano: candidatos múltiplos retornam `ambiguous`; nenhum plano é escolhido pela ordem do catálogo.
- Fatos verificados: `procedure_coverage` é carregada com plano, procedimento, aceitação e instruções. Cobertura ausente e negativa seguem rotas distintas e não recebem afirmação positiva.
- Respostas: preço sem fonte estruturada, pergunta sem fato e cobertura não confirmada usam fallback seguro; handoff continua via RPC idempotente existente.
- IA: recebe mensagem atual, uma FAQ verificada e contexto anterior somente com intenção/ação. Não recebe `message_text` histórico, catálogo completo nem cobertura. A saída é bloqueada para URL, termos críticos ou palavras factuais fora da FAQ.
- Evolution: o readiness consulta `GET /instance/connectionState/{EVOLUTION_INSTANCE}` sem envio e requer estado `open`.
- Observabilidade: o evento final inclui somente `factResolution`, `factSource` e `groundingResult`, além de campos operacionais já sanitizados.

## Comandos executados

| Comando | Resultado |
|---|---|
| `pnpm vitest run tests/unit/verified-facts.test.ts tests/unit/messaging.test.ts` | passou: 68 testes |
| `pnpm typecheck` | passou |
| `pnpm test` | passou: 48 arquivos, 222 testes |
| `pnpm exec eslint` nos arquivos alterados | passou |
| `pnpm worker:check` | passou |
| `pnpm security:scan` | passou: 309 arquivos rastreados |
| `pnpm migrations:check` | passou: 23 migrations ordenadas; 15 exigem revisão de rollout já conhecida |
| `pnpm observability:validate` | passou: 7 painéis |
| `git diff --check` | passou |
| `pnpm build` | passou |

`pnpm lint` para todo o repositório excedeu o limite local de 120 segundos sem emitir diagnóstico. O lint direcionado de todos os arquivos de código e teste alterados passou.

## Limitações e próxima homologação autorizável

- Não foi alterado `.env`, secret, nome de instância, banco externo ou deploy.
- Nenhuma mensagem WhatsApp foi enviada.
- O diagnóstico anterior da configuração local continua aplicável: a instância em `EVOLUTION_INSTANCE` não correspondia à instância aberta consultada. Com o novo readiness, essa divergência mantém a aplicação indisponível até uma correção operacional autorizada.
- Para homologar: confirmar o nome exato da instância com o responsável, ajustar a configuração mediante autorização, publicar, verificar `/api/health/ready` com `evolution: "ok"` e realizar smoke em sandbox autorizado.
