-- MaintenanceOS V23.2 - service visibility and asset history
-- Safe/additive: does not delete or alter existing service records.
begin;

-- Record every future completed service in the asset timeline.
create or replace function public.v23_record_service_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.asset_history(asset_id, action, title, detail)
  values(
    new.asset_id,
    'asset_serviced',
    'Service completed: ' || coalesce(new.service_category, 'Service'),
    coalesce(new.parts_replaced, 'Inspection/service completed') ||
      case when coalesce(new.total_cost,0) > 0 then ' • £' || to_char(new.total_cost, 'FM999999990.00') else '' end
  );
  return new;
end $$;

drop trigger if exists v23_service_asset_history on public.service_records;
create trigger v23_service_asset_history
after insert on public.service_records
for each row execute function public.v23_record_service_history();

-- Backfill the service timeline for services already completed before this release.
insert into public.asset_history(asset_id, action, title, detail, created_at)
select
  s.asset_id,
  'asset_serviced',
  'Service completed: ' || coalesce(s.service_category, 'Service'),
  coalesce(s.parts_replaced, 'Inspection/service completed') ||
    case when coalesce(s.total_cost,0) > 0 then ' • £' || to_char(s.total_cost, 'FM999999990.00') else '' end,
  coalesce(s.completed_at, now())
from public.service_records s
where not exists (
  select 1 from public.asset_history h
  where h.asset_id = s.asset_id
    and h.action = 'asset_serviced'
    and h.title = 'Service completed: ' || coalesce(s.service_category, 'Service')
    and h.created_at between coalesce(s.completed_at, now()) - interval '2 seconds' and coalesce(s.completed_at, now()) + interval '2 seconds'
);

notify pgrst, 'reload schema';
commit;
