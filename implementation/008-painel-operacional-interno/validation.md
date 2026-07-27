# Evidências de validação

## Local (2026-07-17)

- `pnpm run typecheck`: aprovado.
- `pnpm run lint`: aprovado com um aviso preexistente em `src/app/agenda/page.tsx` sobre `react-hook-form`/React Compiler.
- `pnpm test`: aprovado com 19 arquivos e 60 testes.
- `pnpm run security:scan`: aprovado; o scanner passou a respeitar `.gitignore` mesmo fora de um repositório Git e continua examinando o código de produção.
- `pnpm run build`: aprovado; rotas internas e APIs administrativas foram compiladas.
- Nenhum segredo, migration remota, usuário Auth, convite, e-mail ou evento Google Calendar real foi criado nesta implementação.

## Pendências externas antes de habilitar usuários

- Aplicar e validar a migration no Supabase Cloud (incluindo RLS e constraints).
- Provisionar manualmente o primeiro `owner` conforme `docs/runbooks/painel-interno.md`.
- Executar smoke test do bloqueio em Calendar sandbox e confirmar reconciliação para falha parcial.
- Autorizar separadamente configuração/envio de convites reais do Supabase Auth.

## Eventos criados diretamente no Calendar — 2026-07-27

- O adapter passou a projetar ID, título, intervalo, all-day e transparência dos eventos; eventos cancelados são ignorados e eventos transparentes não bloqueiam disponibilidade.
- A agenda administrativa deduplica eventos associados a consultas e bloqueios internos e destaca os eventos restantes como “direto na agenda”, com título limitado e telefone mascarado.
- Falha total ou parcial do Google Calendar é informada no painel, preservando a visualização dos dados internos.
- `google-calendar-gateway.test.ts`, `admin-projections.test.ts` e a suíte completa foram aprovados; total de 25 arquivos e 105 testes.
- `pnpm run test:e2e`: 8 cenários aprovados em mobile e desktop; a agenda interna com autenticação real ainda depende do smoke de homologação.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run security:scan` e `pnpm run build`: aprovados.
- Limite: a leitura não foi exercitada contra um Google Calendar real nesta rodada; depende de smoke autorizado em homologação.

## Agenda semanal por dia — 2026-07-27

- O percentual demonstrativo por profissional foi removido e substituído pela relação real de segunda a domingo, com contagem e linha do tempo para cada dia.
- Consultas internas, eventos criados diretamente no Google Calendar e bloqueios são agrupados pela data `America/Sao_Paulo`; dias vazios continuam visíveis com estado explícito.
- `admin-week.test.ts` cobre segunda–domingo, virada de mês e a fronteira entre UTC e a data da clínica.
- `pnpm test`: 26 arquivos e 107 testes aprovados; `pnpm run test:e2e`: 8 cenários aprovados em mobile e desktop.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run security:scan` e `pnpm run build`: aprovados.
- Limite: o painel interno autenticado não possui fixture E2E local; a renderização com dados reais continua dependendo do smoke autorizado em homologação.
