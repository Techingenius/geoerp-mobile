# Mobile delivery contract

What a pull request in this repo has to carry before anyone is asked to review
it, and what a reviewer writes back. Agreed in the GRA-925 retro (items A25,
B-O2, B-O3, B-O4); the machine-checkable half runs in
`.github/workflows/mobile-delivery-contract.yml`.

## Why there is a contract here and not just in the web repos

The web app has a Netlify deploy preview on every PR: a reviewer clicks a link
and sees the change. This app has none of that.

- The only installable artifact is an **EAS build**, it is opt-in behind the
  `preview-build` label, and it takes ~15 min. Forgetting the label is free and
  invisible. **PR #12 sat open for seven days** with `QA Status = Pendiente`,
  touching four screens, with no label and therefore no APK — a visual gate with
  nothing to look at.
- The evidence **outlives the artifact only if it is attached**. A build page
  link and an install URL live on expo.dev, not in Multica and not in the repo.
  Screenshots go on the comment as attachments; the build id, profile and date
  go in as text.
- There is **no staging backend yet**. A `preview` APK talks to production, so
  exercising a screen means writing real projects, services and production
  entries. That is why `qa` is a separate profile and why a `qa` build refuses
  to point at production.

## What the author delivers

Paste this into the Multica delivery comment, with the screenshots attached to
that same comment (`multica issue comment add --attachment <path>`, repeatable).

```
Entrega mobile · <ISSUE-KEY> · PR #<n>
SHA entregado: <head, 7+ chars>
Build: EAS <build-id> · perfil <preview|qa> · label preview-build ✅ | no aplica: <por qué>
Backend del build: staging <project-ref> | producción <project-ref> → no se revisa (B-O4)
Superficies de este run: <emulador Android API NN | simulador iOS N | ninguna>
Pantallas tocadas: <rutas de app/** o "ninguna">
Capturas: adjuntas a este comentario | no aplica: <por qué>
Pendiente de device físico: <qué quedó sin probar y qué haría falta> | nada
Gate: Visual QA = <Pendiente|No Requerido> · QA Status = <Pendiente|No Requerido>
Portero: <rule-id> continuous
```

Three lines carry the weight:

- **Superficies de este run.** A run gets whatever the runtime gives it, and that
  changes between runs — Ross had an Android emulator on 28-Oct and not on
  29-Oct. "Tested on both platforms" is a claim about the runtime, not about
  care, so it is declared, not assumed. Nothing is approved on a surface nobody
  had; it goes to `Pendiente de device físico`, which is neither a pass nor a
  blocker.
- **Backend del build.** See B-O4 below.
- **Capturas: adjuntas.** Not linked. The build page expires, the repo never had
  them, and a reviewer reading the issue in three weeks gets a 404.

### When the PR changes no screen

A config, CI or script PR still needs the label if it touches the files listed
in `.github/scripts/needs-preview-build.js` — but then the build is evidence
that the binary still builds, not something to look at. Say so, and leave
`Visual QA = No Requerido` with the reason on the issue. An unset gate is not a
pass; a deliberate `No Requerido` with a reason is.

## What the machine enforces

| Check | Where | Fails when |
|---|---|---|
| `Mobile Delivery Contract / Preview build label` | `.github/workflows/mobile-delivery-contract.yml` | the PR touches `app/**`, `components/**`, `assets/**`, `global.css`, `tailwind.config.js`, `app.json`, `app.config.ts`, `babel.config.js`, `metro.config.js` or `eas.json` and does not carry the `preview-build` label |
| QA build against production | `app.config.ts` | `eas build --profile qa` resolves a Supabase URL that is the production project, or none at all |

The `Android Preview Build` workflow builds the **PR head** — not the
`refs/pull/N/merge` commit a checkout defaults to — and its comment names the
build id, the profile and that head SHA, so the delivery block can be filled in
by copying rather than by recollection.

The path list lives in `.github/scripts/needs-preview-build.js` so it can be
exercised without queueing a run:

```bash
node -e "console.log(require('./.github/scripts/needs-preview-build.js') \
  .filesRequiringBuild(['app/project/[id].tsx','README.md']))"
```

Dependency bumps are deliberately not on the list: a devDependency cannot reach
a screen, and making every bump cost a 15 min build is how a gate gets routed
around. **A native dependency change does need a build** — that call stays with
the author.

Neither check is in `main`'s required set yet (today's required checks are
`Type Check` and `Lint`). Making it required is a one-line branch-protection
change once this has run on a few PRs.

