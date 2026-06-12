# 🐭 Andrew's Cat & Mouse Chomp 🧀

A Pac-Man-style maze game with a twist: you're a **mouse** chomping bits of cheese
while a pack of **cats** hunts you down.

## Features

- **Procedurally generated mazes** — every level gets a brand-new, symmetric,
  fully connected maze with **no dead ends**. Each new game rolls a fresh seed,
  so after a game over the whole run is a different set of layouts than the
  last one.
- **Growing arena** — level 1 is a compact 13×13 maze packed edge-to-edge with
  cheese; the maze perimeter expands every level (up to 21×23), so more cheese
  always means a bigger playfield — never empty corridors.
- **Escalating difficulty** — each level adds more cats, faster cats, smarter
  pathfinding, shorter power-ups, and extra side tunnels.
- **Power cheese** — grab the big wedge to turn the tables and chomp the cats
  (200 / 400 / 800 / 1600 point chains).
- **Cat personalities** — direct chaser, ambusher, flanker, and a wildcard, with
  classic scatter/chase mode switching.
- **Desktop controls** — arrow keys or WASD.
- **Mobile controls** — a floating virtual joystick: touch anywhere and slide
  your finger to steer.
- **Music & sound** — a different chiptune tune is composed for every level
  (seeded: new key, chord progression, and melody each level, tempo rising as
  you go), with separate music and sound-effects toggle buttons.
- **Top-7 leaderboard** — beat a leaderboard score and enter your name; the
  board shows Name, Level reached, and Score. Shared via the server
  (`/api/leaderboard`) so everyone playing your deployed URL competes on one
  board; falls back to localStorage when offline. The 🏆 button shows the
  board any time (it pauses the game).
- **Extras** — high score persistence, extra life every 10,000 points,
  wrap-around tunnels.

## Run locally

Requires Node.js 18+ (no dependencies to install):

```bash
npm start
```

Then open <http://localhost:3000>.

## Deploy on Railway

This repo is Railway-ready (`railway.json` + zero-dependency Node server that
respects `$PORT`).

**Option A — from GitHub (recommended):**
1. Go to [railway.com/new](https://railway.com/new) and choose **Deploy from GitHub repo**.
2. Pick this repository. Railway auto-detects Node and runs `node server.js`.
3. In the service settings, click **Generate Domain** to get a public URL.

**Option B — Railway CLI:**
```bash
railway login
railway init
railway up
railway domain
```

> **Leaderboard persistence on Railway:** scores are kept in `data/leaderboard.json`,
> which resets on redeploy. To keep them forever, add a Volume to the service in
> the Railway dashboard (mount it at `/data`) and set the env var `DATA_DIR=/data`.

## How it works

- `server.js` — tiny zero-dependency static file server (serves `public/`,
  gzip-compressed with sensible caching) plus a JSON leaderboard API
  (`GET`/`POST /api/leaderboard`, top 7).
- `public/game.js` — the whole game: per-run seeded maze generation (recursive
  backtracker + loop carving + mirror symmetry + connectivity repair + full
  dead-end elimination), tile-to-tile movement, cat AI, rendering, audio, input.

## License

MIT
