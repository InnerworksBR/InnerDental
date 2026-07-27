# Validação — portal do paciente

## Evidências

- `pnpm test:e2e` — 6 cenários aprovados em viewport mobile e desktop: páginas inicial e de acesso sem violações axe WCAG 2 A/AA, navegação por teclado e agenda vazia sem overflow horizontal.
- `pnpm typecheck` — aprovado.
- `pnpm lint` — aprovado, com um aviso não bloqueante conhecido do React Hook Form e React Compiler.
- `pnpm test` — 27 testes unitários aprovados.
- `pnpm run build` — aprovado, incluindo `/acesso`, `/agenda` e `/api/professionals`.

## Checklist manual pendente para homologação

- Validar recebimento e expiração de OTP com provedor real.
- Validar criação, remarcação e cancelamento contra Google Calendar/Supabase de homologação.
- Conferir textos legais e identidade visual definitiva.
