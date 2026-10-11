-- MaintenanceOS V23.0 - Parts master records + service parts costing
-- Additive and data-safe. No existing inventory, service, repair or fault records are deleted.
begin;

-- PART MASTER
alter table public.parts_inventory add column if not exists archived boolean not null default false;
alter table public.parts_inventory add column if not exists archived_at timestamptz;
alter table public.parts_inventory add column if not exists drawing_url text;
alter table public.parts_inventory add column if not exists drawing_number text;
alter table public.parts_inventory add column if not exists drawing_revision text;
alter table public.parts_inventory add column if not exists updated_at timestamptz default now();

create table if not exists public.parts_history (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.parts_inventory(id) on delete restrict,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.parts_history enable row level security;
drop policy if exists "V23 parts history read" on public.parts_history;
create policy "V23 parts history read" on public.parts_history for select to anon, authenticated using (true);
grant select on public.parts_history to anon, authenticated;

create or replace function public.v23_record_part_history() returns trigger
language plpgsql security definer set search_path=public as $$
declare changes text[] := array[]::text[];
begin
  if old.part_name is distinct from new.part_name then changes:=array_append(changes,'name: '||coalesce(old.part_name,'blank')||' → '||coalesce(new.part_name,'blank')); end if;
  if old.part_number is distinct from new.part_number then changes:=array_append(changes,'part number: '||coalesce(old.part_number,'blank')||' → '||coalesce(new.part_number,'blank')); end if;
  if old.equipment_type is distinct from new.equipment_type then changes:=array_append(changes,'equipment type changed'); end if;
  if old.category is distinct from new.category then changes:=array_append(changes,'category changed'); end if;
  if old.supplier_name is distinct from new.supplier_name then changes:=array_append(changes,'supplier: '||coalesce(old.supplier_name,'blank')||' → '||coalesce(new.supplier_name,'blank')); end if;
  if old.supplier_url is distinct from new.supplier_url then changes:=array_append(changes,'supplier link changed'); end if;
  if old.price is distinct from new.price then changes:=array_append(changes,'unit cost: £'||coalesce(old.price,0)::numeric::text||' → £'||coalesce(new.price,0)::numeric::text); end if;
  if old.stock_location is distinct from new.stock_location then changes:=array_append(changes,'storage location changed'); end if;
  if old.drawing_number is distinct from new.drawing_number or old.drawing_revision is distinct from new.drawing_revision then changes:=array_append(changes,'engineering drawing/revision updated'); end if;
  if old.drawing_url is distinct from new.drawing_url then changes:=array_append(changes,'engineering drawing file changed'); end if;
  if old.archived is distinct from new.archived then changes:=array_append(changes,case when new.archived then 'part archived' else 'part restored' end); end if;
  if cardinality(changes)>0 then
    insert into public.parts_history(part_id,action,detail) values(new.id,'part_updated',array_to_string(changes,' • '));
  end if;
  return new;
end $$;

drop trigger if exists v23_part_history on public.parts_inventory;
create trigger v23_part_history after update on public.parts_inventory
for each row execute function public.v23_record_part_history();

-- ENGINEERING DRAWING STORAGE
insert into storage.buckets(id,name,public) values('part-drawings','part-drawings',true) on conflict (id) do update set public=true;
drop policy if exists "V23 part drawings upload" on storage.objects;
create policy "V23 part drawings upload" on storage.objects for insert to anon,authenticated with check (bucket_id='part-drawings');
drop policy if exists "V23 part drawings view" on storage.objects;
create policy "V23 part drawings view" on storage.objects for select to public using (bucket_id='part-drawings');
grant select on public.parts_inventory to anon,authenticated;
grant update on public.parts_inventory to anon,authenticated;

-- SERVICE RECORDS
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete restrict,
  service_category text not null,
  service_data jsonb not null default '{}'::jsonb,
  parts_replaced text,
  parts_cost numeric not null default 0 check(parts_cost >= 0),
  total_cost numeric not null default 0 check(total_cost >= 0),
  next_service_due date,
  engineer_notes text,
  completed_at timestamptz not null default now()
);
alter table public.service_records enable row level security;
drop policy if exists "V23 service records read" on public.service_records;
create policy "V23 service records read" on public.service_records for select to anon,authenticated using(true);
grant select on public.service_records to anon,authenticated;

