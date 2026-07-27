# Matriz de aceite integrada

Estado em 2026-07-16. “Local” significa testes/doubles e não substitui sandbox das integrações.

| CA | Evidência atual | Estado |
|---|---|---|
| CA01 | slots unitários + gateway Calendar | local aprovado; sandbox pendente |
| CA02 | testes de sobreposição em `availability-slots.test.ts` | local aprovado; sandbox pendente |
| CA03 | bloqueio de janelas consecutivas no cálculo de slots | local aprovado |
| CA04 | constraint/claim/idempotência e testes de corrida de appointments | local aprovado; E2E concorrente pendente |
| CA05 | gateway de criação e compensação testados | local aprovado; sandbox pendente |
| CA06 | contrato de evento inclui nome/telefone | local aprovado; inspeção sandbox pendente |
| CA07 | outbox + worker Evolution | local aprovado; entrega sandbox pendente |
| CA08 | atualização do mesmo `calendar_event_id` | local aprovado; sandbox pendente |
| CA09 | cancelamento e reconciliação | local aprovado; sandbox pendente |
| CA10 | eventos manuais entram como ocupados no gateway | local aprovado; sandbox pendente |
| CA11 | classificador retorna link; worker não lista horários | local aprovado |
| CA12 | respostas vêm de planos/aliases estruturados | local aprovado |
| CA13 | falha Calendar fecha criação e retorna indisponibilidade | local aprovado |
| CA14 | Playwright mobile 390×844, teclado, overflow e axe | local aprovado |
| CA15 | acesso por link/OTP, sem senha | local aprovado; OTP sandbox pendente |

## Bloqueadores para aceite final

- credenciais e sandbox Evolution para T-006/CA07/CA15;
- credenciais sandbox Google Calendar para CA01/02/04/05/06/08/09/10/13 e carga p95;
- projeto Supabase de homologação para validar papéis/RLS e concorrência ponta a ponta;
- ambiente EasyPanel, domínio/TLS e aprovação específica para ensaio de deploy/rollback;
- decisão da controladora sobre retenção e anonimização LGPD.
