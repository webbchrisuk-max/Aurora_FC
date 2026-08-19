# Aurora FC — Clean Rebuild

This repository is the controlled rebuild of Aurora City FC.

## Recovery checkpoints
- `stable-stage1-html` — verified plain HTML/navigation baseline
- `stable-stage2-shared-shell` — verified shared shell baseline
- `stable-stage3a-core` — verified Aurora Core baseline
- `stable-stage3b-platform` — verified Platform ownership baseline
- `stable-stage3c-sync-manager` — verified Sync Manager baseline
- `stable-stage3d-cloud-init` — verified Cloud initialisation baseline
- `stable-stage3e-firebase-read` — verified real Firebase read-only baseline

## Current probe
Stage 3F introduces only the read-only Club Command layer on top of the verified stack. Its live-price request and 60-second market refresh timer are active. Cloud writes, AuroraData writes and department business engines remain disabled.

## Rebuild rule
One change layer at a time. Every stable stage is frozen before the next runtime component is introduced.