-- Make parts usage capable of being linked to a service record (already present in V21.1, kept idempotent).
alter table public.parts_usage alter column fault_id drop not null;
alter table public.parts_usage add column if not exists source_type text;
alter table public.parts_usage add column if not exists source_id uuid;
alter table public.parts_usage add column if not exists quantity_used integer default 1;
alter table public.parts_usage add column if not exists part_name_snapshot text;
alter table public.parts_usage add column if not exists part_number_snapshot text;
alter table public.parts_usage add column if not exists unit_cost_snapshot numeric default 0;

-- Atomic service completion: creates the service record, consumes stock and records cost/usage together.
create or replace function public.complete_service_v23(
  p_asset_id uuid,
  p_service_category text,
  p_service_data jsonb,
  p_parts jsonb default '[]'::jsonb,
  p_parts_replaced text default null,
  p_parts_cost numeric default 0,
  p_total_cost numeric default 0,
  p_next_service_due date default null,
  p_engineer_notes text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare service_id uuid; item jsonb; inv public.parts_inventory; qty integer; parts_summary text:='';
begin
  if not exists(select 1 from public.assets where id=p_asset_id) then raise exception 'Asset not found'; end if;
  if nullif(btrim(coalesce(p_service_category,'')),'') is null then raise exception 'Service category is required'; end if;
  if p_parts is null then p_parts:='[]'::jsonb; end if;
  if jsonb_typeof(p_parts)<>'array' then raise exception 'Parts must be an array'; end if;
  if p_parts_cost < 0 or p_total_cost < 0 then raise exception 'Service costs must be zero or positive'; end if;

  insert into public.service_records(asset_id,service_category,service_data,parts_replaced,parts_cost,total_cost,next_service_due,engineer_notes)
  values(p_asset_id,p_service_category,coalesce(p_service_data,'{}'::jsonb),p_parts_replaced,coalesce(p_parts_cost,0),coalesce(p_total_cost,0),p_next_service_due,p_engineer_notes)
  returning id into service_id;

  for item in select * from jsonb_array_elements(p_parts) loop
    qty:=coalesce((item->>'quantity')::integer,0);
    if qty<=0 then raise exception 'Part quantity must be greater than zero'; end if;
    select * into inv from public.parts_inventory where id=(item->>'part_id')::uuid for update;
    if not found or coalesce(inv.archived,false) then raise exception 'Selected part is unavailable'; end if;
    if coalesce(inv.quantity_in_stock,0)<qty then raise exception 'Insufficient stock for %',coalesce(inv.part_name,inv.part_number,'selected part'); end if;
    update public.parts_inventory set quantity_in_stock=quantity_in_stock-qty,updated_at=now() where id=inv.id;
    insert into public.parts_usage(part_id,asset_id,quantity,part_name,part_number,unit_cost,used_at,source_type,source_id,quantity_used,notes,created_at,part_name_snapshot,part_number_snapshot,unit_cost_snapshot)
    values(inv.id,p_asset_id,qty,coalesce(inv.part_name,'Unnamed part'),inv.part_number,coalesce(inv.price,0),now(),'service',service_id,qty,'Used during scheduled service',now(),coalesce(inv.part_name,'Unnamed part'),inv.part_number,coalesce(inv.price,0));
    insert into public.parts_stock_movements(part_id,quantity_change,reason) values(inv.id,-qty,'Used during service');
    parts_summary:=parts_summary||case when parts_summary='' then '' else ', ' end||qty||'× '||coalesce(inv.part_name,inv.part_number,'Part');
  end loop;

  update public.service_records set service_data=coalesce(p_service_data,'{}'::jsonb)||jsonb_build_object('parts_used',parts_summary,'parts_cost',coalesce(p_parts_cost,0),'total_cost',coalesce(p_total_cost,0)) where id=service_id;
  update public.assets set status=case when exists(select 1 from public.repair_tickets where asset_id=p_asset_id and coalesce(status,'Open')<>'Resolved') then 'Needs Attention' else 'Operational' end,
    next_service_date=p_next_service_due where id=p_asset_id;
  return service_id;
end $$;
revoke all on function public.complete_service_v23(uuid,text,jsonb,jsonb,text,numeric,numeric,date,text) from public;
grant execute on function public.complete_service_v23(uuid,text,jsonb,jsonb,text,numeric,numeric,date,text) to anon,authenticated;

-- Ensure current catalogue writes remain available in guest-entry mode.
drop policy if exists "V23 inventory update" on public.parts_inventory;
create policy "V23 inventory update" on public.parts_inventory for update to anon,authenticated using(true) with check(true);

notify pgrst, 'reload schema';
commit;
