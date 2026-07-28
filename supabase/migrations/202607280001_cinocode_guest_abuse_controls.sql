-- Short-lived, privacy-preserving guest-abuse counters.
-- Only HMAC hashes are stored; raw IP addresses, device ids and prompts never
-- enter these tables. Records are opportunistically pruned after two days.

create table if not exists public.cinocode_guest_abuse_windows (
  ip_hash text not null,
  window_started_at timestamptz not null,
  new_device_count integer not null default 0 check (new_device_count >= 0),
  failed_verification_count integer not null default 0 check (failed_verification_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (ip_hash, window_started_at)
);

create table if not exists public.cinocode_guest_abuse_devices (
  ip_hash text not null,
  window_started_at timestamptz not null,
  device_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (ip_hash, window_started_at, device_hash)
);

create index if not exists cinocode_guest_abuse_windows_expiry_idx
  on public.cinocode_guest_abuse_windows (window_started_at);
create index if not exists cinocode_guest_abuse_devices_expiry_idx
  on public.cinocode_guest_abuse_devices (window_started_at);

alter table public.cinocode_guest_abuse_windows enable row level security;
alter table public.cinocode_guest_abuse_devices enable row level security;
revoke all on table public.cinocode_guest_abuse_windows from anon, authenticated;
revoke all on table public.cinocode_guest_abuse_devices from anon, authenticated;

create or replace function public.record_cinocode_guest_abuse(
  p_ip_hash text,
  p_device_hash text,
  p_event_type text,
  p_window_seconds integer,
  p_max_new_devices integer,
  p_max_failed_verifications integer
)
returns table (
  limited boolean,
  retry_after integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket_start timestamptz;
  bucket_end timestamptz;
  inserted_device integer := 0;
  current_new_devices integer := 0;
  current_failures integer := 0;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 or p_device_hash is null or length(p_device_hash) < 32 then
    raise exception 'invalid guest abuse identity';
  end if;
  if p_event_type not in ('attempt', 'failure') then
    raise exception 'invalid guest abuse event';
  end if;
  if p_window_seconds < 300 or p_window_seconds > 3600 then
    raise exception 'invalid guest abuse window';
  end if;
  if p_max_new_devices < 3 or p_max_new_devices > 50 or p_max_failed_verifications < 3 or p_max_failed_verifications > 100 then
    raise exception 'invalid guest abuse limits';
  end if;

  bucket_start := to_timestamp(floor(extract(epoch from timezone('utc', now())) / p_window_seconds) * p_window_seconds);
  bucket_end := bucket_start + (p_window_seconds * interval '1 second');

  -- Keep the data short-lived even when no external cleanup job is configured.
  delete from public.cinocode_guest_abuse_devices where window_started_at < timezone('utc', now()) - interval '2 days';
  delete from public.cinocode_guest_abuse_windows where window_started_at < timezone('utc', now()) - interval '2 days';

  insert into public.cinocode_guest_abuse_windows (ip_hash, window_started_at)
  values (p_ip_hash, bucket_start)
  on conflict (ip_hash, window_started_at) do nothing;

  if p_event_type = 'attempt' then
    insert into public.cinocode_guest_abuse_devices (ip_hash, window_started_at, device_hash)
    values (p_ip_hash, bucket_start, p_device_hash)
    on conflict (ip_hash, window_started_at, device_hash) do nothing;
    get diagnostics inserted_device = row_count;

    if inserted_device = 1 then
      update public.cinocode_guest_abuse_windows
      set new_device_count = new_device_count + 1,
          updated_at = timezone('utc', now())
      where ip_hash = p_ip_hash and window_started_at = bucket_start;
    end if;
  else
    update public.cinocode_guest_abuse_windows
    set failed_verification_count = failed_verification_count + 1,
        updated_at = timezone('utc', now())
    where ip_hash = p_ip_hash and window_started_at = bucket_start;
  end if;

  select new_device_count, failed_verification_count
  into current_new_devices, current_failures
  from public.cinocode_guest_abuse_windows
  where ip_hash = p_ip_hash and window_started_at = bucket_start;

  return query select
    current_new_devices > p_max_new_devices or current_failures >= p_max_failed_verifications,
    greatest(1, ceil(extract(epoch from bucket_end - timezone('utc', now())))::integer),
    bucket_end;
end;
$$;

revoke all on function public.record_cinocode_guest_abuse(text, text, text, integer, integer, integer) from public;
grant execute on function public.record_cinocode_guest_abuse(text, text, text, integer, integer, integer) to service_role;
