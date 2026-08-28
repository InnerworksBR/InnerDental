# Deploy — Etapas de Produção

## Visão geral

| Etapa | Ação | Tempo |
|-------|------|-------|
| 1 | Aplicar migration no banco | imediato |
| 2 | Deployar aplicação com flags OFF | rollout |
| 3 | Ativar shadow mode (7 dias) | 7 dias |
| 4 | Ativar novo fluxo | monitoramento |
| 5 | Remover código legado | após 30 dias sem incidentes |

---

## Etapa 1 — Migration do banco (Supabase)

### Link direto do Supabase

👉 [https://supabase.com/dashboard](https://supabase.com/dashboard)

### Passos

1. Abra o projeto **InnerDental** no dashboard
2. Menu lateral → **SQL Editor**
3. Clique em **New Query**
4. Cole o conteúdo do arquivo:

   📄 [`supabase/migrations/202608280001_whatsapp_qualification_state.sql`](supabase/migrations/202608280001_whatsapp_qualification_state.sql)

5. Clique em **Run** (ou `Ctrl+Enter`)

### O que a migration cria

- **Tabela** `public.whatsapp_qualification_state` com 7 dias de TTL automático
- **3 RPCs**:
  - `read_whatsapp_qualification_state(p_phone)` — lê estado
  - `apply_whatsapp_qualification_state(p_phone, p_writes)` — upsert com TTL
  - `clear_whatsapp_qualification_state(p_phone)` — limpa após handoff
- **Índices** para performance
- **Cleanup function** `cleanup_expired_whatsapp_qualification_state()` para pg_cron

### Como agendar o cleanup automático (opcional mas recomendado)

```sql
-- Agendar limpeza diária via Supabase
SELECT cron.schedule(
  'whatsapp-qualification-cleanup',
  '0 3 * * *',  -- todo dia às 3h da manhã
  'SELECT cleanup_expired_whatsapp_qualification_state()'
);
```

### Verificação

```sql
-- Verifica se a tabela existe
SELECT COUNT(*) FROM public.whatsapp_qualification_state;

-- Verifica se as RPCs existem
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE 'whatsapp_qualification%';
```

---

## Etapa 2 — Deploy da aplicação (Vercel ou similar)

### Repositório

🔗 [https://github.com/InnerworksBR/InnerDental](https://github.com/InnerworksBR/InnerDental)

O deploy pode ser feito via Vercel (conectado ao GitHub) ou manual.

### Variáveis de ambiente a configurar

Adicione no ambiente de **produção**:

```
LUNA_USE_NEW_FLOW=false
LUNA_SHADOW_NEW_FLOW=false
```

> ⚠️ Ambas iniciam como `false` — o fluxo antigo continua funcionando normalmente.

### Como adicionar no Vercel

1. Abra o projeto na Vercel → aba **Settings** → **Environment Variables**
2. Adicione cada variável:
   - `LUNA_USE_NEW_FLOW` = `false`
   - `LUNA_SHADOW_NEW_FLOW` = `false`
3. Clique **Save**
4. Vá em **Deployments** → clique no menu `...` do último deploy → **Redeploy**

### Verificação pós-deploy

```bash
# Testa healthcheck
curl https://sua-url.com/api/health

# Testa que a tabela está acessível (via logs)
# Mensagem esperada: "Novo fluxo ativado" ou "Fluxo legado ativado"
```

---

## Etapa 3 — Ativar Shadow Mode (7 dias)

### Configuração

Altere apenas **uma** variável:

```
LUNA_SHADOW_NEW_FLOW=true
LUNA_USE_NEW_FLOW=false
```

### O que acontece

- **Cada mensagem** é processada pelos dois fluxos em paralelo
- O **fluxo antigo** continua enviando as respostas ao paciente (não há impacto)
- O **fluxo novo** é executado silenciosamente
- Um **log JSON** é emitido com a comparação:

```json
{
  "type": "shadow_comparison",
  "phone": "+5511987654321",
  "legacy_decision": "ask_qualification_slot(nome)",
  "new_decision": "ask_qualification_slot(nome)",
  "match": true,
  "timestamp": "2026-08-28T12:00:00Z"
}
```

### Onde ver os logs

```
# Vercel → Deployments → Functions → Logs
# Filtre por: "shadow" ou "luna"
```

### Critérios de validação (7 dias)

- ✅ Taxa de match entre decisões ≥ 95%
- ✅ Nenhum erro de TypeScript/runtime nos logs
- ✅ Pacientes não relatam falhas
- ✅ Handoffs estruturados chegam corretos na doutora

### Se encontrar divergências

Os logs mostram claramente qual decisão cada fluxo tomou. Analise os mismatches e corrija o `decisor.ts` se necessário. Commit + push restarta automaticamente.

---

## Etapa 4 — Ativar o Novo Fluxo

### Configuração

```
LUNA_USE_NEW_FLOW=true
LUNA_SHADOW_NEW_FLOW=false
```

> A partir daqui, o novo fluxo **envia as respostas reais** aos pacientes.

### Monitoramento intenso (primeiras 24-48h)

Fique atento a:
- Logs de erro no Vercel Functions
- Mensagens dos pacientes no WhatsApp
- Handoffs chegando na doutora

### O que muda pro paciente

| Antes | Depois |
|-------|--------|
| Respostas do LLM com risco de erro | Respostas em código puro e rastreável |
| Handoff textual free-form | Handoff estruturado com 4 campos |
| Sem estado persistente entre mensagens | Estado por telefone (7 dias TTL) |

### Rollback instantâneo

Se algo der errado:

```
LUNA_USE_NEW_FLOW=false
LUNA_SHADOW_NEW_FLOW=false
```

Volta ao fluxo antigo em segundos (sem deploy).

---

## Etapa 5 — Remover Código Legado (após 30 dias)

Execute **somente** após:
- 7 dias com `LUNA_USE_NEW_FLOW=true` sem incidentes
- 30 dias de estabilidade geral

### Passo 1 — Deletar arquivos legados

```bash
# Entre no servidor ou faça via GitHub
rm src/domain/messaging/router-tools.ts
rm src/domain/messaging/router-legacy-cascade.ts
rm src/domain/messaging/intent.legacy.ts
rm src/integrations/openai/conversation-classifier.ts
```

### Passo 2 — Atualizar .env / .env.example

No [`worker/index.ts`](worker/index.ts), remova:

```typescript
const useNewFlow = booleanSetting("LUNA_USE_NEW_FLOW", false);
const shadowNewFlow = booleanSetting("LUNA_SHADOW_NEW_FLOW", false);
```

Mude o default de `LUNA_USE_NEW_FLOW` para `true` e remova as flags de transição.

### Passo 3 — Commit

```bash
git add -u
git commit -m "refactor(whatsapp): etapa4 - remover código legado"
git push
```

### Passo 4 — Limpar tabela antiga (opcional, após 30 dias)

```sql
-- Só execute após validar que o novo fluxo está 100% estável
DROP TABLE IF EXISTS public.whatsapp_conversation_slots;
```

---

## Checklist rápido

```
[ ] Etapa 1: Migration aplicada no Supabase
[ ] Etapa 2: Deploy com LUNA_USE_NEW_FLOW=false, LUNA_SHADOW_NEW_FLOW=false
[ ] Etapa 3: Ativar LUNA_SHADOW_NEW_FLOW=true (7 dias de comparação)
[ ] Etapa 4: Ativar LUNA_USE_NEW_FLOW=true (monitorar 48h)
[ ] Etapa 5: Remover legado após 30 dias estável
```

---

## Suporte

- **Logs**: Vercel Functions → Logs
- **Banco**: [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
- **Deploy**: [GitHub repo](https://github.com/InnerworksBR/InnerDental)
