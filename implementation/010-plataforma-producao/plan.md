# Plano

## Estratégia

1. Formalizar o contrato de borda e origem confiável em configuração tipada.
2. Consolidar validação fail-fast de web e worker sem expor valores sensíveis.
3. Endurecer Compose/Docker e separar claramente portas públicas e privadas.
4. Evoluir CI para produzir e verificar artefatos imutáveis da mesma revisão.
5. Atualizar runbook e testes de rollout/rollback sem executar ações externas.

## Arquivos previstos

- `src/lib/config/env.ts`, `src/lib/security/request-origin.ts`, `src/proxy.ts`
- `worker/index.ts`, `.env.example`, `compose.yaml`
- `Dockerfile.web`, `Dockerfile.worker`, `.github/workflows/ci.yml`
- `scripts/verify-runtime-config.mjs`, `scripts/smoke-deployment.mjs`
- `tests/unit/env.test.ts`, `tests/unit/request-origin.test.ts`, novos testes de deploy
- `docs/runbooks/deploy-easypanel.md`, `docs/architecture/architecture.md`

## Sequência reversível

1. Adicionar validações e testes sem alterar defaults de desenvolvimento.
2. Tornar o contrato de proxy configurável e documentado.
3. Aplicar endurecimento de containers e CI.
4. Adicionar checks de smoke e documentação.

Cada etapa deve ser compatível com a anterior; nenhuma migration é necessária.

## Testes e validações

- Unitários para env, origem, headers encaminhados e redaction.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm security:scan`.
- `docker compose config --quiet` e build dos dois containers.
- Smoke local com liveness/readiness e confirmação de porta privada do worker.

## Rollback

Reverter a revisão da aplicação e promover os digests anteriores. Configurações novas devem ter defaults seguros e não exigir remoção destrutiva.

## Aprovações necessárias

- Aprovação desta especificação antes de editar código.
- Aprovação separada para DNS/TLS, secrets, registry, infraestrutura ou deploy real.
