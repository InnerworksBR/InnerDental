create function public.can_issue_otp(p_phone text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_phone));
  select count(*) into recent_count
  from public.access_tokens
  where phone = p_phone
    and origin = 'direct_otp'
    and created_at > now() - interval '15 minutes';

  return recent_count < 5;
end;
$$;
