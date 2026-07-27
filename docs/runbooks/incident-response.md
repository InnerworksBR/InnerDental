# Resposta operacional a incidentes

## Mensageria e dead-letter

Se backlog, idade da fila ou dead-letter crescerem: confirme health do worker, Supabase e Evolution; pause novas réplicas se houver conflito de lease; registre apenas contagens e correlation IDs sanitizados. Não apague nem reenfileire itens manualmente. Preserve `lease_owner`, tentativas e horários, corrija a causa e use rollout/forward-fix aprovado.

## Alertas versionados

- `LunaWebUnavailable`: confirmar liveness, borda e digest ativo.
- `LunaWorkerUnavailable`: confirmar health privado, último poll e conectividade com Supabase.
- `LunaHttpErrorsHigh`: dimensionar por área/status e correlacionar logs sanitizados.
- `LunaQueueOldestItem`/`LunaQueueDeadLetters`: seguir o procedimento de mensageria acima.

Os thresholds são de homologação. Silenciar ou alterar destinatários/retensão exige decisão operacional registrada.

1. Classificar impacto: agenda indisponível, mensagem atrasada, inconsistência de consulta ou possível exposição.
2. Preservar correlation IDs, timestamps, versão e logs já sanitizados; não copiar payloads/telefones.
3. Conter: readiness deve impedir novas marcações quando Calendar/banco estiver indisponível; pausar worker somente com autorização do ambiente.
4. Recuperar pelo digest anterior quando o defeito for de aplicação. Nunca fazer rollback destrutivo de banco.
5. Validar liveness/readiness, consulta no Calendar, outbox/inbox e smoke mínimo.
6. Comunicar impacto, período, dados potencialmente afetados e risco residual pelo canal aprovado.
7. Registrar causa raiz, controles corretivos e evidências sem PII.
