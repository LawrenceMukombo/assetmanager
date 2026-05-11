# Windows Desktop Installer — Build Plan

> Status: **Plan only.** No code has been written. Implementation will be scheduled as a separate task once this plan is approved.

## 1. Goal

Produce a distributable Windows installer (`.msi` and/or `.exe`) for NPAMS that the project owner can build from a Windows laptop and hand to ICSA and other agencies. The installed app must show the existing NPAMS UI and talk to a configurable backend (hosted or LAN).

## 2. Approach Comparison

| | **Tauri 2.x** (recommended) | Electron |
|---|---|---|
| Installer size | ~5–15 MB | ~80–150 MB |
| Memory footprint | Low (uses Windows WebView2) | High (bundles Chromium) |
| Build toolchain on laptop | Node + Rust + WebView2 (preinstalled on Win 10/11) + WiX or NSIS | Node + electron-builder + WiX/NSIS |
| Installer formats | MSI (WiX), NSIS `.exe` | MSI, NSIS `.exe`, Squirrel |
| Auto-update | Built-in updater (signed manifest) | electron-updater |
| Code-signing | Standard Windows Authenticode (signtool) | Same |
| Learning curve | Light Rust knowledge needed for native shell | All JS/TS |
| Risk | Newer ecosystem, fewer plugins | Mature but bloated |

**Recommendation: Tauri 2.x.** Rationale:

- NPAMS is essentially a React SPA that already builds to static assets (`vite build` → `dist/public`). Tauri can wrap that build with almost no code changes.
- A 10 MB installer is far easier to email/USB-stick to government agencies than a 120 MB Electron bundle.
- WebView2 is preinstalled on Windows 10 (1803+) and Windows 11 — no extra runtime to ship.
- The owner builds infrequently from a single laptop, so the slightly heavier Tauri toolchain (Rust) is a one-time setup cost.

## 3. Prerequisites on the Build Laptop (Windows 10/11)

Install once:

1. **Node.js 22 LTS** — https://nodejs.org (must match the repo's `engines.node`).
2. **pnpm 9+** — `npm install -g pnpm`.
3. **Rust toolchain** — install via https://rustup.rs (choose "Default host triple: `x86_64-pc-windows-msvc`").
4. **Microsoft C++ Build Tools** — "Desktop development with C++" workload from the Visual Studio Installer (required by Rust on Windows).
5. **WebView2 Runtime** — preinstalled on Win 10 1803+/Win 11. Verify under Apps → "Microsoft Edge WebView2 Runtime".
6. **WiX Toolset v3.14** — https://wixtoolset.org (Tauri uses this to produce `.msi`). NSIS is bundled with Tauri for `.exe` installers.
7. *(Optional)* **signtool.exe** — comes with the Windows SDK; needed for Authenticode signing.

Sanity check after install:

```powershell
node -v        # v22.x
pnpm -v        # 9.x
rustc --version
cargo --version
```

## 4. Repo Structure Changes

Add a new package under the existing pnpm workspace:

```
artifacts/
  npams-web/            # existing React SPA
  api-server/           # existing Express API
  npams-desktop/        # NEW — Tauri shell
    package.json
    src-tauri/
      Cargo.toml
      tauri.conf.json
      icons/
      build.rs
      src/main.rs       # ~30 lines, mostly default
    scripts/
      build-installer.ps1
```

`pnpm-workspace.yaml` already includes `artifacts/*`, so the new package is picked up automatically.

`artifacts/npams-desktop/package.json` (sketch):

```jsonc
{
  "name": "@workspace/npams-desktop",
  "private": true,
  "scripts": {
    "build:web": "pnpm --filter @workspace/npams-web build",
    "tauri": "tauri",
    "build": "pnpm build:web && tauri build",
    "build:msi": "pnpm build:web && tauri build --bundles msi",
    "build:nsis": "pnpm build:web && tauri build --bundles nsis"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.x"
  }
}
```

`tauri.conf.json` key fields:

```jsonc
{
  "productName": "NPAMS",
  "identifier": "lk.icsa.npams",
  "build": {
    "frontendDist": "../npams-web/dist/public",
    "devUrl": "http://localhost:5173"
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "windows": { "wix": { "language": "en-US" } },
    "icon": ["icons/icon.ico", "icons/icon.png"]
  },
  "app": {
    "windows": [
      { "title": "NPAMS", "width": 1280, "height": 800, "resizable": true }
    ],
    "security": { "csp": null }
  }
}
```

## 5. Loading the Existing `npams-web` Build

The desktop shell is a thin window pointing at the static SPA build:

1. `pnpm --filter @workspace/npams-web build` produces `artifacts/npams-web/dist/public/`.
2. Tauri reads `frontendDist` from `tauri.conf.json` and embeds those static files into the installer.
3. No source changes are required in `npams-web` for the basic case.

A small change is needed so the SPA uses a relative `BASE_PATH`:

- `npams-web/vite.config.ts` already supports `process.env.BASE_PATH`. Build with `BASE_PATH=./` for the desktop bundle so asset URLs resolve under the `tauri://` scheme.

## 6. API Base URL Configuration

The installed client must talk to a backend that is *not* bundled. Strategy:

1. **Build-time default**: set `VITE_API_BASE_URL` when building for desktop, e.g. `https://npams.example.gov.lk/api`.
2. **Runtime override**: read a JSON config file written next to the install (`%APPDATA%\NPAMS\config.json`) so a sysadmin can repoint the app at a LAN server without rebuilding. Tauri's `fs` plugin loads this on startup and injects it into the SPA via `window.__NPAMS_CONFIG__`.
3. **First-run setup screen**: if no config is present, show a small "Server URL" dialog before the React app boots.

Concrete shape:

