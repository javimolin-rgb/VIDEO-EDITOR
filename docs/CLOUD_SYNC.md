# Cloud sync — GitHub as project storage

The editor has **no account and no server**. To keep projects off a single
machine you can sync them to a **GitHub repository you own**. Nothing else
leaves the browser; the only network target is `api.github.com`.

Code: [`src/storage/projectPackage.ts`](../src/storage/projectPackage.ts) (the
bundle), [`src/cloud/github.ts`](../src/cloud/github.ts) (Contents API),
[`src/state/syncStore.ts`](../src/state/syncStore.ts) (manual + auto push),
[`src/ui/editor/GitHubSync.tsx`](../src/ui/editor/GitHubSync.tsx) (Settings UI).

## The project package

`buildPackage(projectId)` produces one JSON file — `<projectId>.json`
(`aiv-project-package`, v1) — containing:

- the project document (timeline, settings, storyboard, references…)
- every asset: metadata **and** its media, base64-encoded
- version history snapshots
- generation records

`importPackage(pkg, mode)`:

- **`replace`** — keeps all ids; used by Pull to overwrite the local copy.
- **`copy`** — re-keys the project, clips and assets; used by Import to fork a
  fresh project.

**Export / Import** buttons in Settings do this to a local file
(`.aivproj.json`) with no GitHub involved — a portable backup / hand-off.

## One-time setup

1. Create a repo you own (private is fine), e.g. `you/video-projects`.
2. Create a **fine-grained personal access token** scoped to that one repo with
   **Contents: Read and write**. (A classic token with `repo` also works.)
3. **Settings → Cloud (GitHub)**:
   - **Repository** — `owner/repo`
   - **Token** — paste the PAT (stored only in `localStorage`, sent only to
     `api.github.com`)
   - **Branch** — default `main`
   - **Folder** — default `projects/`
   - Click **Test** — it verifies the token can push (`permissions.push`).

> The token lives in this browser only. It is never committed, never logged,
> never sent anywhere but GitHub. Clearing site data removes it.

## Pushing and pulling

- **Push now** — writes `projects/<projectId>.json` (create, or update with the
  current file sha). Packages over ~45 MB are refused with a clear message —
  large source media belongs in the timeline, not the cloud bundle.
- **Refresh** — lists `projects/*.json` in the repo with their project names.
- **Pull** — downloads a remote package and `importPackage(…, 'replace')` over
  the local project.

### Auto-sync on save

Tick **"Auto-sync on save"**. `syncStore` subscribes to the project store and,
~15 s after autosave settles (and never while the project is still `dirty`),
runs a single debounced **Push now**. Editing keeps resetting the timer, so a
push lands once you pause. Toggle it off for fully offline work.

## Conflicts

This is last-writer-wins on a per-project JSON file — there is no merge. If you
edit the same project from two machines, Pull before you start on the second
one, or the next Push overwrites the other machine's changes. For true
multi-user editing, use separate project files.
