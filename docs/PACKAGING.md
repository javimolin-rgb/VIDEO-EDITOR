# Packaging (desktop)

The editor runs as a plain web app **and** as a thin desktop shell (spec §249,
§250). The web layer is identical in both; the shell only hosts it in a native
window. Nothing in the shell talks to a network.

## Web build

```bash
npm run build      # → dist/  (static, deploy anywhere or open locally)
npm run preview
```

## Desktop (Tauri)

Scaffold is in `src-tauri/` (`tauri.conf.json`, `Cargo.toml`, `src/main.rs`).
Tauri was chosen over Electron for a much smaller binary.

Prerequisites on the build machine:

- Rust (`rustup`, stable ≥ 1.77)
- Platform build tools (Xcode CLT on macOS; `build-essential` + WebKitGTK on
  Linux; MSVC + WebView2 on Windows)
- `npm i -D @tauri-apps/cli`

Then:

```bash
npm run tauri dev      # hot-reload desktop window against the Vite dev server
npm run tauri build    # native installer(s) in src-tauri/target/release/bundle/
```

`beforeDevCommand` / `beforeBuildCommand` in `tauri.conf.json` run `npm run
dev` / `npm run build` automatically.

## First-run experience (spec §252, §253)

The web app already provides the soft landing:

1. **Project browser** — "Open a sample project" (a pre-sketched storyboard +
   captions so the idea → generate → edit → export loop is visible immediately),
   or "+ New project".
2. **AI Setup** — hardware profile + on-device model downloads, each with size
   and licence, nothing silent.
3. **Settings → Diagnostics** — FPS, model states, storage, log export.

A native installer wrapper (welcome → hardware check → model selection → test →
first project) would sit on top of this and is the remaining Phase 8 item.
