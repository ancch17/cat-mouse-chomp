# 🐭 Andrew's Cat & Mouse Chomp 🧀

A Pac-Man-style maze game with a twist: you're a **mouse** chomping bits of cheese
while a pack of **cats** hunts you down.

## Features

- **Procedurally generated mazes** — every level gets a brand-new, symmetric,
  fully connected maze (seeded, so level N always looks the same for everyone).
- **Escalating difficulty** — each level adds more cats, faster cats, smarter
  pathfinding, shorter power-ups, and extra side tunnels. Cheese starts sparse
  (~38% of corridors on level 1) and grows ~7% per level until the board is full.
- **Power cheese** — grab the big wedge to turn the tables and chomp the cats
  (200 / 400 / 800 / 1600 point chains).
- **Cat personalities** — direct chaser, ambusher, flanker, and a wildcard, with
  classic scatter/chase mode switching.
- **Desktop controls** — arrow keys or WASD.
- **Mobile controls** — a floating virtual joystick: touch anywhere and slide
  your finger to steer.
- **Music & sound** — looping chiptune soundtrack that speeds up with each level,
  with separate music and sound-effects toggle buttons.
- **Top-15 leaderboard** — beat a leaderboard score and enter your name. Scores
  are shared via the server (`/api/leaderboard`) so everyone playing your deployed
  URL competes on one board; falls back to localStorage when offline. The 🏆
  button shows the board any time (it pauses the game).
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

- `server.js` — tiny zero-dependency static file server (serves `public/`)
  plus a JSON leaderboard API (`GET`/`POST /api/leaderboard`, top 15).
- `public/game.js` — the whole game: seeded maze generation (recursive
  backtracker + dead-end removal + loop carving + mirror symmetry +
  connectivity repair), tile-to-tile movement, cat AI, rendering, audio, input.

## License

MIT
