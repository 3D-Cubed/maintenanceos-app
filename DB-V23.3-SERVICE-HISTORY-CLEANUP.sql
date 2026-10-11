-- MaintenanceOS V23.3 - canonical service history
-- Service records are the source of truth for completed-service timeline events.
-- Asset history remains for asset edits and other audit events.
-- Safe: does not delete service_records or parts_usage/stock movements.
begin;

-- Remove the V23.2 trigger which duplicated service events already rendered
-- directly from service_records by the application.
drop trigger if exists v23_service_asset_history on public.service_records;
drop function if exists public.v23_record_service_history();

-- Remove only the synthetic service-history rows created by V23.2.
-- Genuine asset history such as edits, faults and creation events is untouched.
delete from public.asset_history
where action = 'asset_serviced'
   or lower(coalesce(title, '')) like 'service completed:%';

notify pgrst, 'reload schema';
commit;
