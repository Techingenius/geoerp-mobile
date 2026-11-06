<!--
Title: `<type>: GRA-<n> <what changed>`  ·  Branch: `GRA-<n>/<short-description>`
Closes GRA-<n>   (only the issue this PR actually finishes)
-->

## What changed and why

<!-- One paragraph. The diff says what; this says why. -->

## Mobile delivery contract

Full version: `docs/mobile-delivery-contract.md`. The `Preview build label`
check fails until the first box is true.

- [ ] **Build of this head**: `preview-build` label added — or this PR touches
      nothing the app renders or builds from.
- [ ] **Surfaces this run had**: <!-- Android emulator API NN / iOS simulator N / none -->
- [ ] **Backend of the build**: <!-- staging <ref> / production <ref> → not reviewable (B-O4) -->
- [ ] **Screenshots attached** to the Multica delivery comment (attached, not
      linked — the build page outlives nothing) — or no screen changed.
- [ ] Anything a physical device would be needed for is listed as
      `Pendiente de device físico` on the issue.

## Checks

- [ ] `npm run typecheck`
- [ ] `npm run lint`

## Gates

<!-- Set QA Status / Visual QA to Pendiente (or No Requerido with a reason) and
     paste the gatekeeper line from `multica issue wakeup list <issue>`.
     Don't @mention the reviewer — the gate and its gatekeeper are the handoff. -->
