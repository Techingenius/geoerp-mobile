
# CI autopilot notification

This repo notifies the `CI-Reactive PR Merge/Fix (geoerp-mobile)` autopilot from
the `notify-autopilot` job in `ci.yml`, once per push. See GRA-661 and the
comment on that job for why the repository `check_suite` webhook was removed.

## Verification log

- **2026-09-23** — GRA-661 end-to-end check on a live PR: one `notify-autopilot`
  run per push, one webhook delivery, one autopilot run. Prior baseline on this
  repo was four `check_suite` deliveries per push (2026-08-26).
