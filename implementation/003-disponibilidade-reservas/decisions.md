# Decisões

- **D-001 — Confirmada pelo PRD:** slot/duração do MVP de 15 minutos e timezone `America/Sao_Paulo`.
- **D-002 — Atualizada em 2026-07-17 com aprovação do solicitante:** o backend usa `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_PRIVATE_KEY` para assinar um JWT RS256, trocar por access token OAuth temporário e reutilizá-lo até próximo da expiração. `GOOGLE_CALENDAR_ID` é fallback para o `calendar_id` do profissional. Nenhuma credencial é registrada ou exposta.
- **D-003 — Implementada:** holds possuem TTL de 5 minutos e exclusividade garantida no PostgreSQL, não no worker.
- **D-004 — Implementada:** falha ou timeout do Calendar resulta em `503` e agenda fechada; sem fallback de cache positivo.
- **D-005 — Implementada:** evento de dia inteiro e exceção sem intervalo bloqueiam o expediente inteiro; a janela de agendamento vai de hoje a 60 dias.
- **D-006 — Implementada em 2026-07-27 com aprovação do solicitante:** a seleção de datas consulta até 24 dias úteis em uma única janela do Google Calendar, agrega regras e exceções em lote e devolve somente os seis primeiros dias com pelo menos um slot. Ocupação do Calendar nunca é liberada por exceção local, não há cache positivo e a confirmação continua fazendo verificação fresca.

Pendências: calendários secundários, cache permitido e medição de carga com credenciais de homologação.
