# Backup, restore e direitos LGPD

## Backup

Executar em agente com `pg_dump`, `age` e destino externo montado. `DATABASE_URL` e `BACKUP_AGE_RECIPIENT` vêm do secret manager; `BACKUP_DESTINATION_DIR` aponta para o volume aprovado:

```sh
./scripts/backup-postgres.sh luna-YYYYMMDD-HHMM
```

O dump plaintext existe somente em diretório temporário modo 0700, é validado e criptografado com `age` antes da movimentação. A entrega contém `.dump.age`, `.sha256` e manifesto sanitizado. Falta de chave, destino ou ferramenta encerra sem produzir um backup declarado como válido. Retenção e descarte dependem da política aprovada do ambiente.

## Restore isolado

Criar banco descartável cujo URL contenha `restore_test`; nunca apontar para produção:

```sh
RESTORE_TEST_DATABASE_URL='postgresql://.../luna_restore_test' \
RESTORE_CONFIRM_ISOLATED=YES \
BACKUP_AGE_IDENTITY_FILE=/run/secrets/backup_age_identity \
./scripts/verify-restore.sh luna-YYYYMMDD-HHMM.dump.age luna-YYYYMMDD-HHMM.sha256
```

O script verifica checksum e catálogo antes de restaurar, rejeita URLs sem `restore_test` ou semelhantes a produção e gera relatório apenas com duração, total de tabelas e total protegido por RLS. Depois, executar smoke de leitura e destruir o ambiente isolado conforme a política autorizada.

## Gate de migrations e release

Execute `pnpm migrations:check` para validar ordem, checksum e DDL destrutivo. O recibo lista riscos de lock/scan, que exigem medição de volume e janela. A CI liga esse recibo aos testes e aos digests web/worker em `release-manifest.json`. Migrations são aplicadas separadamente; rollback de schema é sempre forward-fix revisado.

RPO/RTO só podem ser declarados depois do ensaio cronometrado com volume representativo.

## Direitos da pessoa titular

1. Validar identidade por canal aprovado e abrir solicitação auditável.
2. Mapear `patients`, `appointments`, `slot_holds`, `access_tokens`, inbox/outbox, handoffs e audit logs por identificador interno; não enviar dados por chat/log.
3. Para acesso/portabilidade, gerar exportação mínima, criptografada e com expiração.
4. Para correção, registrar antes/depois sem copiar PII para metadata.
5. Para exclusão/anonimização, obter decisão da controladora sobre obrigação de retenção e aprovação específica da ação destrutiva.
6. Aplicar procedimento revisado, preservar integridade referencial e registrar somente IDs opacos e resultado.

Não foi criada função automática de exclusão: a regra jurídica de retenção e o impacto em auditoria ainda não foram aprovados. Isso evita apagar dados ou quebrar histórico por inferência.
