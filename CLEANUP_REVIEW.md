# Project cleanup review

Status: approved cleanup completed. Deleted exactly the 68 listed files and the three empty .audit-originals directories. SHA-256 checks confirmed all 537 retained files were unchanged immediately after deletion. This report was then updated to record completion. Verification passed: node --test --test-reporter=dot completed with exit code 0, and node --check server.mjs passed.

Inventory: 604 files, 81 directories, 175,861,752 bytes before this report. Includes hidden folders, vendor code, assets and model library. No AGENTS.md was found inside this project.

Completed approved cleanup: **68 files**, **3,062,723 bytes (2.92 MiB)** removed.

## Exact approved deletions (completed)

| File | Reason |
| --- | --- |
| `.audit-originals/build.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/catalog.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/catalog.test.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/checkInput.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/config.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/engine.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/engine.test.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/kitchen.html.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/loadCatalog.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/p4.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/p5.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/p6.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/package.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/page.template.html.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/rules.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/server.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/server.test.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/spec.json.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/suggest.mjs.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/ui.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/ui/builder.html.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/ui/finishes.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/accessories.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/apiRuntime.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/cabinetCode.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/catalog.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/costEstimate.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/costing.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/db.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/designApi.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/designStore.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/elevations.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/libraryApi.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/pricingConfig.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/rules.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/saleablePricing.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/series.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `.audit-originals/vendor/shareApi.js.bak` | Old audit backup; no runtime dependency. Removes this rollback copy. |
| `ui/debug-6450-preview.html` | Standalone debug preview; no links or code references found. |
| `verification/alignment-3600-api.json` | Saved debugging request/result; no code input reference found. |
| `verification/alignment-3600-result.json` | Saved debugging request/result; no code input reference found. |
| `verification/archive-pre-rule-2-previews.mjs` | One-off script that marked old previews as historical; not imported or in package scripts. |
| `verification/archive-pre-rule-3-previews.mjs` | One-off script that marked old previews as historical; not imported or in package scripts. |
| `verification/corner-clearance-api.json` | Saved debugging request/result; no code input reference found. |
| `verification/empty-6450-fixed.json` | Saved debugging request/result; no code input reference found. |
| `verification/empty-6450-live-fixed.json` | Saved debugging request/result; no code input reference found. |
| `verification/empty-6450-state.json` | Saved debugging request/result; no code input reference found. |
| `verification/filler-3600-api.json` | Saved debugging request/result; no code input reference found. |
| `verification/filler-3600-request.json` | Saved debugging request/result; no code input reference found. |
| `verification/filler-3600-result.json` | Saved debugging request/result; no code input reference found. |
| `verification/live-p9-fit-result.json` | Saved debugging request/result; no code input reference found. |
| `verification/reference-api-result.json` | Generated output of reference-api.mjs; script recreates it. |
| `verification/test-blind-fronts-core.log` | Historical test log; no input dependency. |
| `verification/test-blind-fronts-first.log` | Historical test log; no input dependency. |
| `verification/test-blind-fronts.log` | Historical test log; no input dependency. |
| `verification/test-current.log` | Historical test log; no input dependency. |
| `verification/test-engine-fillers.log` | Historical test log; no input dependency. |
| `verification/test-fillers-placement.log` | Historical test log; no input dependency. |
| `verification/test-fillers-remaining.log` | Historical test log; no input dependency. |
| `verification/test-gap-fillers.log` | Historical test log; no input dependency. |
| `verification/test-generation-repair.log` | Historical test log; no input dependency. |
| `verification/test-placement-rule4.log` | Historical test log; no input dependency. |
| `verification/test-remaining-rule4.log` | Historical test log; no input dependency. |
| `verification/test-rule4.log` | Historical test log; no input dependency. |
| `verification/test-rule6-final-targeted.log` | Historical test log; no input dependency. |
| `verification/test-rule6-ui.log` | Historical test log; no input dependency. |
| `verification/test-rule6.log` | Historical test log; no input dependency. |
| `verification/test-storage-rule4.log` | Historical test log; no input dependency. |

## Files retained and dependency findings

- All 19 root automated test files: useful regression checks, not disposable test outputs. Several actively consume files under verification/.
- verification/fixtures.mjs, run-end-fixtures.mjs, alignment-3600.json, filler-3600-input.json, empty-6450-request.json and live-p9-request.json: current test dependencies.
- p4.json through p8.json and p8-fitted.json: build.mjs reads all six. p4.json is also the default input for engine.mjs, checkInput.mjs and suggest.mjs. p9.json and p9-proposed.json are consumed by current regression tests.
- ui/reference.html and ui/reference-l.html: directly linked in ui/builder.html. All three reference HTML pages, including ui/reference-p9.html, have automated tests. Removing these requires removing interface links and revising preview-specific tests.
- build.mjs, page.template.html, ui.js and kitchen.html: the existing npm run build workflow and its generated standalone page. Keep while that workflow is supported.
- Remaining verification scripts and their inputs: retained reusable checks and preview generators. wall-live-result.json is read as an input by wall-api.mjs despite its result-like filename. filler-3600-state.json is read by preview-sink-fillers.mjs.
- db/: saved design database, SQLite journal/shared-memory files, and migrations. Retain all. verification/design.sqlite and its journals are also held until confirmed disposable and inactive; folder naming alone does not prove this. Process command-line inspection was denied by the environment, so database inactivity was not verified.
- ui/models/: all 244 GLB files are listed in data/module-models.json, including the model whose filename ends in (2). Keep them.
- ui/assets/: product pictures, finish textures and configuration. drawers-2.png and drawers-3.png are dynamically selected by filename interpolation in builder.html. Identical image bytes under different referenced filenames are not sufficient grounds for deletion.
- data/: live catalog, model mappings, pricing and series configuration. The accessories/appliances master directories are original spreadsheet extracts and source images, not test artifacts. Duplicate CSV copies were found inside each master directory, but manifests document those source exports. Retain unless source archive removal is explicitly wanted.
- data/carcass-shutter-codes.json and spec.json have no direct code filename reference found, but contain reference/specification data. Do not infer they are unwanted from that alone.
- deliverables/: saved layouts and exports, plus Kitchen Layout Architecture Research.docx. The layout JSON files support preview generation. Existing documentation records user-selected historical layouts. Retain this work unless retiring saved reference designs is explicitly approved.
- PLANNING.md: project rules and implementation history, with some historical sections. ui/assets/README.md contains older paths; it can be updated rather than deleted.
- vendor/: 16 service modules used by the app; this is application support code, not a disposable dependency cache.
- .claude/settings.json: existing project tool configuration. Retain.

## Optional wider cleanup (not included in approval for the first cleanup)

- Retire the reference/demo experience as a separate change: remove relevant UI links, preview-only scripts and exports, and revise preview-specific tests together. Preserve the research document and useful regression input data.
- Remove ui/assets/hob/spice.jpg if the unused product image is unwanted: no filename reference was found and it duplicates data/accessories-master/media/image10.jpg. Left out of the first cleanup because it is product source material.
- Consolidate duplicate source CSV exports only with corresponding manifest/README updates. This is data housekeeping rather than removal of test output.
- Remove verification/design.sqlite and its -wal/-shm files only after confirming the data is disposable and stopping any process using it.

## Verification and limitations

Performed a complete file/directory inventory, inspected entry points and package commands, traced code and fixture references, compared the complete GLB library against its manifest, checked asset filenames including dynamic drawer images, and hashed CSV/image/model files to find exact duplicates. Static references cannot prove whether someone opens an otherwise unlinked file manually. Binary model internals and the research document contents were not semantically reviewed. The server syntax check passed after deletion. The full automated regression suite passed (node --test --test-reporter=dot, exit code 0). No build was run because rebuilding would overwrite the retained generated kitchen.html.

## Complete file inventory

Every pre-existing file is listed below. KEEP means retained, including historical data needing a separate decision. DELETED marks the 68 approved removals.

| File | Bytes | Action |
| --- | ---: | --- |
| `.audit-originals/build.mjs.bak` | 2262 | DELETED |
| `.audit-originals/catalog.mjs.bak` | 6368 | DELETED |
| `.audit-originals/catalog.test.mjs.bak` | 6667 | DELETED |
| `.audit-originals/checkInput.mjs.bak` | 7995 | DELETED |
| `.audit-originals/config.mjs.bak` | 318 | DELETED |
| `.audit-originals/engine.mjs.bak` | 47742 | DELETED |
| `.audit-originals/engine.test.mjs.bak` | 15736 | DELETED |
| `.audit-originals/kitchen.html.bak` | 141008 | DELETED |
| `.audit-originals/loadCatalog.mjs.bak` | 2490 | DELETED |
| `.audit-originals/p4.json.bak` | 1830 | DELETED |
| `.audit-originals/p5.json.bak` | 1615 | DELETED |
| `.audit-originals/p6.json.bak` | 1295 | DELETED |
| `.audit-originals/package.json.bak` | 241 | DELETED |
| `.audit-originals/page.template.html.bak` | 11866 | DELETED |
| `.audit-originals/rules.json.bak` | 36026 | DELETED |
| `.audit-originals/server.mjs.bak` | 27338 | DELETED |
| `.audit-originals/server.test.mjs.bak` | 6900 | DELETED |
| `.audit-originals/spec.json.bak` | 12249 | DELETED |
| `.audit-originals/suggest.mjs.bak` | 2874 | DELETED |
| `.audit-originals/ui/builder.html.bak` | 630959 | DELETED |
| `.audit-originals/ui/finishes.js.bak` | 18681 | DELETED |
| `.audit-originals/ui.js.bak` | 18826 | DELETED |
| `.audit-originals/vendor/accessories.js.bak` | 2869 | DELETED |
| `.audit-originals/vendor/apiRuntime.js.bak` | 8164 | DELETED |
| `.audit-originals/vendor/cabinetCode.js.bak` | 3007 | DELETED |
| `.audit-originals/vendor/catalog.js.bak` | 3531 | DELETED |
| `.audit-originals/vendor/costEstimate.js.bak` | 7509 | DELETED |
| `.audit-originals/vendor/costing.js.bak` | 2108 | DELETED |
| `.audit-originals/vendor/db.js.bak` | 2584 | DELETED |
| `.audit-originals/vendor/designApi.js.bak` | 4867 | DELETED |
| `.audit-originals/vendor/designStore.js.bak` | 16773 | DELETED |
| `.audit-originals/vendor/elevations.js.bak` | 1683 | DELETED |
| `.audit-originals/vendor/libraryApi.js.bak` | 5784 | DELETED |
| `.audit-originals/vendor/pricingConfig.js.bak` | 2526 | DELETED |
| `.audit-originals/vendor/rules.js.bak` | 2704 | DELETED |
| `.audit-originals/vendor/saleablePricing.js.bak` | 2523 | DELETED |
| `.audit-originals/vendor/series.js.bak` | 4985 | DELETED |
| `.audit-originals/vendor/shareApi.js.bak` | 11812 | DELETED |
| `.claude/settings.json` | 60 | KEEP |
| `alignment.test.mjs` | 2596 | KEEP |
| `blind-corners.test.mjs` | 4607 | KEEP |
| `blind-fronts.test.mjs` | 4998 | KEEP |
| `build.mjs` | 2343 | KEEP |
| `cabinets.csv` | 70314 | KEEP |
| `catalog.mjs` | 6368 | KEEP |
| `catalog.test.mjs` | 6667 | KEEP |
| `checkInput.mjs` | 10588 | KEEP |
| `config.mjs` | 318 | KEEP |
| `data/accessories-master/accessories-master.json` | 173904 | KEEP |
| `data/accessories-master/csv/01_Kitchen Accessories.csv` | 6005 | KEEP |
| `data/accessories-master/csv/02_Copy of Kitchen Modules.csv` | 4560 | KEEP |
| `data/accessories-master/csv/03_Shutters.csv` | 1706 | KEEP |
| `data/accessories-master/csv/04_Shutter Parts Detail.csv` | 3195 | KEEP |
| `data/accessories-master/csv/05_Copy of Cabinet price.csv` | 13814 | KEEP |
| `data/accessories-master/csv/06_Copy of Kitchen Modules (1).csv` | 4560 | KEEP |
| `data/accessories-master/csv/07_Shutters (1).csv` | 1706 | KEEP |
| `data/accessories-master/csv/08_Shutter Parts Detail (1).csv` | 3195 | KEEP |
| `data/accessories-master/csv/09_Copy of Cabinet price (1).csv` | 13814 | KEEP |
| `data/accessories-master/csv/10_Copy of Kitchen Modules (2).csv` | 4560 | KEEP |
| `data/accessories-master/csv/11_Shutters (2).csv` | 1706 | KEEP |
| `data/accessories-master/csv/12_Shutter Parts Detail (2).csv` | 3195 | KEEP |
| `data/accessories-master/manifest.json` | 3600 | KEEP |
| `data/accessories-master/media/image1.jpg` | 234948 | KEEP |
| `data/accessories-master/media/image10.jpg` | 462333 | KEEP |
| `data/accessories-master/media/image11.jpg` | 117602 | KEEP |
| `data/accessories-master/media/image12.jpg` | 370578 | KEEP |
| `data/accessories-master/media/image13.png` | 1750801 | KEEP |
| `data/accessories-master/media/image14.jpg` | 16938 | KEEP |
| `data/accessories-master/media/image15.jpg` | 24275 | KEEP |
| `data/accessories-master/media/image16.jpg` | 613926 | KEEP |
| `data/accessories-master/media/image17.jpg` | 357207 | KEEP |
| `data/accessories-master/media/image18.jpg` | 284360 | KEEP |
| `data/accessories-master/media/image19.jpg` | 356155 | KEEP |
| `data/accessories-master/media/image2.jpg` | 16945 | KEEP |
| `data/accessories-master/media/image20.jpg` | 397686 | KEEP |
| `data/accessories-master/media/image21.jpg` | 628320 | KEEP |
| `data/accessories-master/media/image22.jpg` | 26029 | KEEP |
| `data/accessories-master/media/image23.png` | 1709398 | KEEP |
| `data/accessories-master/media/image24.jpg` | 338887 | KEEP |
| `data/accessories-master/media/image25.jpg` | 405066 | KEEP |
| `data/accessories-master/media/image3.jpg` | 138979 | KEEP |
| `data/accessories-master/media/image4.jpg` | 32107 | KEEP |
| `data/accessories-master/media/image5.jpg` | 217590 | KEEP |
| `data/accessories-master/media/image6.jpg` | 26267 | KEEP |
| `data/accessories-master/media/image7.png` | 197823 | KEEP |
| `data/accessories-master/media/image8.jpg` | 452659 | KEEP |
| `data/accessories-master/media/image9.jpg` | 32523 | KEEP |
| `data/accessories-master/README.md` | 2797 | KEEP |
| `data/appliances-master/appliances-master.json` | 164301 | KEEP |
| `data/appliances-master/csv/01_Kitchen Appliances.csv` | 3531 | KEEP |
| `data/appliances-master/csv/02_Copy of Kitchen Modules.csv` | 4304 | KEEP |
| `data/appliances-master/csv/03_Shutters.csv` | 1640 | KEEP |
| `data/appliances-master/csv/04_Shutter Parts Detail.csv` | 3173 | KEEP |
| `data/appliances-master/csv/05_Copy of Cabinet price.csv` | 13381 | KEEP |
| `data/appliances-master/csv/06_Copy of Kitchen Modules (1).csv` | 4304 | KEEP |
| `data/appliances-master/csv/07_Shutters (1).csv` | 1640 | KEEP |
| `data/appliances-master/csv/08_Shutter Parts Detail (1).csv` | 3173 | KEEP |
| `data/appliances-master/csv/09_Copy of Cabinet price (1).csv` | 13381 | KEEP |
| `data/appliances-master/csv/10_Copy of Kitchen Modules (2).csv` | 4304 | KEEP |
| `data/appliances-master/csv/11_Shutters (2).csv` | 1640 | KEEP |
| `data/appliances-master/csv/12_Shutter Parts Detail (2).csv` | 3173 | KEEP |
| `data/appliances-master/manifest.json` | 2887 | KEEP |
| `data/appliances-master/media/image1.png` | 54818 | KEEP |
| `data/appliances-master/media/image10.png` | 66987 | KEEP |
| `data/appliances-master/media/image11.png` | 68522 | KEEP |
| `data/appliances-master/media/image12.png` | 44386 | KEEP |
| `data/appliances-master/media/image13.png` | 83164 | KEEP |
| `data/appliances-master/media/image14.png` | 39353 | KEEP |
| `data/appliances-master/media/image15.png` | 59939 | KEEP |
| `data/appliances-master/media/image16.png` | 76409 | KEEP |
| `data/appliances-master/media/image17.png` | 68373 | KEEP |
| `data/appliances-master/media/image18.png` | 54965 | KEEP |
| `data/appliances-master/media/image19.png` | 60460 | KEEP |
| `data/appliances-master/media/image2.png` | 44035 | KEEP |
| `data/appliances-master/media/image20.png` | 45369 | KEEP |
| `data/appliances-master/media/image21.png` | 37156 | KEEP |
| `data/appliances-master/media/image22.png` | 63437 | KEEP |
| `data/appliances-master/media/image23.png` | 69065 | KEEP |
| `data/appliances-master/media/image3.png` | 65584 | KEEP |
| `data/appliances-master/media/image4.png` | 209158 | KEEP |
| `data/appliances-master/media/image5.png` | 77724 | KEEP |
| `data/appliances-master/media/image6.png` | 165298 | KEEP |
| `data/appliances-master/media/image7.png` | 80681 | KEEP |
| `data/appliances-master/media/image8.png` | 32104 | KEEP |
| `data/appliances-master/media/image9.png` | 74939 | KEEP |
| `data/appliances-master/README.md` | 1123 | KEEP |
| `data/carcass-shutter-codes.json` | 63860 | KEEP |
| `data/catalog/modules.json` | 24817 | KEEP |
| `data/module-models.json` | 84781 | KEEP |
| `data/module-prices.json` | 568 | KEEP |
| `data/price-matrix.json` | 5759 | KEEP |
| `data/quote-config.json` | 873 | KEEP |
| `data/rate-master.json` | 3011 | KEEP |
| `data/remarks.json` | 475 | KEEP |
| `data/series.json` | 2747 | KEEP |
| `db/design.sqlite` | 7671808 | KEEP |
| `db/design.sqlite-shm` | 32768 | KEEP |
| `db/design.sqlite-wal` | 4738032 | KEEP |
| `db/migrations/001_init.sql` | 3635 | KEEP |
| `db/migrations/002_shares.sql` | 642 | KEEP |
| `db/migrations/003_designer_dashboard.sql` | 1127 | KEEP |
| `deliverables/Kitchen Layout Architecture Research.docx` | 95510 | KEEP |
| `deliverables/kitchen-l-2d.html` | 141962 | KEEP |
| `deliverables/kitchen-l-base-2d.png` | 186825 | KEEP |
| `deliverables/kitchen-l-base-2d.svg` | 21410 | KEEP |
| `deliverables/kitchen-l-layout.json` | 31538 | KEEP |
| `deliverables/kitchen-l-wall-2d.png` | 187091 | KEEP |
| `deliverables/kitchen-l-wall-2d.svg` | 19808 | KEEP |
| `deliverables/kitchen-p9-2d.html` | 323832 | KEEP |
| `deliverables/kitchen-p9-base-2d.png` | 168317 | KEEP |
| `deliverables/kitchen-p9-base-2d.svg` | 14349 | KEEP |
| `deliverables/kitchen-p9-original.json` | 166037 | KEEP |
| `deliverables/kitchen-p9-proposal.json` | 194658 | KEEP |
| `deliverables/kitchen-p9-wall-2d.png` | 165466 | KEEP |
| `deliverables/kitchen-p9-wall-2d.svg` | 14244 | KEEP |
| `deliverables/kitchen-reference-2d.html` | 152598 | KEEP |
| `deliverables/kitchen-reference-2d.png` | 166161 | KEEP |
| `deliverables/kitchen-reference-2d.svg` | 17028 | KEEP |
| `deliverables/kitchen-reference-layout.json` | 144865 | KEEP |
| `deliverables/kitchen-reference-wall-2d.png` | 160736 | KEEP |
| `deliverables/kitchen-reference-wall-2d.svg` | 15677 | KEEP |
| `deliverables/README.md` | 498 | KEEP |
| `deliverables/sink-fillers-before-after.svg` | 3686 | KEEP |
| `engine.mjs` | 74804 | KEEP |
| `engine.test.mjs` | 16192 | KEEP |
| `fitting.mjs` | 12940 | KEEP |
| `fitting.test.mjs` | 2791 | KEEP |
| `gap-fillers.test.mjs` | 4445 | KEEP |
| `generation-repair.test.mjs` | 2772 | KEEP |
| `geometry.test.mjs` | 7126 | KEEP |
| `kitchen.html` | 179330 | KEEP |
| `l-reference-preview.mjs` | 14399 | KEEP |
| `l-reference.test.mjs` | 2836 | KEEP |
| `loadCatalog.mjs` | 2490 | KEEP |
| `p4.json` | 1830 | KEEP |
| `p5.json` | 1615 | KEEP |
| `p6.json` | 1295 | KEEP |
| `p7.json` | 1862 | KEEP |
| `p8-fitted.json` | 3789 | KEEP |
| `p8.json` | 2184 | KEEP |
| `p9-preview.mjs` | 13724 | KEEP |
| `p9-preview.test.mjs` | 2103 | KEEP |
| `p9-proposed.json` | 3693 | KEEP |
| `p9.json` | 1522 | KEEP |
| `package.json` | 241 | KEEP |
| `page.template.html` | 11866 | KEEP |
| `planner.mjs` | 9642 | KEEP |
| `planner.test.mjs` | 3837 | KEEP |
| `PLANNING.md` | 18686 | KEEP |
| `reference-preview.mjs` | 16218 | KEEP |
| `reference-preview.test.mjs` | 1292 | KEEP |
| `rule-log.test.mjs` | 3088 | KEEP |
| `rules.json` | 38899 | KEEP |
| `run-end.test.mjs` | 3809 | KEEP |
| `server.mjs` | 35816 | KEEP |
| `server.test.mjs` | 6911 | KEEP |
| `spec.json` | 14735 | KEEP |
| `storage-rules.test.mjs` | 4391 | KEEP |
| `suggest.mjs` | 2874 | KEEP |
| `ui/assets/appliances/fridge-builtin.png` | 44035 | KEEP |
| `ui/assets/appliances/fridge-freestanding.png` | 54818 | KEEP |
| `ui/assets/appliances/hob.png` | 209158 | KEEP |
| `ui/assets/appliances/sink.png` | 45369 | KEEP |
| `ui/assets/appliances/veggie-sink.png` | 60460 | KEEP |
| `ui/assets/config/corner-lehman.jpg` | 16945 | KEEP |
| `ui/assets/config/fridge-pantry.jpg` | 24275 | KEEP |
| `ui/assets/config/fridge-tandem-pantry.jpg` | 26267 | KEEP |
| `ui/assets/config/sink-bottle-double.jpg` | 32107 | KEEP |
| `ui/assets/config/sink-bottle-single.jpg` | 32523 | KEEP |
| `ui/assets/config/sink-detergent-1.jpg` | 284360 | KEEP |
| `ui/assets/config/sink-detergent-3.jpg` | 405066 | KEEP |
| `ui/assets/config/sink-wastebin-14.jpg` | 338887 | KEEP |
| `ui/assets/config/sink-wastebin-30.jpg` | 397686 | KEEP |
| `ui/assets/config-accessories.json` | 3606 | KEEP |
| `ui/assets/finish-mapping.json` | 587 | KEEP |
| `ui/assets/finishes/pg1/art.jpg` | 132611 | KEEP |
| `ui/assets/finishes/pg1/calm.jpg` | 28700 | KEEP |
| `ui/assets/finishes/pg1/d-este.jpg` | 198960 | KEEP |
| `ui/assets/finishes/pg1/earth.jpg` | 383643 | KEEP |
| `ui/assets/finishes/pg1/elegance.jpg` | 96962 | KEEP |
| `ui/assets/finishes/pg1/flurry.jpg` | 370496 | KEEP |
| `ui/assets/finishes/pg1/forest.jpg` | 747363 | KEEP |
| `ui/assets/finishes/pg1/gulnaar.jpg` | 319667 | KEEP |
| `ui/assets/finishes/pg1/jewel.jpg` | 199516 | KEEP |
| `ui/assets/finishes/pg1/king.jpg` | 300234 | KEEP |
| `ui/assets/finishes/pg1/onyx-black.jpg` | 199068 | KEEP |
| `ui/assets/finishes/pg1/onyx-gold.jpg` | 104922 | KEEP |
| `ui/assets/finishes/pg1/onyx-mystic.jpg` | 49136 | KEEP |
| `ui/assets/finishes/pg1/palace.jpg` | 256749 | KEEP |
| `ui/assets/finishes/pg1/persian-traventine.jpg` | 376189 | KEEP |
| `ui/assets/finishes/pg1/river.jpg` | 281958 | KEEP |
| `ui/assets/finishes/pg1/romano.jpg` | 132008 | KEEP |
| `ui/assets/finishes/pg1/santorini.jpg` | 466994 | KEEP |
| `ui/assets/finishes/pg1/taj.jpg` | 247728 | KEEP |
| `ui/assets/finishes/pg1/timeless.jpg` | 160232 | KEEP |
| `ui/assets/finishes/pg1/travertino.jpg` | 287537 | KEEP |
| `ui/assets/finishes/pg1/veilstone.jpg` | 100527 | KEEP |
| `ui/assets/finishes/pg1/veticano.jpg` | 299705 | KEEP |
| `ui/assets/finishes/pg2/amber.jpg` | 164080 | KEEP |
| `ui/assets/finishes/pg2/beige-muse.jpg` | 19812 | KEEP |
| `ui/assets/finishes/pg2/breeze.jpg` | 1652672 | KEEP |
| `ui/assets/finishes/pg2/cloudstone.jpg` | 150417 | KEEP |
| `ui/assets/finishes/pg2/cosmic.png` | 5412291 | KEEP |
| `ui/assets/finishes/pg2/cream-stone.jpg` | 13744 | KEEP |
| `ui/assets/finishes/pg2/dusk.jpg` | 13747 | KEEP |
| `ui/assets/finishes/pg2/earth-grey.jpg` | 547983 | KEEP |
| `ui/assets/finishes/pg2/earth-taupe.jpg` | 534657 | KEEP |
| `ui/assets/finishes/pg2/galaxy.jpg` | 1579578 | KEEP |
| `ui/assets/finishes/pg2/graphite.jpg` | 13711 | KEEP |
| `ui/assets/finishes/pg2/myra-sand.jpg` | 31511 | KEEP |
| `ui/assets/finishes/pg2/neo-brown.jpg` | 40330 | KEEP |
| `ui/assets/finishes/pg2/sage.jpg` | 358054 | KEEP |
| `ui/assets/finishes/pg2/sahara.jpg` | 703856 | KEEP |
| `ui/assets/finishes/pg2/terrazo-grey.jpg` | 866645 | KEEP |
| `ui/assets/finishes/pg2/vanilla.jpg` | 1069716 | KEEP |
| `ui/assets/finishes/pg2/white-muse.jpg` | 26186 | KEEP |
| `ui/assets/fridge/fridge-glass-shelves.png` | 537574 | KEEP |
| `ui/assets/fridge/fridge-otg.png` | 256855 | KEEP |
| `ui/assets/fridge/fridge-pantry-otg.png` | 601279 | KEEP |
| `ui/assets/fridge/fridge-tall-cabinet.png` | 157792 | KEEP |
| `ui/assets/hob/cutlery-900.png` | 1709398 | KEEP |
| `ui/assets/hob/cutlery.jpg` | 370578 | KEEP |
| `ui/assets/hob/drawers-2.png` | 98227 | KEEP |
| `ui/assets/hob/drawers-3.png` | 181560 | KEEP |
| `ui/assets/hob/hob-600.webp` | 81974 | KEEP |
| `ui/assets/hob/hob-900.jpg` | 48009 | KEEP |
| `ui/assets/hob/pulse-large.jpg` | 357207 | KEEP |
| `ui/assets/hob/pulse-medium.jpg` | 357207 | KEEP |
| `ui/assets/hob/rolling.jpg` | 356155 | KEEP |
| `ui/assets/hob/sides-2d-900-each.png` | 227960 | KEEP |
| `ui/assets/hob/sides-3d-600-each.png` | 602779 | KEEP |
| `ui/assets/hob/sides-3d-900-each.png` | 326838 | KEEP |
| `ui/assets/hob/sides-3d-grain-right.png` | 177675 | KEEP |
| `ui/assets/hob/spice.jpg` | 462333 | KEEP |
| `ui/assets/hob-accessories.json` | 1766 | KEEP |
| `ui/assets/kubos.jpg` | 26029 | KEEP |
| `ui/assets/README.md` | 854 | KEEP |
| `ui/assets/sink/sink-600.png` | 60265 | KEEP |
| `ui/assets/sink/sink-900-1200-dw.png` | 141034 | KEEP |
| `ui/assets/sink/sink-900-1200.png` | 43230 | KEEP |
| `ui/assets/tark.jpg` | 138979 | KEEP |
| `ui/builder.html` | 609882 | KEEP |
| `ui/debug-6450-preview.html` | 5200 | DELETED |
| `ui/finishes.js` | 18681 | KEEP |
| `ui/geometry.js` | 2126 | KEEP |
| `ui/models/Accessories/FLOATING SHELF 1200 MM.glb` | 225008 | KEEP |
| `ui/models/Accessories/FLOATING SHELF 600 MM.glb` | 115364 | KEEP |
| `ui/models/Accessories/FLOATING SHELF 900 MM.glb` | 115340 | KEEP |
| `ui/models/Accessories/HOOD PANEL 1000X 500.glb` | 33052 | KEEP |
| `ui/models/Accessories/HOOD PANEL 1000X 850.glb` | 33052 | KEEP |
| `ui/models/Accessories/HOOD PANEL 700 X 850.glb` | 33052 | KEEP |
| `ui/models/Accessories/HOOD PANEL700X 500.glb` | 33052 | KEEP |
| `ui/models/Accessories/Magppie Kubos 2 W-300mm , D-336mm, H-1080mm.glb` | 82320 | KEEP |
| `ui/models/Accessories/Magppie Kubos 6 W-300mm , D-560mm, H-2400mm.glb` | 90208 | KEEP |
| `ui/models/Accessories/RS VP 1290  L.glb` | 33048 | KEEP |
| `ui/models/Accessories/RS VP 1290 R.glb` | 33044 | KEEP |
| `ui/models/Accessories/RS VP 1650 L.glb` | 33044 | KEEP |
| `ui/models/Accessories/RS VP 1650 R.glb` | 33040 | KEEP |
| `ui/models/Accessories/TALL VP 2400 R.glb` | 33048 | KEEP |
| `ui/models/Accessories/TALL VP 2400.glb` | 33048 | KEEP |
| `ui/models/Accessories/Tark 1200mm A.glb` | 31832 | KEEP |
| `ui/models/Accessories/Tark 1200mm.glb` | 28520 | KEEP |
| `ui/models/Accessories/Tark 600mm A.glb` | 28520 | KEEP |
| `ui/models/Accessories/Tark 600mm.glb` | 25204 | KEEP |
| `ui/models/Accessories/Tark 900mm A.glb` | 30176 | KEEP |
| `ui/models/Accessories/Tark 900mm.glb` | 25204 | KEEP |
| `ui/models/Accessories/VENT GRILL.glb` | 5580 | KEEP |
| `ui/models/Accessories/WALL VP 1080 R.glb` | 33052 | KEEP |
| `ui/models/Accessories/WALL VP 1080.glb` | 33052 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/BSC2HS_EH (H720xW1050xD560).glb` | 298520 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBC1S1HS_LH_CJ (H720xW1050xD560).glb` | 217196 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBC1S1HS_RH_CJ (H720xW1050xD560).glb` | 217736 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBCLC1HS_LH_CJ (H720xW1050xD560).glb` | 5697336 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBCLC1HS_LH_EH (H720xW1050xD560).glb` | 5687368 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBCLC1HS_RH_CJ (H720xW1050xD560).glb` | 5670184 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1050mm/S550_BBCLC1HS_RH_EH (H720xW1050xD560).glb` | 5688008 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1150mm/BASE BLIND CABINET 1 SHELF (H720xW1150xD336) S550_BBC1S1HS_LH.glb` | 401336 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1150mm/BASE BLIND CABINET 1 SHELF (H720xW1150xD336) S550_BBC1S1HS_RH.glb` | 401888 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1150mm/S550_BBC1S1HS_LH_ EH (H720xW1150xD560).glb` | 125996 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1150mm/S550_BBC1S1HS_RH_EH (H720xW1150xD560).glb` | 126536 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1170mm/BC1BS2HS (H720xW1170xD356).glb` | 904604 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 1200mm/BSC2HS_CJ (H720xW1200xD560).glb` | 401148 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 150mm/BCBP1PS_CJ (H720xW150xD560).glb` | 957680 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 150mm/BCBP1PS_EH (H720xW150xD560).glb` | 952104 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 300mm/BASE CABINET 1 HB DRAWER WASTE BIN 30 LTR (H720xW300xD560) BC1EHWB30.glb` | 172228 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 300mm/BCBP1PS_LH_CJ (H720xW300xD560).glb` | 958852 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 300mm/BCBP1PS_LH_EH (H720xW300xD560).glb` | 953276 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 300mm/BCBP1PS_RH_CJ (H720xW300xD560).glb` | 959384 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 300mm/BCBP1PS_RH_EH (H720xW300xD560).glb` | 953808 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1BL1EH_CJ (H720xW450xD560) (2).glb` | 60576 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1BL1EH_CJ (H720xW450xD560).glb` | 586280 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1BL1EH_EH (H720xW450xD560.glb` | 580564 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_LH_CJ (H720xW450xD560).glb` | 189092 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_LH_EH (H720xW450xD3.glb` | 184732 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_LH_EH (H720xW450xD5.glb` | 183908 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_RH_CJ (H720xW450xD560).glb` | 189628 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_RH_EH (H720xW450xD336).glb` | 185264 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC1S1HS_RH_EH (H720xW450xD560).glb` | 184440 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC2EH_CJ (H720xW450xD560).glb` | 599316 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC2EH_EH (H720xW450xD560).glb` | 582364 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BC4EL_EH (H720xW450xD560).glb` | 989884 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BCC1HS_LH_CJ (H720xW450xD336).glb` | 164868 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 450mm/BCC1HS_RH_CJ (H720xW450xD336).glb` | 165404 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 550mm/BC1S1HS_LH_CJ (H720xW550xD560).glb` | 189288 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 550mm/BC1S1HS_LH_EH (H720xW550xD560).glb` | 184100 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 550mm/BC1S1HS_RH_CJ (H720xW550xD560).glb` | 189820 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 550mm/BC1S1HS_RH_EH (H720xW550xD560).glb` | 184636 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BASE CABINET 1 BUILT IN LB 1 LB DRAWER 1 HB DRAWER (H720xW600xD560) BC1BL1EL1EH.glb` | 1009776 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1BL1EH_CJ (H720xW600xD560).glb` | 587328 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1BL1EH_EH (H720xW600xD560).glb` | 580892 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1EHWB_CJ (H720xW600xD560).glb` | 424900 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1EHWB_EH (H720xW600xD560).glb` | 418780 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1HS_LH_CJ (H720xW600xD336).glb` | 190248 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1HS_RH_CJ (H720xW600xD336).glb` | 190780 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1S1HS_LH_CJ (H720xW600xD560).glb` | 189424 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1S1HS_LH_EH (H720xW600xD560).glb` | 184236 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1S1HS_RH_CJ (H720xW600xD560).glb` | 189956 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1S1HS_RH_EH (H720xW600xD336).glb` | 185596 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1S1HS_RH_EH (H720xW600xD560).glb` | 184772 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC1SHS_LH_EH (H720xW600xD336).glb` | 185060 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC2EH_CJ (H720xW600xD560).glb` | 600368 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC2EH_EH (H720xW600xD560).glb` | 582696 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC2EL1EH_CJ (H720xW600xD560).glb` | 818336 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BC2EL1EH_EH (H720xW600xD560).glb` | 800664 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BHC2EH_CJ  (H720xW600xD560).glb` | 622436 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BHC2EH_EH  (H720xW600xD560).glb` | 604748 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BHC2EL1EH_CJ (H720xW600xD560).glb` | 838224 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BHC2EL1EH_EH (H720xW600xD560).glb` | 820536 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BS1FPSOV_CJ (H720xW600xD560).glb` | 226532 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BS1FPSOV_EH (H720xW600xD560).glb` | 226416 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BSC1HS_LH_CJ (H720xW600xD560).glb` | 353316 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BSC1HS_LH_EH (H720xW600xD560).glb` | 348532 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BSC1HS_RH_CJ (H720xW600xD560).glb` | 353848 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 600mm/BSC1HS_RH_EH (H720xW600xD560).glb` | 349068 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BASE CABINET 1 BUILT IN LB 1 LB DRAWER 1 HB DRAWER (H720xW900xD560) BC1BL1EL1EH.glb` | 1009704 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC1S2HS_EH (H720xW900xD560).glb` | 212192 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC2EH_CJ  (H720xW900xD560).glb` | 600296 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC2EH_EH  (H720xW900xD560).glb` | 582620 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC2EL1EH_CJ (H720xW900xD560).glb` | 818264 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC2EL1EH_EH (H720xW900xD560).glb` | 800588 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BC2HS_CJ (H720xW900xD560).glb` | 216748 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BHC2EH_CJ (H720xW900xD560).glb` | 622368 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BHC2EH_EH (H720xW900xD560).glb` | 604680 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BHC2EL1EH_CJ (H720xW900xD560).glb` | 838156 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BHC2EL1EH_EH (H720xW900xD560).glb` | 821788 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BSC2HS_CJ (H720xW900xD560).glb` | 390756 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 900mm/BSC2HS_EH (H720xW900xD560).glb` | 383660 | KEEP |
| `ui/models/Base Cabinets 720mm/Base Cabinet 940mm/BC1BS2HS (H720xW940xD356).glb` | 904208 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 1050mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW1050xD560) S450_WLBC1GS1GHS_RH.glb` | 288848 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 1050mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW1050xD560) S450_WLBC1GS1HS_LH.glb` | 166320 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 1050mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW1050xD560) S450_WLBC1GS1HS_RH.glb` | 166856 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 1150mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW1150xD560) WLC1S1HS_LH.glb` | 167248 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 1150mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW1150xD560) WLC1S1HS_RH.glb` | 167920 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 450mm/WALL LOFT CABINET 1 SHELF (H600xW450xD560) WLC1S1HS_LH.glb` | 133992 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 450mm/WALL LOFT CABINET 1 SHELF (H600xW450xD560) WLC1S1HS_RH.glb` | 134524 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 450mm/WALL LOFT CABINET 1 SHELF(H600xW450xD336)WLC1S1HS_LH.glb` | 134200 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 450mm/WALL LOFT CABINET 1 SHELF(H600xW450xD336)WLC1S1HS_RH.glb` | 134732 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 500mm/WLC1S1HS_LH (H600xW500xD580) (2).glb` | 152136 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 500mm/WLC1S1HS_LH (H600xW500xD580).glb` | 152136 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 500mm/WLC1S1HS_RH (H600xW500xD580) (2).glb` | 152688 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 500mm/WLC1S1HS_RH (H600xW500xD580).glb` | 152684 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 550mm/WALL LOFT CABINET 1 SHELF (H600xW550xD336) WLC1S1HS_LH.glb` | 134392 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 550mm/WALL LOFT CABINET 1 SHELF (H600xW550xD336) WLC1S1HS_RH.glb` | 134924 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 600mm/WALL LOFT CABINET  1 SHELF (H600XW600XD560)WLC1SHS_LH.glb` | 402648 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 600mm/WALL LOFT CABINET  1 SHELF (H600XW600XD560)WLC1SHS_RH.glb` | 403180 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 600mm/WALL LOFT CABINET 1 SHELF (H600xW600xD336) WLC1S1HS_LH.glb` | 134528 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 600mm/WALL LOFT CABINET 1 SHELF (H600xW600xD336) WLC1S1HS_RH.glb` | 135060 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 850mm/WALL LOFT CABINET 1 SHELF (H600xW850xD336) WLC1S2HS.glb` | 162088 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 900mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW900xD336) S450_WBC1S1HS_LH.glb` | 169176 | KEEP |
| `ui/models/Loft Cabinets 600mm/Loft Cabinet 900mm/WALL LOFT BLIND CABINET 1 SHELF (H600xW900xD336) S450_WBC1S1HS_RH.glb` | 169708 | KEEP |
| `ui/models/Mid Ht. Cabinets/Mid ht. Cabinets 1290mm/WMHC3S1EH1RS (H1290xW600xD356).glb` | 125472 | KEEP |
| `ui/models/Mid Ht. Cabinets/Mid ht. Cabinets 1650mm/WMHC3S1EH1RS (H1650xW600xD336).glb` | 154440 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 1050mm/S550_TBC5S1HS_LH (H2040XW1050XD560).glb` | 200620 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 1050mm/S550_TBC5S1HS_RH (H2040XW1050XD560).glb` | 201168 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 1150mm/TALL BLIND CABINET 5 L-SHELF (H2040XW1150XD560) S500_TBC5LS1HS_LH.glb` | 426068 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 1150mm/TALL BLIND CABINET 5 L-SHELF (H2040XW1150XD560) S500_TBC5LS1HS_RH.glb` | 425848 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1GHS_LH (H2040xW450xD336).glb` | 230644 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1GHS_LH (H2040xW450xD560).glb` | 229424 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1GHS_RH (H2040xW450xD336).glb` | 231192 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1GHS_RH (H2040xW450xD560).glb` | 229972 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1HS_LH (H2040xW450xD336).glb` | 164896 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1HS_RH (H2040xW450xD336).glb` | 105024 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 450mm/TC5GS1HS_RH (H2040xW450xD560).glb` | 165444 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TALL PULLOUT SHELVES CABINET 1 FIXED SHELF 4 PULLOUT SHELF (H2040xW600xD560) TC4PS1FS1HS_LH.glb` | 895936 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TALL PULLOUT SHELVES CABINET 1 FIXED SHELF 4 PULLOUT SHELF (H2040xW600xD560) TC4PS1FS1HS_RH.glb` | 896496 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC3BL2BH1HS_LH (H20407XW600XD560).glb` | 1210552 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC3BL2BH1HS_RH (H20407XW600XD560).glb` | 1211100 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5GS1GHS_LH (H2040xW600xD560).glb` | 231180 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5GS1GHS_RH (H2040xW600xD560).glb` | 231728 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5GS1HS_LH (H2040xW600xD560).glb` | 166152 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5GS1HS_RH (H2040xW600xD560).glb` | 166704 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5S1GHS_LH (H2040xW600xD336).glb` | 231192 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5S1GHS_RH (H2040xW600xD336).glb` | 231740 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5S1HS_LH (H2040xW600xD336).glb` | 166156 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TC5S1HS_RH (H2040xW600xD336).glb` | 166704 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TCTP1HS_LH (H2040xW600xD560).glb` | 1497780 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm/TCTP1HS_RH (H2040xW600xD560).glb` | 1498328 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TC1S1EHSFMO1HS_LH (H2040XW600XD560).glb` | 430200 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TC1S1EHSFMO1HS_RH (H2040XW600XD560).glb` | 430748 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TC1S2EHSFCM1HS_LH (H2040xW600XD560).glb` | 689916 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TC1S2EHSFCM1HS_RH (H2040xW600XD560).glb` | 690464 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TCR1HS_LH (H2040xW600xD560).glb` | 177916 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TCR1HS_RH (H2040xW600xD560).glb` | 178464 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 600mm Appliances/TODR5S (H2040xW600xD580).glb` | 102376 | KEEP |
| `ui/models/Tall Cabinets 2040mm/Tall Cabinet 900mm/TC5GS1HS (H2040xW900xD560).glb` | 131892 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 1050mm/S550_TBC6S1HS_LH (H2400XW1050XD560).glb` | 225712 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 1050mm/S550_TBC6S1HS_RH (H2400XW1050XD560).glb` | 226260 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 1150mm/TALL BLIND CABINET 6 L- SHELF (H2400XW1150XD560) S550_TBC6LS1HS_LH.glb` | 424412 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 1150mm/TALL BLIND CABINET 6 L- SHELF (H2400XW1150XD560) S550_TBC6LS1HS_RH.glb` | 425124 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TALL CABINET 6 SHELF (H2400xW450xD336) TC6S1HS_LH.glb` | 375860 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TALL CABINET 6 SHELF (H2400xW450xD336) TC6S1HS_RH.glb` | 376412 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TC6S1GHS_LH (H2400xW450xD560).glb` | 250564 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TC6S1GHS_RH (H2400xW450xD560).glb` | 251112 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TC6S1HS_LH (H2400xW450xD560).glb` | 189940 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 450mm/TC6S1HS_RH (H2400xW450xD560).glb` | 190488 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TALL PULLOUT SHELVES CABINET 2  FIXED SHELF4 PULLOUT SHELF (H2400xW600xD560) TC4PS2FS1HS_LH.glb` | 796912 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TALL PULLOUT SHELVES CABINET 2  FIXED SHELF4 PULLOUT SHELF (H2400xW600xD560) TC4PS2FS1HS_RH.glb` | 797460 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC1S3BL2BH1HS_LH (H2400XW600XD560).glb` | 1240368 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC1S3BL2BH1HS_RH (H2400XW600XD560).glb` | 1240916 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC1STP1HS_LH (H2400xW600xD560).glb` | 1529568 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC1STP1HS_RH (H2400xW600xD560).glb` | 1530116 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6GS1GHS_LH (H2400xW600xD336).glb` | 255480 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6GS1GHS_RH (H2400xW600xD336).glb` | 256028 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6GS1HS_LH (H2400xW600xD336).glb` | 191724 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6GS1HS_RH (H2400xW600xD336).glb` | 192272 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6S1GHS_LH (H2400xW600xD560).glb` | 250936 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6S1GHS_RH (H2400xW600xD560).glb` | 251484 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6S1HS_LH (H2400xW600xD560).glb` | 190296 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm/TC6S1HS_RH (H2400xW600xD560).glb` | 190844 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC1SR1HS_LH (H2400xW600xD560).glb` | 206684 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC1SR1HS_RH (H2400xW600xD560).glb` | 207232 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S1EHSFMO1HS_LH (H2400XW600XD560).glb` | 486656 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S1EHSFMO1HS_RH (H2400XW600XD560).glb` | 487204 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S1EHSFMOWD1HS_LH (H2400XW600XD560).glb` | 687116 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S1EHSFMOWD1HS_RH (H2400XW600XD560).glb` | 675580 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFCM1HS_LH (H2400xW600XD560).glb` | 735116 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFCM1HS_RH (H2400xW600XD560).glb` | 735664 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFM1HS_LH (H2400xW600XD560).glb` | 732104 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFM1HS_RH (H2400xW600XD560).glb` | 732652 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFO1HS_LH (H2400xW600XD560).glb` | 672244 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3S2EHSFO1HS_RH (H2400xW600XD560).glb` | 672792 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3SSFMOWD1HS_LH (H2400XW600XD560).glb` | 418936 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TC3SSFMOWD1HS_RH (H2400XW600XD560).glb` | 444572 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 600mm Appliances/TODR5S (H2400xW600xD580).glb` | 123996 | KEEP |
| `ui/models/Tall Cabinets 2400mm/Tall Cabinet 900mm/TALL CABINET 6 SHELF (H2400xW900xD560) TC6S2HS.glb` | 417256 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 300mm/WALL OPEN CABINET 3 GLASS SHELF (H1070xW300xD336) WOC3S.glb` | 61636 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 450mm/WC3GS1GHS_LH (H1085xW450xD336).glb` | 212772 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 450mm/WC3GS1GHS_RH (H1085xW450xD336).glb` | 213308 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 450mm/WC3GS1HS_LH (H1085xW450xD336).glb` | 92568 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 450mm/WC3GS1HS_RH (H1085xW450xD336).glb` | 93104 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 550mm/WC3GS1GHS_LH (H1085xW550xD336).glb` | 212968 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 550mm/WC3GS1GHS_RH (H1085xW550xD336).glb` | 213500 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 550mm/WC3GS1HS_LH (H1085xW550xD336).glb` | 92764 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 550mm/WC3GS1HS_RH (H1085xW550xD336).glb` | 93296 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WC3GS1GHS_LH (H1085xW600xD336).glb` | 213104 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WC3GS1GHS_RH (H1085xW600xD336).glb` | 213636 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WC3GS1HS_LH (H1085xW600xD336).glb` | 92900 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WC3GS1HS_RH (H1085xW600xD336).glb` | 93432 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WDC2GS1HS_LH (H1085xW600xD336).glb` | 1646452 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 600mm/WDC2GS1HS_RH (H1085xW600xD336).glb` | 1646968 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 850mm/WC3GS2GHS (H1085xW850xD336).glb` | 360416 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 850mm/WC3GS2HS (H1085xW850xD336).glb` | 120708 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 900mm/S450_WBC3GS1HS_LH (H1085xW900xD336).glb` | 127312 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 900mm/S450_WBC3GS1HS_RH (H1085xW900xD336).glb` | 127852 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 900mm/WC3GS2GHS (H1085xW900xD336).glb` | 360280 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 900mm/WC3GS2HS (H1085xW900xD336).glb` | 120572 | KEEP |
| `ui/models/Wall Cabinets 1085mm/Wall Cabinets 900mm/WDC2GS2HS (H1085xW900xD336).glb` | 1951640 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 300mm/WOC1SV_ (H710XW300XD336).glb` | 64952 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 450mm/WC1GS1GHS_LH (H720 XW450 XD336).glb` | 216684 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 450mm/WC1GS1GHS_RH (H720 XW450 XD336).glb` | 217216 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 450mm/WC1GS1HS_LH (H720 XW450 XD336).glb` | 98064 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 450mm/WC1GS1HS_RH (H720 XW450 XD336).glb` | 98596 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 550mm/WC1GS1GHS_H (H720 XW550 XD336).glb` | 217412 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 550mm/WC1GS1GHS_LH (H720 XW550 XD336).glb` | 216876 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 550mm/WC1GS1HS_LH (H720 XW550 XD336).glb` | 98252 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 550mm/WC1GS1HS_RH (H720 XW550 XD336).glb` | 98788 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WC1GS1GHS_LH (H720 XW600 XD336).glb` | 217008 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WC1GS1GHS_RH (H720 XW600 XD336).glb` | 217544 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WC1GS1HS_LH (H720 XW600 XD336).glb` | 98388 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WC1GS1HS_RH (H720 XW600 XD336).glb` | 98924 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WDC1HS_LH (H720XW600XD336).glb` | 1638648 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 600mm/WDC1HS_RH (H720XW600XD336).glb` | 1639184 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 850mm/WC1GS2GHS (H720 XW850 XD336).glb` | 364264 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 850mm/WC1GS2HS (H720 XW850 XD336).glb` | 126124 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 900mm/WALL BLIND CABINET 1 GLASS SHELF (H720xW900xD336) S450_WBC1GS1HS_LH.glb` | 171256 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 900mm/WALL BLIND CABINET 1 GLASS SHELF (H720xW900xD336) S450_WBC1GS1HS_RH.glb` | 171792 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 900mm/WC1GS2GHS (H720 XW900 XD336).glb` | 364124 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 900mm/WC1GS2HS (H720 XW900 XD336).glb` | 125984 | KEEP |
| `ui/models/Wall Cabinets 720mm/Wall Cabinets 900mm/WDC2HS_ (H720XW900XD336).glb` | 1943860 | KEEP |
| `ui/reference-l.html` | 141962 | KEEP |
| `ui/reference-p9.html` | 323832 | KEEP |
| `ui/reference.html` | 152598 | KEEP |
| `ui/renderer3d.js` | 37681 | KEEP |
| `ui/rule-log.js` | 10816 | KEEP |
| `ui/sink-fillers-preview.html` | 4464 | KEEP |
| `ui/verification-fixtures.json` | 69505 | KEEP |
| `ui/verification.html` | 4210 | KEEP |
| `ui-state.test.mjs` | 9415 | KEEP |
| `ui.js` | 19181 | KEEP |
| `vendor/accessories.js` | 2667 | KEEP |
| `vendor/apiRuntime.js` | 8164 | KEEP |
| `vendor/cabinetCode.js` | 3007 | KEEP |
| `vendor/catalog.js` | 3531 | KEEP |
| `vendor/costEstimate.js` | 8298 | KEEP |
| `vendor/costing.js` | 2108 | KEEP |
| `vendor/db.js` | 2584 | KEEP |
| `vendor/designApi.js` | 4867 | KEEP |
| `vendor/designStore.js` | 16773 | KEEP |
| `vendor/elevations.js` | 1683 | KEEP |
| `vendor/libraryApi.js` | 6048 | KEEP |
| `vendor/pricingConfig.js` | 2526 | KEEP |
| `vendor/rules.js` | 2704 | KEEP |
| `vendor/saleablePricing.js` | 2523 | KEEP |
| `vendor/series.js` | 4985 | KEEP |
| `vendor/shareApi.js` | 12936 | KEEP |
| `verification/alignment-3600-api.json` | 584136 | DELETED |
| `verification/alignment-3600-result.json` | 500062 | DELETED |
| `verification/alignment-3600.json` | 6305 | KEEP |
| `verification/archive-pre-rule-2-previews.mjs` | 1395 | DELETED |
| `verification/archive-pre-rule-3-previews.mjs` | 1105 | DELETED |
| `verification/corner-clearance-api.json` | 55840 | DELETED |
| `verification/design.sqlite` | 4096 | KEEP |
| `verification/design.sqlite-shm` | 32768 | KEEP |
| `verification/design.sqlite-wal` | 486192 | KEEP |
| `verification/empty-6450-fixed.json` | 37735 | DELETED |
| `verification/empty-6450-live-fixed.json` | 56223 | DELETED |
| `verification/empty-6450-request.json` | 3812 | KEEP |
| `verification/empty-6450-state.json` | 7985 | DELETED |
| `verification/filler-3600-api.json` | 53002 | DELETED |
| `verification/filler-3600-input.json` | 2192 | KEEP |
| `verification/filler-3600-request.json` | 3762 | DELETED |
| `verification/filler-3600-result.json` | 48846 | DELETED |
| `verification/filler-3600-state.json` | 65018 | KEEP |
| `verification/fit-p9.mjs` | 626 | KEEP |
| `verification/fitting-api.mjs` | 1642 | KEEP |
| `verification/fixtures.mjs` | 4199 | KEEP |
| `verification/live-p9-fit-result.json` | 287976 | DELETED |
| `verification/live-p9-request.json` | 3504 | KEEP |
| `verification/preview-sink-fillers.mjs` | 3598 | KEEP |
| `verification/reference-api-result.json` | 5759 | DELETED |
| `verification/reference-api.mjs` | 2246 | KEEP |
| `verification/run-end-fixtures.mjs` | 627 | KEEP |
| `verification/solve-p8.mjs` | 1883 | KEEP |
| `verification/solve-p9.mjs` | 472 | KEEP |
| `verification/test-blind-fronts-core.log` | 1042 | DELETED |
| `verification/test-blind-fronts-first.log` | 7634 | DELETED |
| `verification/test-blind-fronts.log` | 920 | DELETED |
| `verification/test-current.log` | 12864 | DELETED |
| `verification/test-engine-fillers.log` | 886 | DELETED |
| `verification/test-fillers-placement.log` | 6436 | DELETED |
| `verification/test-fillers-remaining.log` | 7534 | DELETED |
| `verification/test-gap-fillers.log` | 191742 | DELETED |
| `verification/test-generation-repair.log` | 5028 | DELETED |
| `verification/test-placement-rule4.log` | 2680 | DELETED |
| `verification/test-remaining-rule4.log` | 8412 | DELETED |
| `verification/test-rule4.log` | 53272 | DELETED |
| `verification/test-rule6-final-targeted.log` | 4192 | DELETED |
| `verification/test-rule6-ui.log` | 3124 | DELETED |
| `verification/test-rule6.log` | 20188 | DELETED |
| `verification/test-storage-rule4.log` | 3028 | DELETED |
| `verification/wall-api.mjs` | 1760 | KEEP |
| `verification/wall-live-result.json` | 425637 | KEEP |
| `verification/write-fixtures.mjs` | 650 | KEEP |
| `wall-cabinets.test.mjs` | 2887 | KEEP |
