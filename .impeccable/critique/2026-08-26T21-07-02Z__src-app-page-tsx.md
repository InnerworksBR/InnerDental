---
target: src/app/page.tsx
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-26T21-07-02Z
slug: src-app-page-tsx
---
# Critique — Portal do Paciente (Luna Agenda)

**Method: dual-agent (A: ab224f8b3a1896983 · B: a18c3406af71a698d)**
**Target:** `src/app/page.tsx`, `src/app/acesso/page.tsx`, `src/app/agenda/page.tsx`, `src/components/portal-shell.tsx`
**Data:** 2026-08-14

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Spinner existe; faltam skeleton no initial load e cooldown visível no reenvio de OTP |
| 2 | Match System / Real World | 3 | Linguagem é do paciente; termos como "consecutivos" são mecânicos |
| 3 | User Control and Freedom | 3 | "‹ Voltar" + confirmação inline em cancelar; sem undo |
| 4 | Consistency and Standards | 4 | `.button`/`.eyebrow`/`.notice` reaproveitados; moldura consistente |
| 5 | Error Prevention | 3 | Hold anti-double-book; falta máscara progressiva no telefone |
| 6 | Recognition Rather Than Recall | 2 | 24 dias em scroll + slots sem agrupar por turno = 720+ decisões sem filtro |
| 7 | Flexibility and Efficiency of Use | 2 | Sem "minha profissional habitual", sem deep-link, sem atalho |
| 8 | Aesthetic and Minimalist Design | 3 | Paleta e tipografia coesas; booking é formulário único longo sem stepper |
| 9 | Help Users Recognize, Diagnose, Recover from Errors | 3 | Copy claro; sem classificar 401/500/rede; sem CTA "ver outros horários" |
| 10 | Help and Documentation | 1 | Zero onboarding, zero FAQ linkado, zero "Como funciona?" |
| **Total** | | **27/40** | **Good** |

## Design Specificity Verdict

Portal foi construído com a função da Luna Agenda em mente (party-size, duração, procedimentos não-bookable), mas design system e tom de voz são genéricos. Especificidade de comportamento de domínio, não de identidade de marca. Logo é letra "L" num quadrado verde; não personaliza saudação; paleta sage/off-white/âmbar é trademark-comum.

Detector mecânico retornou `[]` (exit 0). Toda a evidência crítica vem do design review.

## What's Working

1. Hierarquia tipográfica contida (`Bricolage Grotesque` + `Instrument Sans`).
2. Slot hold flow anti-double-book.
3. Inferência de party-size pela duração do appointment.

## Priority Issues

### P0 — Cancelamento sem reassurance pós-ação
- Fix: sub-linha + CTA "Marcar nova consulta" no `.notice` de sucesso do cancelamento.
- Comando: `/impeccable clarify`

### P0 — Input de telefone sem máscara no OTP
- Fix: máscara progressiva `(11) 98765-4321` + validação de DDD no blur.
- Comando: `/impeccable harden`

### P1 — CTA "Confirmar consulta" afasta-se do slot escolhido
- Fix: resumo fixo acima do CTA ou sticky bar em telas > 600px.
- Comando: `/impeccable layout`

### P1 — `.text-button` abaixo de 44px (alvos de toque)
- Fix: `.text-button { min-height: 44px; padding: 8px 4px; }`.
- Comando: `/impeccable adapt`

### P1 — Booking sem stepper visual
- Fix: indicadores "1. Quem · 2. Com quem · 3. Quando · 4. Confirma".
- Comando: `/impeccable layout`

### P2 — `.professional-option`/`.days`/`.slot` sem ARIA
- Fix: `aria-pressed` + `aria-label` com mês/duração.
- Comando: `/impeccable audit`

### P2 — Botão "Sair" sem confirmação
- Fix: `confirm()` ou dialog leve antes de `logout()`.
- Comando: `/impeccable harden`

### P3 — Loading inicial sem skeleton
- Fix: skeleton em `.appointment-list` durante `initialLoad`.
- Comando: `/impeccable delight`

## Persona Red Flags

- **Alex**: sem atalho "minha profissional", sem deep-link, sem indicador de agenda livre.
- **Jordan**: `/acesso` frio; "Plano odontológico" sem hint; zero link "Como funciona?".
- **Casey**: `<input type="tel">` alfanumérico; `.days` sem dot; CTA longe do polegar; sem safe-area-inset-bottom; "Sair" perigoso.
- **Sam**: `.text-button` 32px falha WCAG; selectors sem ARIA; cor `.danger` sem ícone; skip-link só no admin.

## Minor Observations

- `portal-shell.tsx:5` `showFooter` nunca é `true` em call sites — dead code.
- `globals.css` mistura portal e admin em 226 linhas.
- `partySizeForAppointment` (`agenda/page.tsx:22`) — regra de negócio inline.
- `Intl.DateTimeFormat("pt-BR", { weekday: "short" }).replace(".", "")` — operação frágil entre browsers.
- Falta `metadata` Next.js — SEO vazio.
- Landing linka `/interno/login` — enumeração de endpoint exposta.

## Questions to Consider

1. Quantos profissionais? 1 vs >5 muda o `.professional-list` inteiro.
2. Por que `/interno/login` linkado da landing pública?
3. Quem é "a equipe" em "fale com a equipe"?
4. LGPD: telefone/nome/plano sem privacidade visível.
5. Esconder a marca no fluxo de transação reduz reassurance.