## What the reviewer writes back

Visual QA on mobile is Joey's, over the input Ben produces; Ross is the stand-in;
**the stand-in is never the PR author** (A18, B-O3).

| Gate | Input | Produced by | Titular | Stand-in | If the input is missing |
|---|---|---|---|---|---|
| Visual QA (mobile) | build id + screenshots + matrix, tied to the head SHA | **Ben** (PR author) | Joey | Ross | the gate goes back to **Ben**, not to `Pendiente` on Joey |

```
Gate: Visual QA (mobile) = <Aprobado|Rechazado>
SHA: <head revisado, 7+ chars>   (= metadata visual_qa_mobile_reviewed_sha)
Build: EAS <build-id> · perfil <preview|qa> · label preview-build ✅
Backend del build: staging <project-ref> | PRODUCCIÓN → no se revisa (B-O4)
Superficies de este run: <emulador Android API NN | simulador iOS N | ninguna>
Matriz: una fila por pantalla × {Android, iOS} × {claro, oscuro}, ✅/❌ por celda
Capturas: adjuntas al comentario (no solo el link al build)
Blockers: n · Suggestions: n · Nits (carryover): <paths> | ninguno
Portero: <rule-id> continuous
```

Whatever could not be exercised for lack of a surface is listed as `Pendiente de
device físico`, with what it would take to close it. It counts as neither
approved nor blocker.

### Carryover — `Visual QA (mobile)` (B-O2)

An approval is tied to the SHA it was written against (A5). On a new head the
mobile gate is **inherited** only when the push was a clean rebase, or the whole
delta is `*.md` / `docs/**`.

If the delta touches `app/**`, `components/**`, `global.css`,
`tailwind.config.*`, `app.json`, `app.config.ts`, `eas.json` or a native
dependency in `package.json`, the gate goes back to `Pendiente` **and the PR has
to carry a build of the new head**. There is no "a green check justifies
inheriting" escape hatch here: the required checks are `Type Check` and `Lint`,
and neither has ever seen a pixel. Revisit this once `test` is required
(GRA-951).

### A build pointing at production is not reviewed (B-O4)

Even if the screens render. The gate goes to **`En Progreso`** — not `Rechazado`,
the PR is not at fault — an environment issue is opened against the owner of
staging, and the review resumes **on the same SHA** when that issue reaches
`in_review`.

The risk this closes is the opposite of the obvious one: not that a bad build
gets rejected, but that a good-looking one gets **approved** while a reviewer
creates real field data to exercise it.

## The QA environment

Two halves, and only one of them is in this repo.

**Data — `./scripts/seed-qa.sh`** (GRA-954). Idempotent fixtures in the geoerp
database: a QA organization, field users, a project with segments, services in
every status, a crew with a roster. It refuses production outright and refuses
any non-local target unless `SEED_QA_ALLOW_REMOTE=1`.

**Binary — the `qa` build profile** (`eas.json`):

```jsonc
"qa": {
  "extends": "preview",            // internal distribution, Android APK
  "environment": "development",    // ← where the STAGING variables live
  "env": { "EXPO_PUBLIC_BACKEND_ENV": "staging" }
}
```

EAS offers exactly three environment names — `development`, `preview`,
`production` — and they are slots, not meanings. `preview` already holds the
**production** Supabase URL (that is what today's `preview-build` APKs install),
so the only free slot for staging is `development`. Read it as "not production".

To turn the profile on, in the EAS project `jonasgraterol/geoerp-mobile`:

```bash
eas env:create development --name EXPO_PUBLIC_SUPABASE_URL      --value https://<staging-ref>.supabase.co
eas env:create development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <staging anon key> --visibility sensitive
eas env:create development --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value <key> --visibility sensitive
eas env:list development                 # verify
eas build --platform android --profile qa --non-interactive
```

Until a staging Supabase project exists, `--profile qa` fails on purpose, in the
build log, and the message names the `development` environment and the
`eas env:create development …` line for the URL. That is the whole point: the
failure mode is a missing build, never a QA pass against live field data.

Never repoint `preview` at staging to get a green `qa` build: every
`preview-build` APK installs what `preview` holds, so that silently moves
today's only installable artifact off production without anyone noticing.

**Seed it, then build it:** point `SUPABASE_URL` at staging, run
`SEED_QA_ALLOW_REMOTE=1 ./scripts/seed-qa.sh`, then `eas build --profile qa`.
