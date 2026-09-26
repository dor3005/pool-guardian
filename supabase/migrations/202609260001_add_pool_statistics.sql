create index if not exists pool_status_created_at_idx
  on public.pool_status (created_at desc);

create or replace function public.get_pool_statistics(
  p_range text default '24h'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_start timestamptz;
  v_bucket_seconds integer;
  v_temperature_current numeric;
  v_temperature_min numeric;
  v_temperature_max numeric;
  v_temperature_average numeric;
  v_temperature_readings bigint;
  v_temperature_series jsonb := '[]'::jsonb;
  v_water_current text;
  v_water_changes jsonb := '[]'::jsonb;
  v_water_change_count bigint := 0;
begin
  case lower(p_range)
    when '24h' then
      v_start := v_now - interval '24 hours';
      v_bucket_seconds := 15 * 60;
    when '7d' then
      v_start := v_now - interval '7 days';
      v_bucket_seconds := 60 * 60;
    when '30d' then
      v_start := v_now - interval '30 days';
      v_bucket_seconds := 6 * 60 * 60;
    else
      raise exception 'Unsupported statistics range: %', p_range
        using errcode = '22023';
  end case;

  select ps.temperature
    into v_temperature_current
  from public.pool_status ps
  where ps.temperature is not null
    and ps.device_online is true
  order by ps.created_at desc
  limit 1;

  select
    min(ps.temperature),
    max(ps.temperature),
    avg(ps.temperature),
    count(*)
    into
      v_temperature_min,
      v_temperature_max,
      v_temperature_average,
      v_temperature_readings
  from public.pool_status ps
  where ps.created_at >= v_start
    and ps.created_at <= v_now
    and ps.temperature is not null
    and ps.device_online is true;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'at', buckets.bucket_at,
        'average', buckets.average_temperature,
        'min', buckets.min_temperature,
        'max', buckets.max_temperature,
        'readings', buckets.readings
      )
      order by buckets.bucket_at
    ),
    '[]'::jsonb
  )
    into v_temperature_series
  from (
    select
      to_timestamp(
        floor(extract(epoch from ps.created_at) / v_bucket_seconds)
        * v_bucket_seconds
      ) as bucket_at,
      avg(ps.temperature) as average_temperature,
      min(ps.temperature) as min_temperature,
      max(ps.temperature) as max_temperature,
      count(*) as readings
    from public.pool_status ps
    where ps.created_at >= v_start
      and ps.created_at <= v_now
      and ps.temperature is not null
      and ps.device_online is true
    group by 1
  ) as buckets;

  select upper(ps.status)
    into v_water_current
  from public.pool_status ps
  where upper(ps.status) in ('LOW', 'NORMAL', 'HIGH')
    and ps.device_online is true
  order by ps.created_at desc
  limit 1;

  with previous_reading as (
    select upper(ps.status) as status, ps.created_at
    from public.pool_status ps
    where ps.created_at < v_start
      and upper(ps.status) in ('LOW', 'NORMAL', 'HIGH')
      and ps.device_online is true
    order by ps.created_at desc
    limit 1
  ),
  range_readings as (
    select upper(ps.status) as status, ps.created_at
    from public.pool_status ps
    where ps.created_at >= v_start
      and ps.created_at <= v_now
      and upper(ps.status) in ('LOW', 'NORMAL', 'HIGH')
      and ps.device_online is true
  ),
  sequenced as (
    select
      readings.status,
      readings.created_at,
      lag(readings.status) over (order by readings.created_at) as previous_status
    from (
      select * from previous_reading
      union all
      select * from range_readings
    ) as readings
  ),
  changes as (
    select
      s.created_at,
      s.previous_status as from_status,
      s.status as to_status
    from sequenced s
    where s.created_at >= v_start
      and s.previous_status is not null
      and s.status <> s.previous_status
  ),
  numbered_changes as (
    select
      c.*,
      count(*) over () as total_changes,
      row_number() over (order by c.created_at desc) as newest_first
    from changes c
  )
  select
    coalesce(max(nc.total_changes), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'at', nc.created_at,
          'from', nc.from_status,
          'to', nc.to_status
        )
        order by nc.created_at
      ) filter (where nc.newest_first <= 100),
      '[]'::jsonb
    )
    into v_water_change_count, v_water_changes
  from numbered_changes nc;

  return jsonb_build_object(
    'range', lower(p_range),
    'range_start', v_start,
    'range_end', v_now,
    'temperature', jsonb_build_object(
      'current', v_temperature_current,
      'min', v_temperature_min,
      'max', v_temperature_max,
      'average', v_temperature_average,
      'readings', v_temperature_readings,
      'series', v_temperature_series
    ),
    'water_level', jsonb_build_object(
      'current', v_water_current,
      'total_changes', v_water_change_count,
      'changes', v_water_changes
    )
  );
end;
$$;

revoke all on function public.get_pool_statistics(text) from public;
grant execute on function public.get_pool_statistics(text) to anon, authenticated;
