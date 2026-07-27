# Validação

Executada em 2026-07-20 no workspace local.

## Evidências

- `pnpm lint` — exit 0.
- `pnpm typecheck` — exit 0.
- `pnpm test` — exit 0; 20 arquivos e 67 testes aprovados.
- `pnpm test:e2e` — exit 0; 6 cenários aprovados em desktop/mobile.
- `pnpm build` — exit 0; build Next.js concluído e 22 rotas reconhecidas.
- `pnpm security:scan` — exit 0; 197 arquivos verificados.
- `pnpm audit --prod` — exit 0; nenhuma vulnerabilidade conhecida.
- `docker compose config --quiet` — exit 0.

## Limitações e rollout

- A migration `202607200011_audit_hardening.sql` foi validada estaticamente e por testes, mas não foi aplicada a banco compartilhado/produção porque backup, proprietário e janela não foram confirmados.
- A chave OpenAI presente no ambiente retornava 401 e precisa ser substituída pelo responsável.
- `PORTAL_BASE_URL` ainda precisa apontar para um domínio HTTPS público antes do deploy; o worker agora falha rápido em produção se receber localhost.
- Não há metadados Git no workspace, então não foi possível produzir diff/status Git confiável.
