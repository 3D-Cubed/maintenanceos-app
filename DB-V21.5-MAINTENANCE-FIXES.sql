-- MaintenanceOS V21.5 - operational fixes
-- Additive and safe to rerun. No existing records are deleted.
begin;

-- Ensure asset edits can be written by the guest-entry application.
alter table public.assets add column if not exists updated_at timestamptz default now();

-- The V19 guard was too strict for fault INSERTs on databases where legacy repair
-- fields have zero/default values. A new fault is allowed when it is an Open ticket;
-- repair-only data must still be introduced through fault_repairs.
create or replace function public.v19_guard_fault() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.assets where id = new.asset_id for update;
  if tg_op = 'INSERT' then
    if new.asset_id is null or coalesce(new.status,'Open') is distinct from 'Open' then
      raise exception 'Report an open fault first; record repair work against that fault';
    end if;
    -- Ignore harmless legacy defaults (0 / empty text), but never allow actual
    -- repair data to be inserted directly into a new fault.
    if nullif(btrim(coalesce(new.parts_used,'')),'') is not null
       or nullif(btrim(coalesce(new.resolution_notes,'')),'') is not null
       or new.resolved_at is not null
       or coalesce(new.cost,0) <> 0
       or coalesce(new.downtime_hours,0) <> 0 then
      raise exception 'Report an open fault first; record repair work against that fault';
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
      if not exists (
        select 1 from public.fault_repairs r
        where r.fault_id = new.id and r.asset_id = new.asset_id
          and new.status = 'Resolved'
          and r.notes is not distinct from new.resolution_notes
          and r.parts_used is not distinct from new.parts_used
          and r.cost is not distinct from new.cost
          and r.downtime_hours is not distinct from new.downtime_hours
      ) then
        raise exception 'Repair changes must be recorded through the active fault repair workflow';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists v19_guard_fault on public.repair_tickets;
create trigger v19_guard_fault before insert or update on public.repair_tickets
for each row execute function public.v19_guard_fault();

-- Robust stock adjustment RPC. SECURITY DEFINER avoids client-side RLS/role
-- differences preventing a valid adjustment, while retaining the no-negative-stock
-- and mandatory-reason rules.
create or replace function public.adjust_part_stock_v212(
  p_part_id uuid, p_change integer, p_reason text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  new_qty integer;
begin
  if p_change is null or p_change = 0 then
    raise exception 'Quantity change must be non-zero';
  end if;
  if nullif(btrim(p_reason),'') is null then
    raise exception 'Adjustment reason is required';
  end if;

  update public.parts_inventory
     set quantity_in_stock = coalesce(quantity_in_stock,0) + p_change,
         updated_at = now()
   where id = p_part_id
     and coalesce(quantity_in_stock,0) + p_change >= 0
   returning quantity_in_stock into new_qty;

  if new_qty is null then
    raise exception 'Part not found or adjustment would make stock negative';
  end if;

  insert into public.parts_stock_movements(part_id, quantity_change, reason)
  values(p_part_id, p_change, btrim(p_reason));

  return new_qty;
end $$;

revoke all on function public.adjust_part_stock_v212(uuid,integer,text) from public;
grant execute on function public.adjust_part_stock_v212(uuid,integer,text) to anon, authenticated;

-- Make asset updates explicit for the guest-entry app.
drop policy if exists "V215 assets update" on public.assets;
create policy "V215 assets update" on public.assets
for update to anon, authenticated
using (true) with check (true);
grant select, update on public.assets to anon, authenticated;

commit;
