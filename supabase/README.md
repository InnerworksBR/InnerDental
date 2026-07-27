# Banco de dados local

As migrations vivem em `supabase/migrations/` e devem ser aplicadas em ordem cronológica, somente em banco descartável ou em ambiente autorizado.

## Rollback

A migration inicial é destinada a banco vazio. Após qualquer ambiente conter dados, o rollback deverá ser uma migration compensatória aprovada; não execute `DROP` automático.
