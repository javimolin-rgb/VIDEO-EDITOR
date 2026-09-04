# Packaging (desktop)

The editor runs as a plain web app **and** as a thin desktop shell (spec §249,
§250). The web layer is identical in both; the shell only hosts it in a native
window. Nothing in the shell talks to a network on its own.

## Web build

```bash
npm run build      # → dist/  (static, deploy anywhere or open locally)
npm run preview
```

## Desktop (Tauri v2)

Scaffold is in `src-tauri/`:

| file | role |
| --- | --- |
| `tauri.conf.json` | v2 config — `frontendDist: ../dist`, window, `bundle.targets: ["app","dmg"]`, icon set |
| `Cargo.toml` | `[lib]` crate `ai_video_editor_lib` + release profile (`lto`, `strip`, `opt-level "s"`) |
| `src/lib.rs` | `pub fn run()` — `tauri::Builder::default().run(generate_context!())` |
| `src/main.rs` | calls `ai_video_editor_lib::run()` |
| `capabilities/default.json` | `core:default` permission for the `main` window — nothing else |
| `icons/` | generated app icon set (`32`, `128`, `128@2x`, `.icns`, `.ico`) |

Tauri was chosen over Electron for a much smaller binary (no bundled Chromium —
it uses the OS WebView).

### One-time prerequisites on the build machine

- **Rust** (stable ≥ 1.77):

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

- Platform build tools:
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`)
  - **Linux** — `build-essential`, `libwebkit2gtk-4.1-dev`, `libssl-dev`,
    `libayatana-appindicator3-dev`, `librsvg2-dev`
  - **Windows** — MSVC build tools + WebView2 runtime
- The Tauri CLI is already a dev-dependency (`@tauri-apps/cli` in
  `package.json`); `npm install` pulls it.

### Build / run

```bash
npm run app:dev      # hot-reload desktop window against the Vite dev server
npm run app:build    # native bundle in src-tauri/target/release/bundle/
```

`app:build` on macOS produces `bundle/macos/AI Video Editor.app` and
`bundle/dmg/AI Video Editor_0.1.0_<arch>.dmg`. `beforeDevCommand` /
`beforeBuildCommand` in `tauri.conf.json` run `npm run dev` / `npm run build`
automatically, so the web layer is always rebuilt first.

> The first `app:build` compiles the Rust dependency tree and takes several
> minutes; later builds are incremental. Rust is **not** installed in the CI /
> authoring environment used to write this repo, so the desktop bundle has not
> been produced here — the scaffold is complete and standard, but build it on a
> machine with the toolchain above.

## Cloud sync (optional)

The desktop app has no built-in account or server. To keep projects off a
single machine, **Settings → Cloud (GitHub)** pushes a portable project package
to a GitHub repo you own (Contents API, your token, nothing else). See
[`CLOUD_SYNC.md`](CLOUD_SYNC.md).

## First-run experience (spec §252, §253)

1. **Project browser** — "Open a sample project" (a pre-sketched storyboard +
   captions so the idea → generate → edit → export loop is visible immediately),
   or "+ New project".
2. **AI Setup** — hardware profile, on-device model downloads (size + licence,
   nothing silent), and the **ComfyUI backend** panel for real diffusion.
3. **Settings → Diagnostics** — FPS, model states, storage, log export.
