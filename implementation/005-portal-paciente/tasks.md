# Tarefas

- [x] **T-001:** Criar design base e shell responsivo/acessível.
  - **Evidência:** `PortalShell`, estilos mobile-first, foco visível, alvos mínimos e reduced motion; Playwright/axe aprovados.
- [x] **T-002:** Implementar acesso por token e solicitação/verificação de OTP.
  - **Evidência:** página `/acesso` usa React Hook Form/Zod e as APIs de solicitação/verificação existentes; sem telefone na URL.
- [x] **T-003:** Implementar início e estados de consultas futuras.
  - **Evidência:** `/agenda` lista consultas da sessão e possui estado vazio sem ações inválidas.
- [x] **T-004:** Implementar jornada de marcação com hold e revisão.
  - **Evidência:** seleção de profissional/data/slot, criação de hold e confirmação idempotente pela API de consultas.
- [x] **T-005:** Implementar jornadas de remarcação e cancelamento.
  - **Evidência:** ações explícitas por consulta chamam as rotas de remarcação e cancelamento, com mensagens de conflito/política.
- [x] **T-006:** Validar acessibilidade, responsividade e estados extremos.
  - **Evidência:** `tests/e2e/portal.spec.ts`: 6 cenários aprovados em mobile e desktop, com axe, teclado e verificação de overflow no estado vazio.

## Limite de evidência

Os fluxos de integração foram exercitados por contrato/mocks locais. Google Calendar, envio de OTP e Supabase reais permanecem dependentes de ambiente configurado.
