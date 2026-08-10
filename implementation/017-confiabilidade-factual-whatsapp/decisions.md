# Decisões

- **D-1701 — Proposta:** fatos críticos de plano, procedimento, cobertura, preço e ação executada serão determinados por código e banco; o LLM não será a fonte de verdade.
- **D-1702 — Proposta:** correspondência parcial só será aceita quando produzir um único candidato inequívoco. Dois ou mais candidatos resultam em ambiguidade e pedido de esclarecimento/fallback.
- **D-1703 — Proposta:** `procedure_coverage` será consultada para perguntas combinadas de plano e procedimento; ausência de registro não equivale a cobertura positiva.
- **D-1704 — Proposta:** histórico textual anterior deixará de ser enviado ao LLM de resposta. Contexto necessário será representado por intenção, ação e fatos verificados estruturados.
- **D-1705 — Proposta:** respostas críticas usarão preferencialmente templates determinísticos. Quando houver redação por LLM, a saída deverá passar por grounding em código antes do envio.
- **D-1706 — Proposta:** até existir uma fonte de preços aprovada, perguntas de valor não receberão estimativa; serão encaminhadas para confirmação humana.
- **D-1707 — Proposta:** readiness da Evolution fará uma consulta somente leitura à instância configurada e exigirá estado `open`; configuração preenchida, isoladamente, não representa prontidão.
- **D-1708 — Proposta:** a implementação não alterará `.env` nem escolherá automaticamente entre instâncias Evolution, mesmo que exista somente uma conectada. Essa correção operacional exige autorização separada.
- **D-1709 — Proposta:** não será criada migration na primeira execução. Necessidade posterior de schema retorna ao gate de planejamento e aprovação.

## Aprovação

- **2026-08-10 — Aprovada:** o solicitante autorizou a execução com “pode seguir com a implementação”. A execução ficou limitada a código, testes e documentação locais; não alterou `.env`, secrets, instância Evolution, banco externo, deploy nem enviou WhatsApp.

## Decisões executadas

- **D-1710:** a IA só pode reescrever uma FAQ verificada; plano, cobertura, procedimento, preço e links permanecem em código determinístico.
- **D-1711:** ausência de cobertura ou fato administrativo passa para fallback seguro e handoff, em vez de resposta genérica improvisada.
- **D-1712:** `connectionState` da Evolution é lido no readiness e apenas `open` é considerado pronto.
