create function public.consume_access_token(p_token_hash text)
returns table (phone text, session_id uuid)
language sql
set search_path = public
as $$
  update public.access_tokens
  set status = 'used', used_at = now()
  where token_hash = p_token_hash
    and status = 'active'
    and expires_at > now()
  returning access_tokens.phone, access_tokens.session_id;
$$;
