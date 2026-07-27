# Decisões

- **D-001 — Proposta:** monólito modular Next.js com App Router e Route Handlers para o MVP. **Estado:** pendente de aprovação.
- **D-002 — Proposta:** PostgreSQL/Supabase como fonte transacional; Google Calendar como fonte de ocupação. Divergências ficam explícitas e auditadas. **Estado:** pendente de aprovação.
- **D-003 — Confirmada pelo PRD:** timezone de negócio `America/Sao_Paulo`, persistência de instantes em UTC.
- **D-004 — Proposta:** outbox no banco para notificações, evitando acoplá-las à transação do Calendar. **Estado:** pendente de aprovação.
- **D-005 — Executada em 2026-07-16:** usar pnpm 11.6.0, Node 24, Next 16.2.10, React 19.2.7, Tailwind 4.3.3, ESLint 9.39.5, TypeScript 5.9.3 e Vitest 4.1.10. A solicitação do usuário foi executar a implementação 001 em ambiente local; impacto limitado ao scaffold e dependências, com rollback pela remoção dos arquivos/lockfile ainda sem dados. `sharp` e `unrs-resolver` mantêm scripts de build explicitamente negados no `pnpm-workspace.yaml`.
- **D-006 — Executada em 2026-07-16:** adotar `@supabase/supabase-js` 2.110.7, `@supabase/ssr` 0.12.3 e Zod 4.4.3. A chave publicável é a única disponível ao browser; `SUPABASE_SECRET_KEY` é validada e usada apenas em módulo com `server-only`. Não foram criadas ou informadas credenciais reais.
- **D-007 — Executada em 2026-07-16:** a migration inicial é aditiva para banco vazio, usa UUIDs gerados por `pgcrypto`, instantes `timestamptz`, durações fixas de 15 minutos e uma unique partial index para holds em estado `active`. O rollback em ambiente com dados será feito somente por migration compensatória aprovada. **Validação PostgreSQL: aprovada em banco descartável.**
- **D-008 — Executada em 2026-07-16:** RLS será habilitada e forçada em todas as tabelas, sem policies para `anon` ou `authenticated`. Acesso aos dados ocorrerá somente pelas Route Handlers usando a credencial de servidor. Esta é uma decisão de menor privilégio enquanto não existe vínculo verificável entre `auth.uid()` e `patients`; uma futura autenticação Supabase direta exigirá nova revisão de RLS.

Pendências: projeto/ambientes Supabase, Node e gerenciador de pacotes, política de retenção LGPD.
