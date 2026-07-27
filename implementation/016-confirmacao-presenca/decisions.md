# Decisões

- **D-001 — Aprovada:** confirmação acontece no chat; o link permanece como apoio para gerenciar a consulta.
- **D-002 — Aprovada:** ausência de resposta não cancela nem altera a ocupação da consulta.
- **D-003 — Hipótese reversível:** resumo matinal usa 08h de São Paulo como padrão configurável.
- **D-004 — Técnica:** presença usa estado separado; remarcação o reinicia e confirmação é atômica pelo telefone remetente.
- **D-005 — Técnica:** o número já configurado da doutora para avisos operacionais também recebe o resumo diário.
- **D-006 — Rollout externo pendente:** migration, worker externo e mensagens reais não serão ativados nesta execução local.
- **D-007 — Aprovada:** eventos criados diretamente no Calendar entram no fluxo somente após importação controlada.
- **D-008 — Segurança:** título deve terminar em telefone brasileiro válido; somente eventos opacos, cronometrados e de 15/30 minutos são elegíveis.
- **D-009 — Consistência:** sincronização é somente leitura no Calendar; uma leitura incompleta nunca cancela projeções e eventos movidos geram nova versão da solicitação.
- **D-010 — Minimização:** paciente existente mantém seu nome cadastrado; o título externo só preenche nome ainda ausente ou cria o paciente pelo telefone.
