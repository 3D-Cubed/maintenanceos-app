# V21.2 test results

- `node --check src/main.js`: PASS.
- Production Vite build in this Linux packaging environment: BLOCKED because the uploaded Windows dependency tree does not contain the optional Linux Rolldown native binding. This is the same environment-specific issue seen on prior releases.
- Required release gate on the deployment PC: run `npm run build` before committing/pushing.
- Database migration is additive and preserves existing `parts_inventory` rows.
