-- Migration: 202608290032_whatsapp_processed_action_new_flow.sql
-- Etapa 3 da remodelação do agente WhatsApp (Luna Agenda).
--
-- O decisor do novo fluxo (src/domain/messaging/decisor.ts) escreve o
-- `processed_action` da inbox com o Action.type literal
-- (qualification_complete, ask_qualification_slot, escalate_to_human,
-- send_text, send_interactive, send_questions_menu, no_action). O CHECK
-- constraint instalado em 202607300023 só aceita os labels do regex
-- cascade; sem este patch, qualquer inbox finalizada pelo novo fluxo
-- viola o CHECK e termina em STATE_UPDATE_FAILED → dead-letter após 6
-- tentativas, desperdiçando o trabalho de qualificação do paciente.
--
-- Esta migration adiciona os novos rótulos ao allowlist. O allowlist
-- antigo permanece compatível; nenhum consumidor existente precisa
-- mudar.

alter table public.whatsapp_inbox
  drop constraint if exists whatsapp_inbox_processed_action_check;

alter table public.whatsapp_inbox
  add constraint whatsapp_inbox_processed_action_check
    check (processed_action in (
      -- Rótulos do regex cascade (PRs 1–6).
      'portal_link', 'structured_answer', 'llm_answer', 'fallback_answer', 'handoff', 'ignored', 'merged',
      'appointment_confirmed', 'appointment_already_confirmed', 'confirmation_not_found', 'confirmation_ambiguous',
      'appointment_lookup', 'appointment_not_found',
      'plan_requested', 'plan_rejected', 'plan_rejected_caixa',
      -- Rótulos do novo fluxo (etapas 1c–2, remodelação).
      'qualification_complete', 'ask_qualification_slot', 'escalate_to_human',
      'send_text', 'send_interactive', 'send_questions_menu', 'no_action'
    ));