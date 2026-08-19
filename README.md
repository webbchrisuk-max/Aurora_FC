# Aurora City FC — Clean Rebuild

This repository is the controlled rebuild of Aurora City FC.

## Stage 1 — Browser Navigation Baseline

The current build contains clean HTML department pages and one shared CSS file only.

No application JavaScript, session guard, router, sync manager, AuroraData connection, market feed or department logic is connected yet.

### Pages

- `index.html` — Nexus Headquarters
- `AuroraCityFC_NexusV2.html` — Nexus compatibility entry
- `finance.html`
- `scouting.html`
- `transfer.html`
- `registration.html`
- `squad.html`
- `income.html`
- `match-report.html`
- `club-control.html`
- `system-health.html`

## Test rule

Before Stage 2, every sidebar and direct navigation link must open the destination page fully in Safari, Chrome and Brave.

If Stage 1 is stable, add the next layer only, then retest.

## Planned restore order

1. HTML navigation baseline
2. Shared shell/session layer
3. Aurora Core + department ownership
4. Department logic one area at a time
5. AuroraData/live sync last
6. Create a known-good `stable` recovery branch once the rebuilt system is verified

The older `aurora-fc-2` repository remains the reference source for proven business logic while this rebuild is validated.