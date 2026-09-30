MaintenanceOS V18E - Resin Printer + Wash & Cure Service Workflows

Built from the working project folder supplied by the user.

What changed:
- Added equipment-specific service workflow detection.
- AGV assets open the AGV service workflow.
- FDM / standard 3D printer assets open the FDM 3D printer service workflow.
- Resin printer assets open the Resin Printer service workflow.
- Wash & Cure Station assets open the Wash & Cure Station service workflow.
- General equipment falls back to a generic service workflow.
- Service forms now open as modal popups from Maintenance and Asset pages.
- If a check is not Pass / Good / OK / N/A, a reason/action field appears.
- Completing a service updates asset status and next service date.
- Service summary is logged to audit_log when available.

How asset workflow is selected:
- Type/name/model containing AGV -> AGV workflow
- Type/name/model containing Resin / SLA / MSLA -> Resin workflow
- Type/name/model containing Wash or Cure -> Wash & Cure workflow
- Type/name/model containing FDM / Printer / 3D -> FDM printer workflow
- Otherwise -> General workflow

Recommended asset type names:
- AGV
- FDM 3D Printer
- Resin Printer
- Wash & Cure Station
- General Equipment

Database:
- No database reset required.
- No new SQL is required for this patch.
- Existing assets and repairs remain untouched.

Important:
- Keep your existing .env file when installing.
