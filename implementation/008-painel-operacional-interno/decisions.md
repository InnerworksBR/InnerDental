# Decisões

- **D-001 — Aprovada pelo solicitante em 2026-07-17:** o desenvolvedor é proprietário do painel e pode conceder acesso operacional à dentista.
- **D-002 — Aprovada pelo solicitante em 2026-07-17:** autenticação interna será feita por Supabase Auth; a sessão de paciente não é reutilizada.
- **D-003 — Aprovada pelo solicitante em 2026-07-17:** bloqueio administrativo de dia inteiro cria evento all-day no Google Calendar e não é apenas uma exceção interna.
- **D-004 — Proposta técnica, requer validação na execução:** perfis internos usam papéis `owner` e `operator`; o proprietário convida/revoga e o operador não gerencia acesso.
- **D-005 — Proposta técnica, requer validação na execução:** falhas e sucessos parciais de bloqueio entram em reconciliação/incidente, sem remoção automática de evento externo.

- **D-006 — Aprovada pelo solicitante em 2026-07-17:** a implementação local do painel foi autorizada; aplicar migration, criar o primeiro proprietário, enviar convite ou criar bloqueio real continuam a exigir ação operacional autorizada.
- **D-007 — Implementada em 2026-07-27 com aprovação do solicitante:** a projeção diária cruza consultas/bloqueios internos com eventos lidos do Google Calendar, exclui IDs já sincronizados e apresenta eventos criados diretamente como itens distintos. Telefones presentes no título são mascarados e falha externa degrada para aviso sem ocultar os registros internos.
- **D-008 — Implementada em 2026-07-27 com aprovação do solicitante:** a aba semanal representa a semana corrente completa, de segunda a domingo, e agrupa por data da clínica consultas internas, eventos diretos do Google Calendar e bloqueios. O servidor lê banco e Calendar em uma única janela semanal, sem repetir a integração para cada dia.

## Gates pendentes

- Aprovação explícita deste `spec.md` antes de escrever código.
- Aprovação específica antes de aplicar migrations em Supabase remoto.
- Aprovação específica antes de criar o primeiro usuário proprietário, configurar convite/e-mail do Supabase Auth ou enviar convite real.
- Aprovação específica antes de chamar Google Calendar sandbox ou produção com bloqueio real.
