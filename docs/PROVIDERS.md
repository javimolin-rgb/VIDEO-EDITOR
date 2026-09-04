# Providers

A **provider** is an implementation of `VideoGenerationProvider`
(`src/ai/provider.ts`). It exposes `id`, `name`, `capabilities`, a `health()`
check, `getJobStatus` / `cancelJob`, and whichever `generate*` methods it can
truly perform.

## The golden rule (spec §201, §94, §265)

Application code branches on **capabilities**, never on a provider id:

```ts
// yes
if (route('image-to-video').provider) { … }
if (provider.capabilities.referenceToVideo) { … }

// never
if (provider.id === 'seedance') { … }
```

Deleting any `src/ai/providers/<name>/` directory except `local/` must leave the
project compiling and running. There is no build-time or runtime dependency on
external adapters.

## Built-in: `local`

`src/ai/providers/local/localProvider.ts`. Always registered, always first in
the routing order, always the fallback. Its capabilities are all `false` until:

1. a compatible model is `installed` in the registry, **and**
2. the local inference service answers `GET /health` (Phase 3).

Until then the Studio shows honest disabled states — no fake output, ever
(spec §159).

## Built-in: `procedural`

`src/ai/providers/procedural/`. Always registered, last in the routing order.
Needs no model and no download — it synthesises frames from the structured
prompt (seeded, deterministic). It is **not** a diffusion model and is labelled
"no model" everywhere it appears. It exists so generative modes are never dead.

## Built-in (opt-in): `comfyui`

`src/ai/providers/comfyui/`. A **real local diffusion backend** — it drives a
ComfyUI server the user runs, with the user's own API-format workflow. Its
`capabilities` are all `false` until the adapter is enabled in **AI Setup →
ComfyUI backend** *and* a workflow is configured; then `textToVideo` /
`imageToVideo` turn on and it routes **ahead of** `procedural`. Removing the
folder leaves the build working (orchestrator is the only import site). Full
setup: [`COMFYUI.md`](COMFYUI.md).

## Adding an optional external provider (future)

1. Create `src/ai/providers/<name>/<name>Provider.ts` implementing the
   interface. All network calls go through a **server-side proxy**, never the
   browser, and API keys never reach client code (spec §96).
2. Register it explicitly from an opt-in settings screen:
   `registerProvider(new FooProvider())`.
3. Ship it **disabled by default** (spec §94).
4. Add a row to the capability matrix in `MODELS.md`.

The router picks it only when `local` cannot do the task and the user has
enabled it. Removing the folder is a supported operation.
