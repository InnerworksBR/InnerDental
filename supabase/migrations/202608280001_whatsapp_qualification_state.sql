-- ============================================================
-- Migration: 202608280001_whatsapp_qualification_state.sql
-- Etapa 2 da remodelação do agente WhatsApp (Luna Agenda)
--
-- Criação da nova tabela de estado de qualificação, que substitui
-- os campos operacionais de whatsapp_conversation_slots (202608140030).
--
-- A tabela antiga é mantida por 30 dias para rollback.
--
-- Schema da nova tabela:
--   phone         (PK)  - telefone E.164, validado com check regex
--   awaiting_slot        - próximo slot a coletar: nome|procedimento|plano|para_quem
--   nome                  - nome do paciente
--   procedimento_id       - FK para procedures(id), ou null se não encontrado
--   procedimento_nome     - nome original dito pelo paciente
--   plano_id             - FK para insurance_plans(id), ou null se particular
--   plano_nome           - nome original dito pelo paciente
--   para_outra_pessoa    - true = para outra pessoa, false = próprio
--   last_intent          - última intent classificada
--   updated_at           - timestamp de última atualização
--   expires_at           - TTL: 7 dias após updated_at
--
-- RPCs:
--   read_whatsapp_qualification_state(p_phone)       - lê estado
--   apply_whatsapp_qualification_state(p_phone, p_writes, p_inbox_id) - upsert
-- ============================================================

BEGIN;

-- ─── Tabela principal ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_qualification_state (
  phone            text NOT NULL
                    CONSTRAINT whatsapp_qualification_state_phone_fmt
                    CHECK (phone ~ '^[0-9]{12,15}$'),
  awaiting_slot    text NULL
                    CHECK (awaiting_slot IN ('nome', 'procedimento', 'plano', 'para_quem')),
  nome             text NULL,
  procedimento_id  text NULL
                    REFERENCES public.procedures(id) ON DELETE SET NULL,
  procedimento_nome text NULL,
  plano_id         text NULL
                    REFERENCES public.insurance_plans(id) ON DELETE SET NULL,
  plano_nome       text NULL,
  para_outra_pessoa boolean NULL,
  last_intent      text NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  CONSTRAINT whatsapp_qualification_state_pkey PRIMARY KEY (phone)
);

COMMENT ON TABLE public.whatsapp_qualification_state IS
  'Estado de qualificação do novo fluxo WhatsApp (Luna Agenda). Substitui campos operacionais de whatsapp_conversation_slots.';

COMMENT ON COLUMN public.whatsapp_qualification_state.awaiting_slot IS
  'Próximo slot a coletar: nome, procedimento, plano ou para_quem. Null quando qualificação completa.';
COMMENT ON COLUMN public.whatsapp_qualification_state.expires_at IS
  'Auto-limpeza: registro expira 7 dias após última atualização.';

-- ─── Índices ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS whatsapp_qualification_state_expires_at_idx
  ON public.whatsapp_qualification_state (expires_at);

CREATE INDEX IF NOT EXISTS whatsapp_qualification_state_awaiting_slot_idx
  ON public.whatsapp_qualification_state (awaiting_slot)
  WHERE awaiting_slot IS NOT NULL;

-- ─── Função: TTL cleanup ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_expired_whatsapp_qualification_state()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.whatsapp_qualification_state
    WHERE expires_at < now()
    RETURNING phone
  )
  SELECT count(*) INTO deleted_count FROM deleted;

  -- Log para metrics
  PERFORM pg_logical_emit_message(
    'INFO',
    'whatsapp_qualification_state_cleanup',
    json_build_object('deleted', deleted_count)::text
  );

  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_whatsapp_qualification_state() IS
  'Remove registros expirados da whatsapp_qualification_state. Chamar via pg_cron ou manualmente.';

-- ─── RPC: read_whatsapp_qualification_state ─────────────────

