# Plano

## Estratégia

1. Endurecer backup com criptografia, checksum, manifesto e interface de destino.
2. Endurecer restore isolado com guardas e relatório sanitizado.
3. Criar preflight de migrations e checklist de compatibilidade/lock.
4. Gerar manifesto de release ligando revisão, imagens, testes e schema.
5. Integrar verificações à CI sem publicar ou acessar ambientes externos.

## Arquivos previstos

- `scripts/backup-postgres.sh`, `scripts/verify-restore.sh`
- `scripts/check-migrations.mjs`, `scripts/create-release-manifest.mjs`
- `.github/workflows/ci.yml`, possível workflow manual sem credenciais padrão
- `.gitignore`, `.env.example`
- `docs/runbooks/backup-restore-lgpd.md`, `docs/runbooks/deploy-easypanel.md`
- novos testes unitários/contrato para scripts e manifestos

## Sequência reversível

1. Adicionar novos formatos e validações mantendo leitura do fluxo atual.
2. Introduzir criptografia/checksum como requisito de modo produção.
3. Adicionar gates de migration e manifesto na CI.
4. Atualizar runbooks e ensaiar apenas com banco descartável.

## Testes e validações

- Testes de guardas contra URL não isolada, secret ausente e arquivo adulterado.
- Backup/restore em PostgreSQL descartável sem dados pessoais.
- Validação estática das migrations, checksums e manifesto de release.
- Suíte completa, scan de secrets e verificação de arquivos ignorados.

## Rollback

Desabilitar automação nova e retornar aos scripts anteriores somente para ambiente local. Em ambiente real, preservar backups e usar forward-fix; nunca apagar artefatos como parte do rollback automático.

## Aprovações necessárias

- Aprovação desta especificação antes de código.
- Aprovação separada para chave de criptografia, destino, retenção, backup/restore, migration, registry ou deploy externo.
