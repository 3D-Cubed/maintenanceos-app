# MaintenanceOS V21.6 Test Results

## Automated

- [ ] `npm run build`
- [ ] `npm test`

## Database migration

- [ ] `DB-V21.6-TEST-FIXES.sql` executes successfully in Supabase.

## Manual regression

- [ ] Adjust stock succeeds and creates a stock movement.
- [ ] Stock cannot be reduced below zero.
- [ ] New fault can be submitted with reporter name.
- [ ] Fault remains Open after submission.
- [ ] Repair can only be recorded against an active fault.
- [ ] Editing an asset records a timeline entry.
- [ ] QR link opens the exact asset without requiring a prior session.
- [ ] QR-opened asset page has normal navigation/actions.
- [ ] Part Intelligence Usage Spend stays inside its tile.
- [ ] Existing parts/images/supplier links remain intact.
