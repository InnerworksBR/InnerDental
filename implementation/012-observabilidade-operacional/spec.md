---
id: "012"
title: "Observabilidade e resposta operacional"
status: completed
priority: high
risk: high
created_at: "2026-07-23"
updated_at: "2026-07-23"
owner: ai-agent
depends_on: ["010", "011"]
requirements: ["RF-034", "RF-035", "RF-036", "RF-037", "RF-038"]
approval: "Usuário aprovou explicitamente as implementações 010 a 013 em 2026-07-23 e autorizou execução sequencial até a conclusão."
---

# Especificação

## Objetivo e escopo

Transformar healthchecks, métricas Prometheus e logs JSON já existentes em um plano operacional verificável: coleta privada, dashboards versionados, alertas acionáveis, correlação entre web/worker e política explícita de redaction/retenção.

## Fora de escopo

- Contratar SaaS, criar contas, configurar destinatários reais ou ativar alertas de produção.
- Inserir tracing distribuído ou agente proprietário sem medição de necessidade.
- Registrar payload de webhook, telefone, mensagem, OTP, cookie ou credencial.
- Definir SLO de produção antes de baseline em homologação.

## Requisitos e critérios

- **RF-034 — Coleta privada:** métricas e logs devem ser coletáveis sem exposição pública dos endpoints internos.
  - **CA-034:** configuração versionada usa rede privada e credencial por arquivo/secret, nunca token embutido.
- **RF-035 — Alertas acionáveis:** readiness, worker parado, backlog, dead-letter, falhas externas e erro HTTP sustentado devem possuir regras e runbook.
  - **CA-035:** cada alerta contém condição, janela, severidade, impacto e link de ação; testes validam sintaxe e referências.
- **RF-036 — Dashboards mínimos:** operação deve visualizar disponibilidade, latência, tráfego, filas e dependências externas.
  - **CA-036:** dashboards versionados usam apenas labels limitadas e não incluem PII.
- **RF-037 — Correlação:** uma operação deve manter correlation ID válido entre borda, web, banco/evento e worker quando tecnicamente disponível.
  - **CA-037:** testes provam propagação e geração segura sem usar correlation ID como label de métrica.
- **RF-038 — Governança de telemetria:** redaction, acesso, retenção e descarte devem estar documentados e testados.
  - **CA-038:** testes de sanitização cobrem objetos aninhados, erros e novas chaves sensíveis; retenção fica configurável por ambiente.

## Restrições

- Ferramentas locais devem ser opcionais e não aumentar a superfície pública.
- Alertas não podem executar mitigação destrutiva automaticamente.
- Dados de saúde e métricas não substituem auditoria transacional.

## Riscos

- Stack de observabilidade sem limites pode consumir mais recursos que a aplicação.
- Alertas sem baseline podem gerar ruído; valores iniciais são de homologação.
- Destino e retenção externos exigem aprovação específica do ambiente.
