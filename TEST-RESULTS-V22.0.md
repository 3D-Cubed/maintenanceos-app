# V22.0 Test Results

## Static checks
- JavaScript source syntax checked after V22 changes.
- QR URL generation paths consolidated through `assetDeepLink()`.
- Fault submission path changed from direct RLS-sensitive insert to `report_fault_v22` RPC.
- Stock adjustment path changed to `adjust_part_stock_v22` RPC.
- Repair completion path changed to `complete_fault_repair_v22` RPC.

## Database checks represented by migration
- `parts_stock_movements` created if missing.
- Security-definer stock adjustment transaction.
- Security-definer fault creation transaction.
- Security-definer repair completion transaction.
- Security-definer asset history trigger.
- Explicit guest read/update grants for required operational records.

## Live verification required after deployment
- Supabase migration execution.
- Old QR deep link.
- New QR deep link.
- Fault creation.
- Stock adjustment.
- Repair completion and stock deduction.
- Asset edit/history.
- Part cost tile layout.
