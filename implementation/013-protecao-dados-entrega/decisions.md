# Decisões

- 2026-07-23 — Backup de produção deve ser criptografado antes de sair do agente; transporte seguro não substitui criptografia do artefato.
- 2026-07-23 — Restore só é permitido em alvo explicitamente descartável; o script continuará falhando fechado.
- 2026-07-23 — Migrations são promovidas separadamente e rollback de schema usa forward-fix.
- 2026-07-23 — Fornecedor, retenção, chaves e ações externas permanecem pendentes de aprovação.
- 2026-07-23 — Usuário aprovou a implementação local; nenhum backup, restore, migration, registry ou deploy externo foi autorizado.
- 2026-07-23 — O gate de release encontrou advisories high em Next 16.2.10 e sharp 0.34.5; a autorização para concluir todas as implementações foi aplicada à atualização corretiva mínima Next/ESLint 16.2.11 e override sharp 0.35.0, sujeita à suíte completa e rollback pelo lockfile anterior.
- 2026-07-23 — A atualização corretiva passou em lint, tipos, 85 testes unitários, 6 E2E, build e auditoria sem vulnerabilidades conhecidas.
- 2026-07-23 — O ensaio local de recuperação é sintético e automatizado; o ensaio com ferramentas reais e volume representativo permanece gate de rollout externo.
