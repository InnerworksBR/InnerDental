# Validação

## Matriz

| Requisitos | Testes | Status |
|---|---|---|
| RF-047–RF-056, RNF-017 | CT-1501–CT-1510 | passed_local |

## Evidências

Execução local concluída em 2026-07-27:

- `pnpm test`: 33 arquivos e 126 testes aprovados.
- `pnpm run test:e2e`: 10 cenários Playwright aprovados em desktop e mobile, incluindo axe, disponibilidade, cache de horários e consulta conjunta.
- `pnpm run typecheck`: aprovado.
- `pnpm run lint`: aprovado.
- `pnpm run build`: build Next.js de produção aprovado; rota `/api/admin/management` incluída.
- `pnpm run security:scan`: aprovado em 262 arquivos rastreados.
- `pnpm run worker:check`: aprovado.
- `pnpm run migrations:check`: 14 migrations ordenadas; migration 014 reconhecida e revisão de rollout sinalizada conforme esperado.

Cobertura específica:

- Domínio: normalização de aliases, conflitos, sobreposição de agenda e fronteiras dos comandos.
- Banco: desativação lógica aditiva, ausência de `DROP`/`DELETE` na migration e substituição transacional das regras semanais.
- API: leitura interna, mutações owner-only e correção limitada de paciente pelo operador.
- Regressão: consumidor de aliases do WhatsApp, exceções de disponibilidade e scripts de entrega.

## Pendências externas

- A migration `202607270014_management_soft_deactivation.sql` não foi aplicada a um Supabase compartilhado.
- Convites reais, alteração de papéis reais e deploy não foram executados.
- O smoke test autenticado do novo painel depende da migration aplicada e de contas de teste owner/operator. O E2E local cobriu as jornadas públicas existentes, mas não simulou o Supabase Auth administrativo.

## Revisão de UX do portal interno — 2026-07-27

- O painel deixou de herdar o quadro de celular de 470 px no desktop e passou a usar um workspace responsivo com sidebar persistente e conteúdo de até 1480 px.
- A visão diária ganhou hierarquia de página, indicadores, linha do tempo e ação rápida em colunas; a semana passou a usar duas ou três colunas conforme a largura.
- A central de gestão ganhou navegação vertical no desktop, feedback distinto de sucesso/erro, carregamento explícito e formulários mais legíveis.
- O bloqueio de dia inteiro passou a usar revisão contextual com profissional e data, sem `confirm()` genérico, e atualiza a página após sucesso.
- Foram adicionados link de salto, foco visível, `aria-current`, regiões rotuladas, alertas semânticos e respeito a `prefers-reduced-motion`.
- `pnpm test`: 34 arquivos e 129 testes aprovados, incluindo 3 verificações específicas do shell interno.
- `pnpm run typecheck`, `pnpm run lint` e `pnpm run build`: aprovados.
- `pnpm run test:e2e`: 10 cenários públicos aprovados em desktop e mobile.
- Limitação: inspeção visual e axe do painel autenticado não foram executados sem uma conta de teste e a migration aplicada; não se declara conformidade WCAG completa.
