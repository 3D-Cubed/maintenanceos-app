MaintenanceOS V18F - Editable Asset ID Cards

Changes included:
- Added Edit Asset button on asset record pages.
- Added Edit ID Card modal for asset name, type/workflow, serial, location, manufacturer, model/version, status, next service date and notes.
- Added equipment workflow options for AGV, FDM 3D Printer, Resin 3D Printer, Wash & Cure Station and General Equipment.
- Asset details now refresh after save.
- No database changes required.

Install:
1. Back up your current working project folder.
2. Copy this update into your current project folder and replace files.
3. Keep your existing .env file.
4. Run npm install if required.
5. Run npm run dev.

Push:
git status
git add .
git commit -m "V18F editable asset ID cards"
git push
