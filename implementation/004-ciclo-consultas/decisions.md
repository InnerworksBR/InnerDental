# Decisões

- **D-001 — Confirmada pelo PRD:** remarcação atualiza o mesmo evento e não remove o atual antes de garantir o novo.
- **D-002 — Executada:** chave de idempotência obrigatória em criar/remarcar/cancelar, persistida por operação e paciente.
- **D-003 — Executada:** cancelar exclui o evento no Calendar e preserva o histórico no Supabase com status `cancelled`.
- **D-004 — Executada:** operações cujo resultado no Calendar pode ser ambíguo ficam em `reconciliation_required`; o status clínico não expõe esse estado técnico.

Pendências operacionais: o período e o worker de reconciliação serão definidos na implementação de operação/entrega. A antecedência mínima adotada é de 24 horas; evento removido ou alterado manualmente é devolvido como divergência de reconciliação na listagem e bloqueia a mutação segura.
