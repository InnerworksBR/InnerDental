---
target: src/app/interno/page.tsx
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-26T21-11-44Z
slug: src-app-interno-page-tsx
---
# Critique — Painel Interno (Luna Agenda)

**Method: dual-agent (A: acdde71915a51f552 · B: a0a1813923b0a3bbc)**
**Target:** `src/app/interno/login/page.tsx`, `src/app/interno/page.tsx`, `src/components/admin-console.tsx`, `admin-block-form.tsx`, `admin-incidents.tsx`, `admin-management.tsx`, `admin-session-actions.tsx`
**Data:** 2026-08-14

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | KPIs + CalendarStatusWarning cobrem; falta feedback em navegação entre abas |
| 2 | Match System / Real World | 4 | "Visão de hoje", "Linha do tempo", "Bloquear agenda" — linguagem do consultório |
| 3 | User Control and Freedom | 2 | Sem desfazer na Central de Gestão; sidebar some no mobile sem voltar |
| 4 | Consistency and Standards | 3 | Botões consistentes; `window.confirm` em Equipe e Incidentes quebra o padrão |
| 5 | Error Prevention | 3 | Bloqueio com confirmação forte; criar procedimento/plano/FAQ não pede confirmação |
| 6 | Recognition Rather Than Recall | 3 | KPIs e labels claros; `unknown` como rótulo técnico vaza para a dentista |
| 7 | Flexibility and Efficiency | 2 | Mouse-only; sem busca global; sem atalhos; sem refresh no console principal |
| 8 | Aesthetic and Minimalist Design | 4 | Bricolage + Instrument Sans muito bem resolvidos; tons contidos; sem ornamento |
| 9 | Help Users Recognize, Diagnose, Recover from Errors | 3 | Mensagens amigáveis; erro de bloqueio sem CTA em vários casos |
| 10 | Help and Documentation | 1 | Zero tour, zero atalhos documentados, zero "ajuda" |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

Painel é da Luna Agenda, com marcas claras (vocabulário "Procedimentos", "Planos e convênios", "Férias", "Cobertura", categorias de falha próprias da arquitetura). Mas há resíduo genérico: `AdminSessionActions` é botão nu, `AdminIncidents` usa `window.confirm` nativo, labels de status (`unknown`, `evolution`, `worker`) são literais do banco.

Detector mecânico retornou `[]` (exit 0). A ressalva do B é correta: o detector é majoritariamente calibrado para landing/marketing; painel admin tem pouco markup "decorativo" delegado a componentes compartilhados. Evidência crítica vem do design review.

## What's Working

1. **Identidade visual sólida e contida.** Bricolage + Instrument Sans, paleta `#0c1511` + `#7fd8bd`, hierarquia com letter-spacing negativo. Não há ornamento gratuito.
2. **Confirmação explícita de bloqueio de dia é exemplar.** Idempotency key no cliente, tratamento de `BLOQUEIO_EM_RECONCILIACAO`, painel amarelo com nome + data.
3. **Hierarquia papel/visibilidade madura.** `canManage` desabilita mutações para operator; erros como `ULTIMO_PROPRIETARIO_NAO_PODE_SER_REVOGADO` evitam travamento da clínica; `errorLabels` traduzido é cuidado raro.

## Priority Issues

### P0 — operator vê CTAs administrativos habilitados (vazamento de papel)
- Fix: ocultar "Tornar…" e "Revogar" quando `!canManage`; mostrar só `<em>{role}</em>`.
- Comando: `/impeccable critique` em `admin-management.tsx` — escopo `team-permissions`.

### P0 — incidente usa `window.confirm` e categorias em inglês
- Fix: substituir por modal do design system (padrão `ops-inline-confirm`); mapear `categories` para PT-BR ("Validação", "Google Agenda", "Banco de dados", "WhatsApp", "Worker", "Outra").
- Comando: `/impeccable clarify` em `admin-incidents.tsx`.

### P1 — Tabs da Gestão não seguem padrão WAI-ARIA
- Fix: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-controls`, navegação por setas.
- Comando: `/impeccable audit` (a11y) — escopo `tabs`.

### P1 — schema "horários semanais" quebra silenciosamente
- Fix: input texto livre → `<input type="time">` em pares por dia + "Adicionar período"; validação client + server.
- Comando: `/impeccable harden` em `admin-management.tsx` — escopo `schedule-input`.

### P2 — botão "Enviar lembrete" sem handler (morto)
- Fix: implementar, ou remover, ou grayed-out + tooltip "Disponível em breve".
- Comando: `/impeccable clarify` em `admin-console.tsx` — escopo `dead-cta`.

### P3 — help text com contraste abaixo de AA
- Fix: `#82978d` sobre `#14221c` ≈ 3.6:1; subir para `#a4b8ae` ou `#b8cdc1`.
- Comando: `/impeccable colorize` em `.ops-form-help`.

## Persona Red Flags

- **Alex (dev)**: mouse-only; sem busca global; sem refresh no console; sidebar sem contadores; sem exportação CSV.
- **Sam (a11y)**: tabs não são WAI-tabs; `management-tabs` 38px no mobile (abaixo de 44px); 9–10px em rótulos de gestão; help text 3.6:1; sem `aria-controls`; sem `<h1>` semântico no conteúdo.
- **Casey (dentista no celular)**: bloqueio só na aba "Hoje"; incidentes escondidos em `<details>`; "Sair" minúsculo; "Confirmar" sem verbo de ação; 6 categorias em inglês; sidebar some em tablet 768×1024 (pior breakpoint).

## Minor Observations

- `admin-management.tsx:124` — `Save plano` / `Novo` quebra consistência com `Salvar` / `Limpar` de Procedimentos.
- `admin-management.tsx:179` — `<small>{item.email || item.user_id}</small>` vaza UUID técnico quando email é null.
- `admin-management.tsx:170` — "Resumo" sem ícone/badge no botão; diferença sutil para os outros.
- `admin-console.tsx:151` — bloqueios aparecem após a timeline sem cabeçalho; dentista pode confundir.
- `admin-management.tsx:172` — `useMemo` filtra sem normalizar acentos; servidor também não — descasamento sutil.
- `admin-console.tsx:204` — `<nav className="ops-nav">` dentro do main, depois do `</section>` — melhor como `<footer>`.

## Questions to Consider

1. Por que `canManage` esconde visualmente algumas ações e em outras só desabilita? Ensinando vocabulário ao operator.
2. Resumo é aba ou cabeçalho? No código é aba, no layout aparece separado.
3. Quem responde a um "Marcar como resolvido"? Não há canal humano no painel.
4. Por que `AgendaManagement` mistura cadastrar profissional + editar agenda semanal + criar exceção em um só painel?
5. Por que "Incidentes" não é aba própria no console, enterrado num `<details>` de Gestão?
6. `errorLabels` tem 10 entradas; backend pode crescer e UI cair em `SERVER_ERROR` genérico.
7. Sidebar some em <1024px — tablet em pé (768×1024) é o pior dos mundos.

---

> **Trend for `src-app-interno-page-tsx` (last 5 runs): 28/40** (first run for this target — only this one entry)
> Wrote `.impeccable/critique/2026-08-26T21-14-22Z__src-app-interno-page-tsx.md`.
