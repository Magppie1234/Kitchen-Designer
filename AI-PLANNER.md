# AI cabinet planning

The integration is opt-in. Normal Generate Design uses the local engine. Improve layout with AI runs the local fit first, then makes at most three OpenRouter requests to propose different catalogue sequences and corner ownership. Exact positions and dimensions remain engine-owned.

## Connect a model

1. Create an OpenRouter API key with a spending limit in your account. Do not paste it into chat or any project file.
2. Stop the old local designer server so port 5055 is free.
3. Double-click `start-ai.cmd` in File Explorer. In the **Kitchen Designer - Connect OpenRouter** window, paste the key into the masked field and click **Start designer**. A configured key can be reused by leaving the field empty. The key is held in the server process environment for this session, never written to disk by the launcher. Opening the `.cmd` file in an editor only displays its code; it does not launch the setup window.
4. Open `http://localhost:5055/builder.html` and choose Improve layout with AI. Normal Generate Design remains free of provider calls.

The default model is `openai/gpt-6-astra`. Set `KITCHEN_PLANNER_MODEL` before launching to compare another compatible OpenRouter model. `KITCHEN_AI_TIMEOUT_MS` defaults to 45000 per call; `KITCHEN_AI_MAX_TOKENS` defaults to 12000 including reasoning. The whole improvement stage has a 120-second request deadline and a three-call maximum. Real billing depends on provider token usage, so use an account-side spending cap too.

## What is checked

The schema admits eligible catalogue codes, physical-corner ownership, and ordered sequences in engine-produced packing spans. Openings, columns, wall/tall conflicts, appliance anchors, required storage, corner clearances, heights and selected series remain checked by the existing engine. AI cannot change appliance positions or cabinet zones. Existing deterministic appliance adjustments retain their metadata; pending zone proposals still require Use this layout.

Hard feasibility wins first, followed by physical conflicts, problem count, unresolved rules, avoidable trim, and gross storage volume. Required panel/clearance widths are excluded from avoidable trim. Gross storage volume is an external carcass proxy, not usable internal capacity. Access and preparation-area preferences are described to the model; they are not new measured guarantees. Exact usable-capacity or door-swing scoring needs corresponding catalogue geometry/data.

Incomplete responses, unknown products, incompatible spans and provider outages retain the deterministic baseline. AI proposals are never accepted based solely on the model's own assessment. If every layout fails, existing conflicts remain visible. A successful improvement includes measured before/after metrics and Compare before AI.

## Verification and comparison

Local verification completed: the full suite passed 82 tests; subsequent UI checks passed all 14 tests, including the additional request-option and series-selection cases. The browser build passed. All 20 saved layouts completed offline comparison with zero new validity regressions. One already-failing synthetic case reduced avoidable filler by 25 mm; its remaining conflicts are still reported. This is a deterministic scoring improvement, not evidence of live model performance. A local HTTP check also regenerated the saved 6450 mm room with 25 cabinets, two recorded appliance adjustments, a FEASIBLE verdict and no AI calls.

`verification/ai-baseline/` contains 20 inputs and complete pre-integration outputs. Its capture script refuses to overwrite them. The pre-integration test log is `verification/pre-ai-tests.log`.

Run local checks with `npm.cmd test` and `npm.cmd run build` on Windows. Run the saved-layout comparison with:

```powershell
node verification/ai-evaluate.mjs
```

Once a key is configured locally, explicitly enable billed evaluations, for example:

```powershell
node verification/ai-evaluate.mjs --live --cases=l,u --repeat=3 --model=openai/gpt-6-astra
```

Results go into a timestamped `verification/ai-evaluations/` directory. Each record retains input, deterministic and improved output, measured quality, reported tokens/cost and wall-clock time. Missing provider cost is recorded as unknown, never as zero. Compare identical cases and repeat counts across models. No live model quality claims can be made from the mocked tests.

Provider references: https://openrouter.ai/docs/guides/features/structured-outputs and https://openrouter.ai/docs/guides/best-practices/reasoning-tokens .
