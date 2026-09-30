# MaintenanceOS V19 — Fault-first workflow

30 September 2026. Based on the supplied V18E pack.

- New-ticket and asset/QR forms consistently say **Report Fault**.
- Fault reporting contains asset, fault title, description, priority and optional fault photo. Status is always Open. Repair notes, parts, cost and downtime are captured only in the repair workflow.
- Active faults expose **Record Repair**. The modal identifies the fault reference and asset. **Save Repair & Resolve Fault** saves the linked repair and closes that fault in one database transaction. Resolved faults offer no repair action.
- Additive `fault_repairs` table with required fault and asset references, unique fault linkage, validated notes/cost/downtime, and access inherited through existing ticket visibility. Server guards reject repair-only values at fault creation, mismatched assets, direct fault closure, reopening and duplicate repairs.
- Existing ticket IDs and historical data remain unchanged. Existing resolved tickets retain their original repair fields. No migration backfill invents missing historical repair records.
- Asset status updates atomically with fault creation/resolution; another active fault prevents Operational status. Current reporting continues to use the compatible ticket fields.
- Submission and repair saving now handle rejected requests and thrown network errors, release their busy state in `finally`, and prevent rapid duplicate submissions. Photo failures are shown without silently dropping the evidence.
- Hidden overlays explicitly cannot capture clicks; repair modal is immediately hidden on success, can be cancelled or dismissed with Escape, and closes on navigation. Modal content scrolls within the viewport on desktop and mobile. Toasts do not intercept clicks.
- Routine service retains the active-fault-derived asset status when unresolved faults exist.

## Installation

Run `DB-V19-FAULT-FIRST.sql` against the existing database before deploying the updated app. Preserve `.env` and deployment variables. Follow `README-FIRST.txt`.

## Validation and limits

Production build, PostgreSQL migration/transaction/RLS checks in PGlite, and desktop/mobile Chromium interaction tests passed. Browser tests use a controlled Supabase fixture; no live database or deployed application was accessed. The original page lock was not reproduced from this pack, so the release hardens the submission and overlay lifecycle and verifies that scrolling/navigation remain usable after both fault and repair submissions. Live deployment smoke checks are listed in `README-FIRST.txt`.
