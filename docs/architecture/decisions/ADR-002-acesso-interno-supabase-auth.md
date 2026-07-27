# ADR-002: Acesso interno por Supabase Auth e perfis de aplicação

- Status: proposed
- Data: 2026-07-17

## Contexto

RF-016 e RNF-015 exigem painel interno separado do acesso por telefone dos pacientes. O desenvolvedor deve gerenciar os acessos e poder convidar a dentista para operação.

## Decisão

Usar Supabase Auth para autenticação de colaboradores internos. A autorização ficará em `internal_profiles`, vinculada a `auth.users`, com papéis `owner` e `operator`. O `owner` convida/revoga usuários; o `operator` opera agenda e incidentes, mas não gerencia acesso. A API Next.js valida sessão e perfil no servidor antes de qualquer leitura ou mutação administrativa.

## Alternativas

- Reutilizar sessão de paciente: rejeitada, pois identidade por telefone não prova privilégio interno.
- Senha própria no Next.js: rejeitada, pois criaria armazenamento, recuperação e proteção de senha paralelos.
- Acesso direto do browser às tabelas administrativas: rejeitado, pois aumenta a superfície RLS e expõe mais dados operacionais.

## Consequências

Requer migration aditiva, políticas RLS, fluxo controlado para primeiro proprietário e convite. Melhora revogação e auditoria, mas depende da configuração de e-mail do Supabase para convites.

## Evidências

RF-016, RNF-012, RNF-015 e CA-016 do [PRD interno](../../product/PRD.md). Requer aprovação técnica antes de migration e provisionamento externo.
