# Plano

## Estratégia

Inicializar uma aplicação única e modular, separar clientes browser/server, criar migrations aditivas e testar constraints/RLS antes das features.

## Arquivos previstos

`package.json`, `src/app/`, `src/lib/`, `src/types/`, `supabase/migrations/`, `supabase/seed.sql`, `.env.example`, configurações de lint/teste e `tests/`.

## Sequência reversível

Bootstrap → ferramentas → configuração tipada → schema → RLS → seeds → testes. Cada migration terá rollback documentado; nenhum dado real será usado.

## Testes e validações

Install limpo, lint, typecheck, build, testes unitários; banco local recriado; testes SQL de constraints e RLS; busca por segredos no bundle/logs.

## Rollback

Remover o scaffold antes de uso; após dados, reverter apenas por migrations compensatórias aprovadas.

## Aprovações necessárias

Aprovar `spec.md`, provedor/versão Node, gerenciador de pacotes e decisões D-001/D-002.