CREATE OR REPLACE FUNCTION public.read_whatsapp_qualification_state(
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Validação básica do phone
  IF p_phone IS NULL OR p_phone !~ '^[0-9]{12,15}$' THEN
    RETURN jsonb_build_object(
      'phone', p_phone,
      'awaiting_slot', null,
      'nome', null,
      'procedimento_id', null,
      'procedimento_nome', null,
      'plano_id', null,
      'plano_nome', null,
      'para_outra_pessoa', null,
      'last_intent', null
    );
  END IF;

  SELECT to_jsonb(qs.*) INTO result
  FROM (
    SELECT
      phone,
      awaiting_slot,
      nome,
      procedimento_id,
      procedimento_nome,
      plano_id,
      plano_nome,
      para_outra_pessoa,
      last_intent,
      updated_at
    FROM public.whatsapp_qualification_state
    WHERE phone = p_phone
      AND expires_at > now()
  ) qs;

  IF result IS NULL THEN
    RETURN jsonb_build_object(
      'phone', p_phone,
      'awaiting_slot', null,
      'nome', null,
      'procedimento_id', null,
      'procedimento_nome', null,
      'plano_id', null,
      'plano_nome', null,
      'para_outra_pessoa', null,
      'last_intent', null
    );
  END IF;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.read_whatsapp_qualification_state(text) IS
  'Lê o estado de qualificação de um telefone. Retorna estado vazio se não existe ou expirou.';

-- ─── RPC: apply_whatsapp_qualification_state ────────────────

CREATE OR REPLACE FUNCTION public.apply_whatsapp_qualification_state(
  p_phone            text,
  p_writes           jsonb,
  p_inbox_id         text DEFAULT null
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_expires  timestamptz := v_now + interval '7 days';
  v_row      record;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^[0-9]{12,15}$' THEN
    RETURN false;
  END IF;

  -- Upsert: insere ou atualiza
  INSERT INTO public.whatsapp_qualification_state (
    phone,
    awaiting_slot,
    nome,
    procedimento_id,
    procedimento_nome,
    plano_id,
    plano_nome,
    para_outra_pessoa,
    last_intent,
    updated_at,
    expires_at
  )
  VALUES (
    p_phone,
    (p_writes->>'awaiting_slot')::text,
    p_writes->>'nome',
    p_writes->>'procedimento_id',
    p_writes->>'procedimento_nome',
    p_writes->>'plano_id',
    p_writes->>'plano_nome',
    CASE
      WHEN p_writes->>'para_outra_pessoa' IS NOT NULL
      THEN (p_writes->>'para_outra_pessoa')::boolean
      ELSE NULL
    END,
    p_writes->>'last_intent',
    v_now,
    v_expires
  )
  ON CONFLICT (phone) DO UPDATE SET
    awaiting_slot    = COALESCE(
      (EXCLUDED.awaiting_slot),
      (whatsapp_qualification_state.awaiting_slot)
    ),
    nome             = COALESCE(EXCLUDED.nome, whatsapp_qualification_state.nome),
    procedimento_id  = COALESCE(EXCLUDED.procedimento_id, whatsapp_qualification_state.procedimento_id),
    procedimento_nome = COALESCE(EXCLUDED.procedimento_nome, whatsapp_qualification_state.procedimento_nome),
    plano_id         = COALESCE(EXCLUDED.plano_id, whatsapp_qualification_state.plano_id),
    plano_nome       = COALESCE(EXCLUDED.plano_nome, whatsapp_qualification_state.plano_nome),
    para_outra_pessoa = COALESCE(EXCLUDED.para_outra_pessoa, whatsapp_qualification_state.para_outra_pessoa),
    last_intent      = COALESCE(EXCLUDED.last_intent, whatsapp_qualification_state.last_intent),
    updated_at       = v_now,
    expires_at       = v_expires;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.apply_whatsapp_qualification_state(text, jsonb, text) IS
  'Upsert de estado de qualificação. Recebe objeto com campos a escrever, renova TTL para 7 dias.';

-- ─── RPC: clear_whatsapp_qualification_state ────────────────

CREATE OR REPLACE FUNCTION public.clear_whatsapp_qualification_state(
  p_phone text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^[0-9]{12,15}$' THEN
    RETURN false;
  END IF;

  DELETE FROM public.whatsapp_qualification_state WHERE phone = p_phone;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.clear_whatsapp_qualification_state(text) IS
  'Remove estado de qualificação de um telefone (usado após handoff ou reinício de conversa).';

-- ─── Row Level Security ────────────────────────────────────

ALTER TABLE public.whatsapp_qualification_state ENABLE ROW LEVEL SECURITY;

-- Worker (service_role) pode ler e escrever
DROP POLICY IF EXISTS "Worker read whatsapp_qualification_state" ON public.whatsapp_qualification_state;
CREATE POLICY "Worker read whatsapp_qualification_state"
  ON public.whatsapp_qualification_state
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Worker write whatsapp_qualification_state" ON public.whatsapp_qualification_state;
CREATE POLICY "Worker write whatsapp_qualification_state"
  ON public.whatsapp_qualification_state
  FOR ALL
  TO authenticated
  USING (true);

COMMIT;
