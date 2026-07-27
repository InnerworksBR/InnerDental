# Decisões

- 2026-07-23 — Manter PostgreSQL outbox/inbox; uma nova plataforma de filas não se justifica para o volume atual.
- 2026-07-23 — Dead-letter preserva o registro e interrompe retry automático; reprocessamento manual não será inferido.
- 2026-07-23 — Lease deve ser validado no banco, não apenas na memória do worker.
- 2026-07-23 — Usuário aprovou a implementação local; aplicação da migration fora do workspace continua exigindo gate separado.
- 2026-07-23 — Revisão PostgreSQL manteve constraints `NOT VALID` para evitar scan no rollout; validação futura exige volume, backup e janela aprovados.
- 2026-07-23 — Claims novos recuperam também itens `processing` legados usando `updated_at + 5 minutes`, preservando compatibilidade durante deploy concorrente.
- 2026-07-23 — Implementação local concluída; migration não aplicada externamente.
