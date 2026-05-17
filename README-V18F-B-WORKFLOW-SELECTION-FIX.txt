MaintenanceOS V18F-B — Workflow Selection Fix

Fixes the service form selection after editing an asset ID card.

Changes:
- Edited equipment type/workflow now takes priority over generic 3D printer matching.
- Resin 3D Printer opens the Resin service workflow.
- FDM 3D Printer opens the FDM service workflow.
- Wash & Cure Station opens the Wash & Cure workflow.
- AGV workflow retained.
- Conditional reason/action notes retained for failed/monitor/worn checks.

No database changes required.
Keep your existing .env file.
