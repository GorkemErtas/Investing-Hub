# Review and suggested commits

All work remains on the originally checked-out `main` branch. No file was staged, no commit was made, and no branch/history/configuration operation was performed. Commands below are suggestions for the owner to run after review, not commands executed by the agent. Review the complete working tree first; especially check retained Firebase client config, database compatibility, mobile market coverage and the unresolved verification/security limits.

## Suggested Conventional Commit groups

1. `refactor(shared): centralize validated contracts and decimal domain logic`

   ```powershell
   git add -A -- shared webapp/shared
   ```

2. `refactor(api): consolidate optional owned mobile services into shared backend`

   ```powershell
   git add -A -- backend webapp/backend
   ```

3. `refactor(web): consume shared packages and preserve guest workflows`

   ```powershell
   git add -A -- webapp/src webapp/tests webapp/tsconfig.json webapp/playwright.config.ts webapp/vite.config.ts webapp/package.json webapp/package-lock.json
   ```

4. `refactor(mobile): isolate Expo app and modernize authenticated data flows`

   ```powershell
   git add -A -- mobileapp app components context utils android assets app.json babel.config.js custom-entry.js firebase-headless.js react-native.config.js eas.json tsconfig.json yarn.lock expo ihmobileexpo@1.0.0
   ```

5. `refactor(ml): consolidate offline research and quarantine legacy models`

   ```powershell
   git add -A -- ml webapp/ml
   ```

6. `build: configure monorepo scripts and shared deployment contexts`

   ```powershell
   git add -A -- package.json package-lock.json .gitignore .dockerignore .env.example .nvmrc docker-compose.yml docker-compose.mobile.yml Dockerfile webapp/Dockerfile webapp/docker-compose.yml
   ```

7. `docs: document architecture migration verification and operational limits`

   ```powershell
   git add -A -- README.md docs webapp/docs webapp/README.md
   ```

Backend/mobile README and safe examples are included with their application groups. The root dependency manifest/lock necessarily changes from the old mobile package into the monorepo package; inspect it together with the relocated mobile manifest/lock and shared/backend/web manifests. These groups describe logical ownership; the complete migration is coupled, so review/build the combined result before choosing commit boundaries. Use `git diff --cached` after each owner-run staging command. The agent did not execute any of these commands or commit commands.

## Main moves and replacements

| Before                                                            | After / disposition                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Root `app`, `components`, `context`, `utils`, `assets`, `android` | `mobileapp` equivalents; unused server-only notification utility and broken unused Navbar/CodeEditor removed              |
| Root Expo/Babel/entry/EAS/native config and mobile manifests      | `mobileapp`; npm lock replaces obsolete Yarn lock                                                                         |
| `webapp/backend/src`                                              | Root `backend/src`, retained market logic plus optional secure mobile modules                                             |
| Legacy `backend/server.js`, old Mongoose model/utility files      | Replaced by typed service/repository/router composition; active embedded secrets/routes removed                           |
| `webapp/shared`                                                   | Root `shared`; one ledger/contracts/analysis package for every runtime                                                    |
| `webapp/ml`                                                       | Root `ml`, research source/config/reports preserved                                                                       |
| Both old ONNX/scaler locations                                    | One `ml/archive/legacy-models` copy, verified hashes, excluded from applications/containers                               |
| `webapp/tests` financial/market/API suites                        | Domain suites in `shared/tests`, API/market suites in `backend/tests`; web browser suite retained and storage tests added |
| `webapp/docs`                                                     | `docs/historical-web`, clearly labeled historical; new active root docs                                                   |
| Root legacy Dockerfile and nested Compose                         | Removed; root Compose references root-context application Dockerfiles                                                     |
| Duplicate backend/web npm locks                                   | Removed; root workspace lock and isolated mobile lock remain                                                              |

See `CHANGE_INVENTORY.md` for the full path inventory and `API_COMPATIBILITY.md` for every old endpoint. Build outputs, dependencies, Python datasets/models, private local config and test artifacts remain ignored.
