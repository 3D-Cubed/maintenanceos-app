# V19 validation

30 September 2026. Node 24.19.0, Vite 8.0.11, Chromium 153, PGlite PostgreSQL runtime.

| Check | Result |
|---|---|
| Production build (`npm run build`) | Passed |
| JavaScript syntax | Passed |
| Migration application and rerun | Passed |
| Existing historical/active records unchanged by migration | Passed |
| Open-only fault creation; repair fields rejected at creation | Passed |
| Repair requires matching active fault and asset | Passed |
| Required notes; negative/non-finite numbers rejected; zero accepted | Passed |
| Direct fault closure and reopening rejected | Passed |
| Repair/fault/asset status transaction; direct repair insert also closes fault | Passed |
| Duplicate completion rejected | Passed |
| Other active faults keep asset needing attention | Passed |
| Existing active ticket can be repaired | Passed |
| Invisible tickets inaccessible through repair RLS | Passed |
| Denied ticket or asset updates roll back repair insertion | Passed |
| Caller cannot delete linked repair history | Passed |
| Desktop (1440×900) and mobile (390×844) Chromium interactions | Passed |
| Fault-only fields on both Faults & Repairs and asset/QR routes | Passed |
| Validation, thrown network error, photo failure and retry | Passed |
| Rapid double-click creates one fault | Passed |
| Scroll and sidebar navigation after fault/repair submissions | Passed |
| Repair modal cancel, Escape, reopen and route cleanup | Passed |
| Failed repair request preserves form and re-enables save | Passed |
| Repair submission carries both fault and asset references | Passed |
| Resolved faults expose no repair action | Passed |
| Desktop/mobile modal layout inspected | Passed |

The database suite executes the real SQL migration/functions/triggers under owner,
anonymous and authenticated roles using representative baseline tables. The browser
suite executes the app source and stylesheet with deterministic Supabase fixtures.
It does not contact Supabase. Tests are included in `tests/` and can be rerun.

No live deployment, production credentials, real storage upload or production data
was accessed. Multi-session concurrency was not load-tested. The initial reported
page lock could not be reproduced in this pack; submission/overlay lifecycle paths
were hardened and the resulting scrolling and interaction behavior was verified.
Complete the deployment smoke check in `README-FIRST.txt` against a test asset.
