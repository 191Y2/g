# ⛂ Archive

A private, local-first library of playables. Static HTML/CSS/JS — no build step, no server, no tracking.

## Deploy on GitHub Pages

1. Create a repository (any name works, e.g. `archive`).
2. Upload everything in this folder — keep the structure (`index.html` at the root, `assets/` and `games/` next to it).
   - The repo is ~360 MB. The GitHub **web uploader will be slow / may choke** — push with git instead:
     ```
     git init
     git add .
     git commit -m "archive"
     git branch -M main
     git remote add origin https://github.com/<user>/<repo>.git
     git push -u origin main
     ```
3. Repo **Settings → Pages → Source: Deploy from a branch → main / (root)** → Save.
4. Your site lives at `https://<user>.github.io/<repo>/`.

**Why games run at school:** every game file is hosted inside this repo (`games/` folder) and assets load from mainstream CDNs (jsdelivr). Nothing touches Google Drive, so Lightspeed/MCPS filters that block Drive don't affect it. If a single game ever fails, the player automatically falls back to its original Drive link (works on unfiltered networks), and the **Direct** button opens the source.

## Access

The site asks for an access key once per device. After a successful entry the device is remembered in its own local storage — the key is never asked for again on that machine, and copying the link alone doesn't get anyone in.

To change or revoke the key, edit `KEY_HASH` in `assets/js/auth.js` (it stores `sha256("arc.v1:YOURKEY")`, not the key itself — generate a new hash with any SHA-256 tool).

## Developer mode

One-time code, entered in **Settings → Developer → Enter code**. Once unlocked on a device, it stays unlocked (same device-binding as the access key).

- **Remove a game** — every game card gets an × button. Click it, confirm, and the game disappears from the library on every synced device. Restore everything (or per-game) from Settings → Developer → Restore all.
- **Set a cover** — every game card gets an image button. Click it and the picker automatically searches the web for **"<game name> game cover"**. Click a result to apply it. **Back** reverts to the previously selected cover (keeps working through your whole pick history). Results are strictly filtered so only images that clearly match the game name are shown — if nothing matches, you get "no results" instead of random pictures.

### Cover search sources (in order)

1. **Google Images** — optional. Paste a free Custom Search API key + cx in Settings → Developer → Google image search (100 searches/day free) for real Google results.
2. **Wikipedia** — automatic, no key. Pulls the actual box art for notable games.
3. **Openverse** — automatic, no key. Openly-licensed web images.

## Cloud sync (Firebase)

Covers and removals sync across devices through **your own** Firebase Realtime Database:

1. console.firebase.google.com → Add project.
2. Build → **Realtime Database** → Create database → start in **test mode**.
3. Project settings (gear) → Your apps → Web app → copy the `firebaseConfig` object.
4. Site: Settings → Cloud sync → Connect → paste the config.

No Firebase SDK is bundled — the site talks to the Realtime Database REST API directly (it is CORS-enabled), so the site stays a few hundred KB of static files. Without Firebase, covers still save locally and can be moved with Export/Import.

## Features

- **1,796 games**, 1,795 hosted locally in-repo, across 21 genres and 46 ranked series
- **Player** — reload, display modes (fit / original), fullscreen (`F`), auto clicker bridge, direct-link fallback
- **Tools** — auto clicker (works inside uploaded games), tab cloak, panic key (all in Settings)
- **Uploads** — paste Google Drive links (batch friendly) or drop `.html` files; files are scanned and known miners/trackers/redirect scripts are stripped automatically. Uploads stay on the device (IndexedDB). Managed from **Settings → Library & uploads**.
- **Emulation** — drop a ROM and it runs locally via EmulatorJS; the built-in retro shelf covers 17 consoles
- **Search** — `Ctrl+K` from anywhere
- **Sidebar** — collapsible to an icon rail (state is remembered)

## Notes

- `games/manifest.json` lists every game that has a local copy; the player checks it once per visit and picks local-first.
- One game (Super Smash Bros. Melee) streams a 1.4 GB ISO from Drive and can't be hosted on GitHub (100 MB file limit) — it needs an unfiltered network.
- All personal data (favorites, uploads, covers, settings) lives in the browser. Use Settings → Data → Export for backups.
