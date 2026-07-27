# Validação

## Matriz de rastreabilidade

| Requisito | Critério | Tarefa | Teste | Evidência | Status |
|---|---|---|---|---|---|
| RF-039 | CA-039 | T-1301, T-1306 | CT-1301, CT-1306 | backup criptografado, checksum, manifesto e ensaio sintético | passed |
| RF-040 | CA-040 | T-1302, T-1306 | CT-1302, CT-1306 | guardas de alvo isolado, validação de schema/RLS e relatório sanitizado | passed |
| RF-041 | CA-041 | T-1303, T-1306 | CT-1303, CT-1306 | preflight de 12 migrations, recibo SHA-256 e runbook | passed |
| RF-042 | CA-042 | T-1304, T-1306 | CT-1304, CT-1306 | manifesto de release validado e integrado à CI | passed |
| RF-043 | CA-043 | T-1305, T-1306 | CT-1305, CT-1306 | runbooks de rollback e recuperação com evidências | passed |

## Comandos e resultados

- `pnpm test`: exit 0; 23 arquivos e 85 testes aprovados, incluindo backup/restore sintético ponta a ponta.
- `pnpm test:e2e`: exit 0; 6 cenários Playwright aprovados em desktop e mobile.
- `pnpm lint`, `pnpm typecheck` e `pnpm build`: exit 0; build de produção Next.js 16.2.11 concluído.
- `pnpm audit --audit-level high --prod`: exit 0; nenhuma vulnerabilidade conhecida.
- `pnpm security:scan`: exit 0; 231 arquivos verificados sem segredo detectado.
- `pnpm migrations:check`: exit 0; 12 migrations ordenadas, sem operação destrutiva; 7 sinalizadas para revisão de rollout.
- `pnpm observability:validate`, `docker compose config --quiet` e `bash -n scripts/backup-postgres.sh scripts/verify-restore.sh`: exit 0.
- O ensaio CT-1306 criou dump sintético, criptografou, verificou checksum, restaurou em alvo identificado como `restore_test` e validou contagens sanitizadas de tabelas/RLS.

## Achados e riscos restantes

- As 7 migrations sinalizadas pelo preflight exigem revisão operacional de lock/scan antes do rollout.
- Chave, destino, retenção e ambiente real continuam dependendo de decisões e aprovações externas.

## Limitações

- O ensaio usou ferramentas simuladas e dados sintéticos porque `age`, clientes PostgreSQL e Docker funcional não estão disponíveis neste host.
- Nenhum backup, restore, migration, publicação de imagem ou deploy externo foi executado.
- RPO/RTO não podem ser declarados sem ensaio autorizado com ferramentas reais e volume representativo.
