create table if not exists public.cinocode_usage_quotas (
  identity_hash text not null,
  usage_kind text not null check (usage_kind in ('chat', 'image')),
  window_date date not null default (timezone('utc', now())::date),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (identity_hash, usage_kind, window_date)
);

alter table public.cinocode_usage_quotas enable row level security;
revoke all on table public.cinocode_usage_quotas from anon, authenticated;

create or replace function public.consume_cinocode_quota(
  p_identity_hash text,
  p_usage_kind text,
  p_limit integer
)
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  quota_allowed boolean := true;
  current_date_utc date := timezone('utc', now())::date;
begin
  if p_identity_hash is null or length(p_identity_hash) < 32 then
    raise exception 'invalid identity hash';
  end if;
  if p_usage_kind not in ('chat', 'image') then
    raise exception 'invalid usage kind';
  end if;
  if p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid quota limit';
  end if;

  insert into public.cinocode_usage_quotas (
    identity_hash, usage_kind, window_date, request_count, updated_at
  ) values (
    p_identity_hash, p_usage_kind, current_date_utc, 1, timezone('utc', now())
  )
  on conflict (identity_hash, usage_kind, window_date)
  do update set
    request_count = public.cinocode_usage_quotas.request_count + 1,
    updated_at = timezone('utc', now())
  where public.cinocode_usage_quotas.request_count < p_limit
  returning request_count into current_count;

  if current_count is null then
    quota_allowed := false;
    select request_count into current_count
    from public.cinocode_usage_quotas
    where identity_hash = p_identity_hash
      and usage_kind = p_usage_kind
      and window_date = current_date_utc;
  end if;

  return query select
    quota_allowed,
    current_count,
    greatest(0, p_limit - current_count),
    ((current_date_utc + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.consume_cinocode_quota(text, text, integer) from public;
grant execute on function public.consume_cinocode_quota(text, text, integer) to service_role;
