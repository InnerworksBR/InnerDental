# Painel interno

## Pré-requisitos

- Aplicar a migration `202607170010_internal_operations.sql` no projeto Supabase Cloud pela ferramenta oficial de migrations/SQL Editor autorizada.
- Manter `SUPABASE_SECRET_KEY` somente no servidor. Ela não pode ser exposta no navegador, worker, logs ou repositório.
- Confirmar que as credenciais de service account do Google Calendar estão configuradas e que o calendário foi compartilhado com essa conta.

## Primeiro proprietário

1. No Supabase Auth, crie manualmente o usuário do desenvolvedor com e-mail e senha. Não habilite auto-cadastro público.
2. Copie o UUID em `Authentication > Users`.
3. Depois de aplicar a migration, no SQL Editor execute, substituindo o UUID:

```sql
insert into public.internal_profiles (user_id, role, active)
values ('UUID_DO_USUARIO', 'owner', true);
```

4. Acesse `/interno/login` e entre com esse usuário. O endereço `/interno` deve abrir o painel; um usuário sem perfil deve voltar ao login.

## Smoke test seguro

1. Confirme que agenda e atividade exibem telefones mascarados.
2. Registre e encerre um incidente de teste.
3. Somente em um calendário sandbox, bloqueie um dia sem consultas. Confirme que foi criado um evento de dia inteiro; o fim do evento deve ser o dia seguinte (modelo do Google Calendar).
4. Tente a mesma data/profissional outra vez: a operação deve retornar conflito, sem criar segundo evento.

## Rollback

Não faça `DROP` automático. Desabilite o acesso removendo/atualizando `internal_profiles.active`; depois remova a rota do deploy se necessário. Para um bloqueio criado, remova primeiro o evento correspondente no Google Calendar e registre a reconciliação antes de marcar o bloqueio como cancelado.

## Convites

O fluxo de convite/revogação para a dentista depende de uma autorização operacional separada para configurar e enviar e-mails do Supabase Auth. Até isso, somente o proprietário provisionado manualmente deve entrar.
