-- V19 additive migration. Run once before deploying V19 (safe to rerun).
-- Existing tickets are fault records; their IDs, dates and historical repair fields stay unchanged.
-- No data reset, renaming, deletion or replacement of existing RLS policies.
begin;
alter table public.repair_tickets add column if not exists resolved_at timestamptz;
alter table public.repair_tickets add column if not exists resolution_notes text;
alter table public.repair_tickets add column if not exists photo_url text;

create table if not exists public.fault_repairs (
  id uuid primary key default gen_random_uuid(),
  fault_id uuid not null unique references public.repair_tickets(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  notes text not null check (length(btrim(notes)) > 0),
  parts_used text,
  cost numeric check (cost >= 0),
  downtime_hours numeric check (downtime_hours >= 0),
  completed_at timestamptz not null default now()
);
alter table public.fault_repairs enable row level security;
-- Access is inherited through the existing ticket policies; no anonymous access is added to tickets/assets.
drop policy if exists "visible fault repairs" on public.fault_repairs;
create policy "visible fault repairs" on public.fault_repairs for select
using (exists (select 1 from public.repair_tickets f where f.id = fault_id));
drop policy if exists "repair active visible fault" on public.fault_repairs;
create policy "repair active visible fault" on public.fault_repairs for insert
with check (exists (select 1 from public.repair_tickets f where f.id = fault_id and f.asset_id = fault_repairs.asset_id and coalesce(f.status, 'Open') <> 'Resolved'));
revoke all on public.fault_repairs from public, anon, authenticated;
grant select, insert on public.fault_repairs to anon, authenticated;

create or replace function public.v19_validate_repair() returns trigger
language plpgsql security invoker set search_path = public as $$
declare f public.repair_tickets;
begin
  -- Serialise all operations for an asset before locking the fault.
  perform 1 from public.assets where id = new.asset_id for update;
  select * into f from public.repair_tickets where id = new.fault_id for update;
  if not found or f.asset_id is distinct from new.asset_id or f.status = 'Resolved' then
    raise exception 'Repair requires an active fault linked to this asset';
  end if;
  if new.cost::text in ('NaN','Infinity','-Infinity') or new.downtime_hours::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Cost and downtime must be finite';
  end if;
  return new;
end $$;
drop trigger if exists v19_validate_repair on public.fault_repairs;
create trigger v19_validate_repair before insert on public.fault_repairs
for each row execute function public.v19_validate_repair();

create or replace function public.v19_guard_fault() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.assets where id = new.asset_id for update;
  if tg_op = 'INSERT' then
    if new.asset_id is null or new.status is distinct from 'Open' or new.cost is not null or new.downtime_hours is not null
       or nullif(new.parts_used,'') is not null or nullif(new.resolution_notes,'') is not null or new.resolved_at is not null then
      raise exception 'Report an open fault first; record repair work against that fault';
    end if;
  else
    if new.asset_id is distinct from old.asset_id then raise exception 'Fault asset cannot be changed'; end if;
    if new.status is distinct from old.status and new.status = 'Resolved'
       or new.cost is distinct from old.cost or new.downtime_hours is distinct from old.downtime_hours
       or new.parts_used is distinct from old.parts_used or new.resolution_notes is distinct from old.resolution_notes
       or new.resolved_at is distinct from old.resolved_at then
      if not exists (select 1 from public.fault_repairs r where r.fault_id = new.id and r.asset_id = new.asset_id
        and new.status = 'Resolved' and r.notes is not distinct from new.resolution_notes
        and r.parts_used is not distinct from new.parts_used and r.cost is not distinct from new.cost
        and r.downtime_hours is not distinct from new.downtime_hours and r.completed_at is not distinct from new.resolved_at) then
        raise exception 'Resolve faults through their linked repair workflow';
      end if;
    end if;
    if old.status = 'Resolved' and new.status is distinct from old.status then
      raise exception 'Report a new fault for recurring symptoms';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists v19_guard_fault on public.repair_tickets;
create trigger v19_guard_fault before insert or update on public.repair_tickets
for each row execute function public.v19_guard_fault();

create or replace function public.v19_refresh_asset() returns trigger
language plpgsql security invoker set search_path = public as $$
declare updated_count integer;
begin
  update public.assets set status = case
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and status = 'In Repair') then 'Under Repair'
    when exists (select 1 from public.repair_tickets where asset_id = new.asset_id and coalesce(status, 'Open') <> 'Resolved') then 'Needs Attention'
    else 'Operational' end where id = new.asset_id;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Asset status could not be updated; fault operation was rolled back'; end if;
  return new;
end $$;
drop trigger if exists v19_refresh_asset on public.repair_tickets;
create trigger v19_refresh_asset after insert or update of status on public.repair_tickets
for each row execute function public.v19_refresh_asset();

-- Completing any linked repair closes its fault atomically, including direct inserts.
create or replace function public.v19_finish_repair() returns trigger
language plpgsql security invoker set search_path = public as $$
declare updated_count integer;
begin
  update public.repair_tickets set status = 'Resolved', resolved_at = new.completed_at,
    resolution_notes = new.notes, parts_used = new.parts_used, cost = new.cost, downtime_hours = new.downtime_hours
    where id = new.fault_id and asset_id = new.asset_id and coalesce(status, 'Open') <> 'Resolved';
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then raise exception 'Fault could not be resolved; repair was rolled back'; end if;
  return new;
end $$;
drop trigger if exists v19_finish_repair on public.fault_repairs;
create trigger v19_finish_repair after insert on public.fault_repairs
for each row execute function public.v19_finish_repair();

create or replace function public.complete_fault_repair(
  p_fault_id uuid, p_asset_id uuid, p_notes text, p_parts text default null,
  p_cost numeric default null, p_downtime numeric default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare repair_id uuid;
begin
  insert into public.fault_repairs(fault_id, asset_id, notes, parts_used, cost, downtime_hours)
    values(p_fault_id, p_asset_id, btrim(p_notes), nullif(btrim(p_parts),''), p_cost, p_downtime) returning id into repair_id;
  return repair_id;
end $$;
revoke all on function public.complete_fault_repair(uuid,uuid,text,text,numeric,numeric) from public;
grant execute on function public.complete_fault_repair(uuid,uuid,text,text,numeric,numeric) to anon, authenticated;
commit;
