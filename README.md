# Pomotheon

*genAI brainrot pomodoro application.*

Pomodoro + Pantheon. No deeper meaning. I just thought of it.

Focus for 25 minutes, earn points, spend them on paying respect to people you picked yourself. Mostly written with AI. Fully offline, no accounts, no purpose.

## Install

### Windows and macOS

Download the installer from the [Releases](https://github.com/tungle2202/pomotheon/releases) page.

| Platform | File |
|----------|------|
| Windows  | `.msi` |
| macOS (Apple Silicon) | `aarch64` `.dmg` |
| macOS (Intel) | `x64` `.dmg` |

The installers are **not code-signed** (this is a joke project, not a business), so your OS will complain:

- **Windows:** SmartScreen may show "Windows protected your PC". Click **More info**, then **Run anyway**. Requires Microsoft Edge WebView2, which is already included in Windows 11 and up-to-date Windows 10.
- **macOS:** if Gatekeeper blocks the app, right-click it and choose **Open**.

### Linux (build from source)

There are no prebuilt Linux packages. Build it yourself, it takes a few minutes.

**1. Install system dependencies**

Debian / Ubuntu:

```bash
sudo apt update
sudo apt install build-essential curl wget file libwebkit2gtk-4.1-dev \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Fedora:

```bash
sudo dnf group install "c-development"
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libxdo-devel libappindicator-gtk3-devel librsvg2-devel
```

Arch:

```bash
sudo pacman -S --needed base-devel webkit2gtk-4.1 curl wget file openssl \
  libappindicator-gtk3 librsvg xdotool
```

Other distros: see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

**2. Install Rust and Node.js**

- Rust via [rustup](https://rustup.rs/). The version is pinned in `rust-toolchain.toml` and picked up automatically.
- Node.js via your package manager or [nvm](https://github.com/nvm-sh/nvm). The version is pinned in `.nvmrc` (`nvm use`).

**3. Build**

```bash
git clone https://github.com/tungle2202/pomotheon.git
cd pomotheon
npm ci
npm run tauri build
```

To run in development mode with hot reload:

```bash
npm run tauri dev
```

To run unit tests:

```bash
npm test
```

**4. Run**

The raw binary is at:

```
src-tauri/target/release/pomotheon
```

Copy it anywhere on your `PATH`, for example:

```bash
sudo install -Dm755 src-tauri/target/release/pomotheon /usr/local/bin/pomotheon
```

Tauri also leaves `.deb`, `.rpm` and `.AppImage` files in `src-tauri/target/release/bundle/` if you prefer those.

## Where your data is stored

Pomotheon uses each OS's standard app data folder:

| OS      | Location |
|---------|----------|
| Linux   | `~/.local/share/pomotheon/` (respects `$XDG_DATA_HOME`) |
| Windows | `%APPDATA%\pomotheon\` |
| macOS   | `~/Library/Application Support/pomotheon/` |

Inside that folder:

- `db.json`: your people, point history and settings
- `images/`: pictures you added to the Pantheon
- `details/`: one Markdown file per person (their "detail" text)

**Backup:** copy the whole folder.
**Reset:** close the app and delete the folder.

## Troubleshooting

- **Blank window on Linux:** make sure `webkit2gtk-4.1` is installed. On some GPU setups, try `WEBKIT_DISABLE_DMABUF_RENDERER=1 pomotheon`.
- **App won't start after a crash:** data is written atomically, so it should be intact. If it still fails, back up and remove `db.json` to start fresh.

## License

THE UNLICENSE
