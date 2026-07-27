# Decisões

- **D-001 — Aprovada em 2026-07-27:** consulta individual ocupa 15 minutos e conjunta ocupa exatamente 30 minutos contínuos.
- **D-002 — Aprovada em 2026-07-27:** o nome da segunda pessoa existe somente no evento da consulta no Google Calendar; o Supabase mantém apenas paciente responsável, intervalo e ID externo.
- **D-003 — Corrigida pelo solicitante em 2026-07-27:** o aviso deve considerar todos os procedimentos com `online_booking = false`, independentemente de `active`, e exibir a descrição cadastrada como orientação; o texto não deve afirmar genericamente que a doutora não realiza todos eles.
- **D-004 — Aprovada em 2026-07-27:** linha do tempo interna autorizada e Calendar usam `Nome Telefone`; listas de pacientes e demais projeções continuam mascaradas.
- **D-005 — Decisão técnica:** remarcação altera apenas início/fim do evento com PATCH para preservar o segundo nome sem armazená-lo localmente.
- **D-006 — Migration local preparada, rollout não autorizado:** a expansão troca checks de duração, adiciona exclusion constraints GiST e atualiza o RPC de hold. Aplicação compartilhada exige backup verificável, janela para scan/lock, teste de concorrência e plano de forward-fix.
