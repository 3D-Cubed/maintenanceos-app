MaintenanceOS V18E - Resin Printer and Wash & Cure Workflows

Built from the latest working Git project folder supplied by Simon.

What changed:
- Added Resin Printer service workflow.
- Added Wash & Cure Station service workflow.
- FDM 3D printer workflow retained.
- AGV workflow retained.
- Service form now chooses the correct workflow based on asset name, type, model and location.
- Non-pass / non-good checks still reveal reason/action note boxes.
- No database reset required.
- No Supabase schema changes required.

Workflow detection:
- AGV: asset name/type/model includes AGV, automated guided, vehicle.
- Wash & Cure: asset name/type/model/location includes wash, cure, curing or IPA.
- Resin printer: asset name/type/model/location includes resin, SLA, LCD or MSLA.
- FDM printer: normal printer / 3D print assets that are not resin or wash/cure.

Install:
1. Back up your current project folder.
2. Copy this update over the current working project folder.
3. Keep your existing .env file.
4. Run npm install.
5. Run npm run dev.
6. Test AGV, FDM printer, Resin printer and Wash & Cure service forms.

Push:
1. git status
2. Confirm .env is not included.
3. git add .
4. git commit -m "V18E resin and wash cure service workflows"
5. git push
