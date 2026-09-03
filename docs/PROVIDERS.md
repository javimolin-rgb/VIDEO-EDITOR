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
