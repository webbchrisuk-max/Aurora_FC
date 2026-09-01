# Aurora City FC

Aurora City FC now runs from one maintained application only:

- `clean-rebuild/` — the live Aurora application
- `assets/` — shared visual assets used by the clean application
- `AuroraMaster.json` — retained scouting/data baseline used by the clean rebuild
- `index.html` — root redirect into `clean-rebuild/index.html`

The previous root application, old stage/test pages, migration workflow, and `legacy/aurora-fc-2-reference` archive have been removed.

## Live pages

- `clean-rebuild/index.html` — Nexus Headquarters
- `clean-rebuild/finance.html` — Finance Command
- `clean-rebuild/scouting.html` — Scouting Centre
- `clean-rebuild/transfer.html` — Transfer Centre
- `clean-rebuild/registration.html` — Registration Desk
- `clean-rebuild/squad.html` — Squad Hub / Matchday
- `clean-rebuild/income.html` — Income Centre
- `clean-rebuild/match-report.html` — Match Report
- `clean-rebuild/club-control.html` — Club Control
- `clean-rebuild/system-health.html` — System Health

## Development rule

All application changes should be made inside `clean-rebuild/`. Root-level files should remain limited to the redirect, shared assets/data, and repository documentation/configuration required by the live clean rebuild.
