# ⛂ Archive

A private, local-first library of playables. Static HTML/CSS/JS — no build step, no server, no tracking.

## Deploy on GitHub Pages

1. Create a repository (any name works, e.g. `archive`).
2. Upload everything in this folder — keep the folder structure (`index.html` at the root, `assets/` next to it).
3. Repo **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
4. Your site lives at `https://<user>.github.io/<repo>/`.

Everything runs client-side, so GitHub Pages is all you need. The whole site is ~330 KB (covers are fetched on demand, not bundled).

## Access

The site asks for an access key once per device. After a successful entry the device is remembered in its own local storage — the key is never asked for again on that machine, and copying the link alone doesn't get anyone in.

To change or revoke the key, edit `KEY_HASH` in `assets/js/auth.js` (it stores `sha256("arc.v1:YOURKEY")`, not the key itself — generate a new hash with any SHA-256 tool).

## Features

- **2,000+ games** across 21 genres and 46 ranked series, each game tagged and curated
- **Featured + Trending** shelves lead with Traffic Rider and Traffic Racer (web builds, always playable — the rest are Drive embeds)
- **Covers on demand** — no bundled images. Card art is fetched from Wikipedia with a strict relevance filter (only pages whose description says it's that video game), cached per device, with clean letter tiles as fallback. Games hosted on publisher CDNs (like the two above) use their official thumbnails.
- **Player** — reload, display modes (fit / original), fullscreen (`F`), direct-link fallback, auto clicker hook
- **Tools** — auto clicker (works inside uploaded games), tab cloak, panic key (all in Settings)
- **Uploads** (Settings → Data → Add games) — paste Google Drive links (batch friendly) or drop `.html` files; files are scanned and known miners/trackers/redirect scripts are stripped automatically. Uploads stay on the device (IndexedDB)
- **Emulation** — drop a ROM and it runs locally via EmulatorJS; the built-in retro shelf covers 17 consoles
- **Search** — `Ctrl+K` from anywhere
- **Collapsible sidebar** — the ☰ button tucks it into an icon rail (or opens the drawer on phones)

## Curator / developer mode

Settings → Developer → enter the dev code to unlock:

- **Remove games** — hover any card, click ✕, confirm. The game disappears from the library.
- **Undo** — press the browser **Back** button (or the Undo button in Settings) to restore the last removal or cover change.
- **Cover picker** — hover a card, click the picture button: it auto-searches `"<Game Name> game cover"` and shows only relevant results. Click one to apply, paste a URL, or upload a file (auto-shrunk to 400px).
- **Firebase sync (optional)** — paste a Realtime Database URL (`https://<project>-default-rtdb.firebaseio.com`) and optional auth token. Removals and cover picks then sync to every device you configure, no SDK needed (plain REST). Without it, dev state can still be exported/imported as a file.

## Notes

- Most games are embedded from the sources the library was built from (Google Drive previews). If a single game ever refuses to load, use the **Direct** button in the player toolbar.
- Traffic Rider / Traffic Racer stream from GameMonetize's publisher CDN (the same network most unblocked sites embed from). First load downloads the engine (~20–40 MB), then it's cached by the browser. They show a short skippable ad — that's how the devs keep them free.
- All data (favorites, uploads, settings, dev state) lives in your browser. Use Settings → Data → Export for backups.
