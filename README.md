# Pomotheon 🏛⏱

> A minimalist, local-first desktop Pomodoro application where focus yields credit points to pay respect to your personal Digital Pantheon.

Built with **Tauri v2**, **Rust**, and **Vite + Vanilla TypeScript**. Pomotheon requires no accounts, no backend server, and no cloud dependencies.

---

## 🏛 Core Concepts & Features

### 1. Minimal, Icon-First UI & Theming
- **Icon-First Interface**: Text button labels and helper texts have been removed in favor of clean inline SVG icons, preserving screen real estate and visual focus.
- **Accessibility**: All icon buttons feature dedicated `aria-label`, native `title` tooltips, and visible high-contrast focus rings.
- **Dual Themes (Light & Dark)**: Implemented with solid CSS custom property design tokens via the `data-theme` attribute. Defaults to the OS preference (`prefers-color-scheme`) and can be overridden in Settings with persistence across app restarts.
- **Solid Colors Only**: Zero gradients (0%) across both themes, providing high contrast and clean aesthetics.

### 2. Main Screen: Horizontal Playing-Card Snap Strip
- **Playing-Card Cards**: People in your Pantheon are displayed as playing-card cards, showcasing avatar, name, title, and quote.
- **Horizontal-Only Navigation**: A single horizontal row in a horizontally scrollable container with CSS scroll-snap (`scroll-snap-type: x mandatory`). No vertical scrolling of the strip or page.
- **Input Mapping**: Vertical mouse-wheel input is mapped to horizontal scrolling; Left/Right arrow keys smoothly navigate between cards.
- **Add Person Card**: The final card in the row is a dedicated "+" card for adding new inspirations.

### 3. Person Popup & Markdown Detail Files
- **Card Click**: Clicking *any* card opens the person popup.
- **Markdown Detail Files**: Each person's detail/biography is stored in its own dedicated Markdown file (`details/<person-id>.md`) in the app data directory, keeping `db.json` lean and modular.
- **Safe Markdown Rendering**: Rendered using `marked` and sanitized with `DOMPurify` to ensure safe, script-free HTML output with safe links.
- **Integrated Actions**: Icon buttons for Pay Respect, Edit, and Delete are conveniently accessible inside the popup. Deleting a person automatically deletes their associated Markdown file and image.

### 4. Pomodoro Timer
- **Session Types**: Configurable focus sessions (default 25 min), short breaks (5 min), and long breaks (15 min after 4 focus sessions).
- **Accurate When Minimized**: Calculates remaining duration via wall-clock target timestamps (`targetEndTime - Date.now()`) rather than drift-prone interval ticks.
- **Credit Points**: Earned **only** when a focus session is fully completed (default: 1 point per focus minute = 25 points). Skipped or reset sessions do not award points.
- **Audio Feedback**: Harmonious chimes synthesized via the standard Web Audio API and native desktop completion notifications.

### 5. Paying Respect & Internal Ledger
- **Pay Respect Action**: Spend credit points (default: 5 points) to pay respect to any person in your Pantheon.
- **Integrity-Guaranteed Balance**: Derived directly from the append-only ledger (`sum(earn) - sum(spend)`), preventing balance drift.
- **Instant Feedback**: Floating `+1` animation and audio ping when paying respect.
- **Navigation Integration**: Settings can be opened directly via the small gear icon button next to the credit balance display.

---

## 📂 Data Storage & OS Hierarchy

Pomotheon strictly adheres to standard OS directory hierarchies:

- **Linux / UNIX**: `$XDG_DATA_HOME/pomotheon/` (defaults to `~/.local/share/pomotheon/`)
  - `db.json`: Atomic JSON database (`schema_version: 2`) storing persons, ledger, and settings.
  - `images/`: Subdirectory containing uploaded avatar images (`<uuid>.<ext>`).
  - `details/`: Subdirectory containing Markdown detail files (`<person-id>.md`).
- **Windows**: `%APPDATA%\pomotheon\` (`db.json`, `images\`, and `details\`)
- **macOS**: `~/Library/Application Support/pomotheon/` (`db.json`, `images/`, and `details/`)

### Automatic Migration
On first launch, if existing data contains legacy inline `detail` text, it is automatically migrated into individual Markdown files under `details/`, the inline `detail` field is removed from `db.json`, and the schema version is updated to `2` using atomic file writes.

---

## 📦 Distribution & Packaging

- **Windows**: Prebuilt MSI installer attached to GitHub Releases.
- **macOS**: Prebuilt DMG installers for both **Apple Silicon** (`aarch64`) and **Intel** (`x86_64`) attached to GitHub Releases.
- **Linux**: Build from source only.

### GitHub Actions Release Automation
A release workflow (`.github/workflows/release.yml`) powered by `tauri-apps/tauri-action` is triggered on any `v*` tag push (e.g. `v0.1.0`). It automatically:
1. Matrix builds the Windows MSI installer.
2. Matrix builds the macOS DMG for Apple Silicon (`aarch64-apple-darwin`).
3. Matrix builds the macOS DMG for Intel (`x86_64-apple-darwin`).
4. Attaches all built installers as draft release assets.

---

## 🚀 Linux Source Build (Painless Setup)

The toolchain is strictly pinned to ensure reproducible, zero-friction builds on Linux:

- **Node.js**: Pinned via [`.nvmrc`](file:///.nvmrc) (`22`) and [`package.json`](file:///package.json) engines (`node >= 20.0.0`).
- **Rust**: Pinned via [`rust-toolchain.toml`](file:///rust-toolchain.toml) (`stable`).
- **Lockfiles**: Both [`package-lock.json`](file:///package-lock.json) and [`src-tauri/Cargo.lock`](file:///src-tauri/Cargo.lock) are committed to lock exact dependency versions.

### 1. Install Prerequisites (Arch Linux example)
```bash
sudo pacman -S webkit2gtk-4.1 gtk3 libsoup3 cairo pango glib2
```
*(On Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`)*

### 2. Install Dependencies
```bash
npm ci
```

### 3. Run in Development Mode
```bash
npm run tauri dev
```

### 4. Run Automated Tests
```bash
npm test
# or directly with Cargo:
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
```

### 5. Build Desktop Executable
```bash
npm run tauri build
```
The compiled binary will be placed at `src-tauri/target/release/pomotheon`.

---

## 📋 Assumptions Made

1. **Theme Preference Fallback**: Defaults to the OS preference via `prefers-color-scheme` when set to `system`; explicit overrides (`light` or `dark`) persist in the database settings.
2. **Horizontal Strip Navigation**: Horizontal wheel scrolling is mapped directly to the container scroll position for smooth mouse wheel and touchpad usage without vertical page displacement.
3. **Safe Markdown Rendering**: Raw HTML tags and unsafe script attributes are scrubbed using DOMPurify while safe Markdown elements (headings, lists, blockquotes, code blocks) render with full styling.
4. **Detail Storage**: When person detail is empty or cleared, any existing Markdown file under `details/<person-id>.md` is cleaned up to prevent orphaned files.
