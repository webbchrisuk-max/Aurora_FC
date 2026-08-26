# Aurora Clean Rebuild

Purpose: build a stable Aurora from a plain, testable foundation.

## Rules

- No CSS yet.
- One shared runtime only: `aurora.js`.
- One state key: `aurora-clean:state:v1`.
- One renderer per page selected by `body[data-page]`.
- No page-specific helper scripts.
- No polling loops.
- No DOM overlays.
- No hidden legacy interface underneath new UI.
- Add styling only after the logic path is verified.

## Current test path

1. Open `index.html` and confirm all page links work.
2. Open Finance, calculate safe release and release a mission.
3. Open Scouting, add a candidate and approve it.
4. Open Transfer, build the preview and lock the route.
5. Open Registration and register the locked route.
6. Open Squad and confirm the holding appears.
7. Open Income and confirm annual/monthly income reads from Squad.
8. Open Match Report and build the summary.
9. Open System Health and confirm all state sections pass.

This is intentionally basic. Business rules will be moved into `aurora.js` one section at a time and tested before any visual layer is added.
