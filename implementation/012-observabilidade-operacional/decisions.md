# Decisões

- 2026-07-23 — Reutilizar o formato Prometheus e logs JSON existentes antes de considerar tracing ou agente proprietário.
- 2026-07-23 — Manter correlation ID nos logs e eventos, nunca como label de métrica.
- 2026-07-23 — Valores de alerta serão defaults de homologação até existir baseline.
- 2026-07-23 — Usuário aprovou a implementação local; ativação de destinos, retenção e alertas reais continua fora do escopo.
- 2026-07-23 — Perfil Prometheus é opcional, ligado somente a loopback e backplane, com token por secret externo.
- 2026-07-23 — Implementação local concluída; `promtool` ficou como validação de rollout porque o daemon Docker não estava disponível.
