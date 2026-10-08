-- MaintenanceOS V22.1 - Production RPC/cache hardening
-- Re-runnable and data-safe. This migration repairs the two V22 RPC entry points
-- when PostgREST has a stale schema cache or V22's original migration was not
-- fully applied. No existing asset, fault, part or usage records are deleted.
begin;

create table if not exists public.parts_stock_movements (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

alter table public.parts_stock_movements enable row level security;
drop policy if exists "V22 movements read" on public.parts_stock_movements;
drop policy if exists "V221 movements read" on public.parts_stock_movements;
create policy "V221 movements read" on public.parts_stock_movements
for select to anon, authenticated using (true);
grant select on public.parts_stock_movements to anon, authenticated;

grant usage on schema public to anon, authenticated;

drop function if exists public.adjust_part_stock_v22(uuid, integer, text);
create function public.adjust_part_stock_v22(
  p_part_id uuid,
  p_change integer,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty integer;
begin
  if p_part_id is null then raise exception 'Part is required'; end if;
  if p_change is null or p_change = 0 then raise exception 'Quantity change must be non-zero'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Adjustment reason is required'; end if;

  update public.parts_inventory
     set quantity_in_stock = coalesce(quantity_in_stock, 0) + p_change,
         updated_at = now()
   where id = p_part_id
     and coalesce(quantity_in_stock, 0) + p_change >= 0
   returning quantity_in_stock into new_qty;

  if new_qty is null then
    raise exception 'Part not found or adjustment would make stock negative';
  end if;

  insert into public.parts_stock_movements(part_id, quantity_change, reason)
  values(p_part_id, p_change, btrim(p_reason));

  return new_qty;
end;
$$;
revoke all on function public.adjust_part_stock_v22(uuid, integer, text) from public;
grant execute on function public.adjust_part_stock_v22(uuid, integer, text) to anon, authenticated;

alter table public.repair_tickets enable row level security;
drop policy if exists "V22 fault read" on public.repair_tickets;
drop policy if exists "V221 fault read" on public.repair_tickets;
create policy "V221 fault read" on public.repair_tickets
for select to anon, authenticated using (true);
grant select on public.repair_tickets to anon, authenticated;

-- Ensure the workflow guard exists without changing existing records.
create or replace function public.v22_guard_fault() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.asset_id is null or coalesce(new.status,'Open') <> 'Open' then
      raise exception 'Report an open fault first; record repair work against that fault';
    end if;
    if new.resolved_at is not null
       or nullif(btrim(coalesce(new.resolution_notes,'')),'') is not null
       or nullif(btrim(coalesce(new.parts_used,'')),'') is not null
       or coalesce(new.cost,0) <> 0
       or coalesce(new.downtime_hours,0) <> 0 then
      raise exception 'Repair-only data must be recorded through the active fault repair workflow';
    end if;
  else
    if new.asset_id is distinct from old.asset_id then
      raise exception 'Fault asset cannot be changed';
    end if;
    if (new.status is distinct from old.status and new.status = 'Resolved')
       or new.cost is distinct from old.cost
       or new.downtime_hours is distinct from old.downtime_hours
       or new.parts_used is distinct from old.parts_used
       or new.resolution_notes is distinct from old.resolution_notes
       or new.resolved_at is distinct from old.resolved_at then
      if not exists (select 1 from public.fault_repairs r where r.fault_id = new.id and r.asset_id = new.asset_id) then
        raise exception 'Resolve faults through their linked repair workflow';
      end if;
    end if;
    if old.status = 'Resolved' and new.status is distinct from old.status then
      raise exception 'Report a new fault for recurring symptoms';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists v22_guard_fault on public.repair_tickets;
drop trigger if exists v221_guard_fault on public.repair_tickets;
create trigger v221_guard_fault
before insert or update on public.repair_tickets
for each row execute function public.v22_guard_fault();

drop function if exists public.report_fault_v22(uuid, text, text, text, text, text);
create function public.report_fault_v22(
  p_asset_id uuid,
  p_title text,
  p_description text,
  p_reported_by text,
  p_priority text default 'Medium',
  p_photo_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fault_id uuid;
  clean_priority text := coalesce(nullif(btrim(p_priority), ''), 'Medium');
begin
  if p_asset_id is null then raise exception 'An asset is required'; end if;
  if not exists (select 1 from public.assets where id = p_asset_id) then raise exception 'Asset not found'; end if;
  if nullif(btrim(p_reported_by), '') is null then raise exception 'Reporter name is required'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Fault title is required'; end if;
  if clean_priority not in ('Low','Medium','High','Critical') then raise exception 'Invalid fault priority'; end if;

  insert into public.repair_tickets(
    asset_id, title, description, reported_by, priority, status, photo_url
  ) values (
    p_asset_id, btrim(p_title), nullif(btrim(p_description), ''),
    btrim(p_reported_by), clean_priority, 'Open', p_photo_url
  ) returning id into fault_id;

  return fault_id;
end;
$$;
revoke all on function public.report_fault_v22(uuid, text, text, text, text, text) from public;
grant execute on function public.report_fault_v22(uuid, text, text, text, text, text) to anon, authenticated;

-- Ask PostgREST to refresh its schema cache immediately after this migration.
select pg_notify('pgrst', 'reload schema');

commit;

-- A second notification after COMMIT helps installations where the schema
-- reload worker observes committed catalog changes only.
select pg_notify('pgrst', 'reload schema');
