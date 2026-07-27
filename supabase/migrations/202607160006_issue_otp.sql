create function public.issue_otp_challenge(p_phone text, p_token_hash text, p_session_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare challenge_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_phone));
  if (select count(*) from public.access_tokens where phone = p_phone and origin = 'direct_otp' and created_at > now() - interval '15 minutes') >= 5 then
    return null;
  end if;
  insert into public.access_tokens (phone, token_hash, origin, session_id, expires_at)
  values (p_phone, p_token_hash, 'direct_otp', p_session_id, now() + interval '5 minutes') returning id into challenge_id;
  insert into public.notification_outbox (aggregate_type, aggregate_id, event_type, payload)
  values ('access_token', challenge_id, 'auth.otp_requested', jsonb_build_object('access_token_id', challenge_id));
  return challenge_id;
end;
$$;