```jsonc
// %APPDATA%\NPAMS\config.json
{ "apiBaseUrl": "http://10.0.5.12:5000/api" }
```

The React app's existing API client (`@workspace/api-client-react`) needs a tiny shim to prefer `window.__NPAMS_CONFIG__.apiBaseUrl` over the build-time env var.

## 7. Offline / Online Behavior

- **Online (recommended)**: app launches, hits the configured API, behaves like the web app.
- **Offline**: out of scope for the first installer. The SPA assets load locally (so the UI renders), but data calls fail until connectivity returns. A future enhancement could add IndexedDB caching via the existing React Query layer.
- The installer itself runs fully offline once downloaded; no internet needed to install.

## 8. Build Commands (from the laptop)

From the repo root in PowerShell:

```powershell
pnpm install
pnpm --filter @workspace/npams-desktop build:msi
```

That single command:

1. Builds the React SPA (`vite build`).
2. Compiles the Tauri Rust shell.
3. Bundles assets + WebView2 loader.
4. Hands off to WiX to produce the `.msi`.

For the smaller NSIS `.exe`:

```powershell
pnpm --filter @workspace/npams-desktop build:nsis
```

## 9. Output Artifact Locations

After a successful build:

```
artifacts/npams-desktop/src-tauri/target/release/bundle/
  msi/
    NPAMS_1.0.0_x64_en-US.msi
  nsis/
    NPAMS_1.0.0_x64-setup.exe
```

The owner copies the `.msi` (or `.exe`) onto a USB stick / email / shared drive and delivers it to ICSA.

## 10. Code-Signing Options

| Option | Cost | UX on install |
|---|---|---|
| **Unsigned** | Free | SmartScreen warning ("Windows protected your PC"); user clicks "More info → Run anyway". Acceptable for internal pilot. |
| **Self-signed cert** | Free | Same SmartScreen warning, but customer can pre-trust the cert in their domain. Useful for ICSA on-prem. |
| **OV code-signing cert** (DigiCert, Sectigo) | ~$200/yr | Removes SmartScreen warning after a reputation period. |
| **EV code-signing cert** (hardware token) | ~$300–500/yr | Immediate SmartScreen trust, recommended for public distribution. |

Sign with `signtool.exe`:

```powershell
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 ^
  artifacts\npams-desktop\src-tauri\target\release\bundle\msi\NPAMS_1.0.0_x64_en-US.msi
```

Tauri can be configured to call `signtool` automatically by adding `bundle.windows.certificateThumbprint` to `tauri.conf.json`.

## 11. Auto-Update Strategy

Phase 1 (initial release): **manual updates** — owner emails new `.msi`, user reinstalls.

Phase 2: enable Tauri's built-in updater:

- Host an `update.json` manifest + signed `.msi` on the same server that hosts the API.
- Tauri checks the manifest on launch, prompts the user, downloads, verifies signature (Tauri's own ed25519 keypair), and installs.
- Requires generating an updater keypair (`tauri signer generate`) and embedding the public key in `tauri.conf.json`.

## 12. Distribution

- **Internal pilot (ICSA)**: hand-deliver `.msi` on USB or shared drive. Document SmartScreen click-through if unsigned.
- **Microsoft Store**: out of scope.
- **Group Policy / SCCM**: the `.msi` can be deployed silently with `msiexec /i NPAMS_1.0.0_x64_en-US.msi /quiet`. Mention this for IT teams.

## 13. Compile From My Laptop — Quick Reference

One-time setup:

```powershell
# Install Node 22, pnpm, Rust, VS Build Tools, WiX (see section 3).
git clone <repo-url>
cd <repo>
pnpm install
```

Every release:

```powershell
# 1. Bump version in artifacts/npams-desktop/src-tauri/tauri.conf.json
# 2. Build:
pnpm --filter @workspace/npams-desktop build:msi
# 3. Find installer at:
#    artifacts\npams-desktop\src-tauri\target\release\bundle\msi\NPAMS_<ver>_x64_en-US.msi
# 4. (Optional) Sign:
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 <path-to-msi>
```

## 14. Risks & Open Questions

- **WebView2 absence on locked-down Windows Server / very old Win 10 builds.** Mitigation: ship the WebView2 Bootstrapper (Tauri can embed it; adds ~1.5 MB).
- **Antivirus false positives** on unsigned NSIS builds. Mitigation: prefer MSI for first release, sign as soon as a cert is available.
- **API CORS**: hosted API must allow the `tauri://localhost` origin (or `https://tauri.localhost` on Windows). Update `cors()` in `artifacts/api-server/src/app.ts` when implementing.

## 15. Follow-Up Implementation Tasks

When this plan is approved, the implementing agent should execute:

1. **Scaffold `artifacts/npams-desktop`** — `pnpm create tauri-app` inside, wire it into the workspace, add scripts, commit `tauri.conf.json` with the values in §4.
2. **Add a `BASE_PATH=./` desktop build script** to `npams-web` so its assets resolve under `tauri://`.
3. **Implement the runtime config loader** — small Tauri command + React shim that reads `%APPDATA%\NPAMS\config.json` and exposes `window.__NPAMS_CONFIG__`.
4. **First-run "Server URL" dialog** in the React app when no config is present.
5. **Generate icons** (`icon.ico`, `icon.png`, splash) from the NPAMS logo using `tauri icon`.
6. **Update API CORS** to allow the Tauri origin.
7. **Produce the first unsigned `.msi`** end-to-end from the owner's laptop and verify it installs and connects to a hosted API.
8. **Document the SmartScreen click-through** for early users; revisit signing once a cert is procured.
9. *(Later)* Wire Tauri auto-updater + manifest hosting.

See also: [`backend-hosting.md`](./backend-hosting.md) for where the installed client should point.
