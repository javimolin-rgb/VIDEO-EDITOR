# Contributing

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

Node 20+. A Chromium-based browser is recommended for the preview/export
pipeline (WebCodecs, `captureStream`, WebAudio).

## Checks (all must pass)

```bash
npm run typecheck  # strict TS, no emit
npm run lint       # flat ESLint
npm test           # vitest
npm run build      # production build
```

## Layering (enforced by review — see `docs/ARCHITECTURE.md`)

```
ui → state → domain → { storage · video · export · ai · automation } → lib
```

- `domain/*` and most of `automation/*`, `ai/*` (outside adapters) are **pure**:
  no React, no `zustand`, no DOM, no Dexie. They are the unit-test surface.
- Only `storage/repository.ts` touches Dexie.
- Generative providers implement `VideoGenerationProvider`
  (`src/ai/provider.ts`). Business logic branches on `capabilities.*`, never on
  a provider id. Deleting any `src/ai/providers/<name>/` except `local/` and
  `procedural/` must not break the build.

## Non-negotiables (from the product spec)

1. **No required external AI API.** Everything works offline after any opt-in
   model download.
2. **No fake AI / no fake capabilities.** A control that can't do something yet
   is disabled with a reason (`makeError` / an honest notice), never a
   placeholder result.
3. **Non-destructive.** Source media is never modified; edits are instructions;
   generated media is a new `generated`-role asset.
4. **Errors answer why / what / how-to-fix** (`src/lib/errors.ts`).
5. **No telemetry.** Nothing leaves the device unless the user exports/uploads.

## Adding a feature

- New timeline op → a pure function in `domain/timeline/operations.ts` + a
  store action + a test.
- New generative capability → a `VideoGenerationProvider` method + Studio wiring
  gated on `capabilities`.
- New recipe step → an entry in `automation/types.ts` `STEP_DEFS` + a case in
  `automationStore.executeStep` (reuse an existing op) + a test.
- New user-facing string → a key in `src/i18n/en.ts` (+ `es.ts` where you can).

## Schema changes

Bump `PROJECT_SCHEMA_VERSION` and add a fill-in-defaults branch to
`src/domain/migrate.ts`. Never invalidate old projects (spec §241). Add a Dexie
`version(n)` for new tables.
