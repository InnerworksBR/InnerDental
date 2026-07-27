# Plano

## Estratégia

Definir contratos internos estáveis, encapsular a Evolution API, persistir inbox/outbox idempotentes e executar um worker TypeScript separado que reivindica mensagens, aplica retry com backoff e agenda lembretes. A IA classifica intenção, mas respostas críticas passam por allowlist de dados.

## Arquivos previstos

`src/integrations/evolution/`, `src/domain/knowledge/`, webhook/API internas, migrations, `worker/`, testes/fixtures e documentação operacional.

## Sequência reversível

Adapter/contratos → webhook idempotente → consumidor da outbox → links/OTP → notificações → conhecimento → intent/fallback → lembretes.

## Testes e validações

Contrato Evolution, assinatura/replay, aliases, prompt adversarial, concorrência/retries da outbox, desligamento seguro do worker e sandbox ponta a ponta.

## Rollback

Pausar o worker e os webhooks, preservar inbox/outbox e encaminhar mensagens para atendimento humano. Nenhuma mensagem pendente é apagada.

## Aprovações necessárias

Aprovar `spec.md`, versão/configuração Evolution, estratégia de execução e health check do worker, janela de lembrete e canal humano.
