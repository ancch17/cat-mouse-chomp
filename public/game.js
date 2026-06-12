'use strict';
/* ============================================================
   Cat & Mouse Chomp — a Pac-Man-style maze chase.
   The mouse eats cheese; the cats hunt the mouse.
   Every level gets a freshly generated maze and tougher cats.
   ============================================================ */

/* ---------- constants ---------- */
const T = 24;
// The maze grows with the level: small and dense early, expanding to 21x23.
// These are reassigned by generateLevel/applyDims for the current maze.
let COLS = 13, ROWS = 13;
let W = COLS * T, H = ROWS * T;
let MID = (ROWS - 1) / 2;            // center row
let CX = (COLS - 1) / 2;             // center col

function mazeSize(level) {
  return {
    cols: Math.min(13 + 2 * Math.floor(level / 2), 21),
    rows: Math.min(13 + 2 * Math.floor((level - 1) / 2), 23)
  };
}
const DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const OPP  = { up:'down', down:'up', left:'right', right:'left' };
const DKEYS = ['up','down','left','right'];
const CAT_COLORS = ['#ff8c1a', '#b9bfd4', '#a9745b', '#e88bc4', '#7fd47f', '#e8d8a0'];
const CAT_NAMES  = ['Tom', 'Misty', 'Bruno', 'Pinky', 'Moss', 'Butter'];

/* ---------- seeded rng ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- difficulty curve ---------- */
function catCount(level)  { return Math.min(2 + Math.floor((level - 1) / 2), 6); }
function catSpeed(level)  { return Math.min(3.0 + 0.28 * (level - 1), 4.5); }   // tiles/sec
function catSmart(level)  { return Math.min(0.58 + 0.06 * (level - 1), 0.95); } // chance of optimal turn
function frightDur(level) { return Math.max(7 - 0.6 * (level - 1), 1.8); }      // seconds
function scatterDur(level){ return Math.max(6 - 0.4 * (level - 1), 1.5); }
const MOUSE_SPEED = 4.2;

/* ============================================================
   Maze generation — seeded per level, mirrored left/right,
   loops added, dead ends removed, guaranteed fully connected.
   ============================================================ */
function generateLevel(level) {
  const { cols, rows } = mazeSize(level);
  COLS = cols; ROWS = rows;
  W = COLS * T; H = ROWS * T;
  MID = (ROWS - 1) / 2; CX = (COLS - 1) / 2;

  // Seeded per level AND per run: every new game rolls a fresh runSeed, so
  // the level layouts are different from the previous playthrough.
  const rng = mulberry32(level * 7349 + game.runSeed);
  const HW = CX + 1; // half width incl. center column

  // --- carve a maze on the left half with recursive backtracker ---
  const half = Array.from({ length: ROWS }, () => Array(HW).fill(1));
  half[1][1] = 0;
  const stack = [[1, 1]];
  const steps = [[-2,0],[2,0],[0,-2],[0,2]];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const opts = [];
    for (const [dr, dc] of steps) {
      const nr = r + dr, nc = c + dc;
      if (nr > 0 && nr < ROWS - 1 && nc > 0 && nc < HW - 1 && half[nr][nc] === 1) opts.push([dr, dc]);
    }
    if (opts.length) {
      const [dr, dc] = opts[(rng() * opts.length) | 0];
      half[r + dr / 2][c + dc / 2] = 0;
      half[r + dr][c + dc] = 0;
      stack.push([r + dr, c + dc]);
    } else stack.pop();
  }

  // --- remove dead ends (Pac-Man mazes are loopy) ---
  for (let pass = 0; pass < 3; pass++) {
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < HW - 1; c++) {
      if (half[r][c] !== 0) continue;
      const nbs = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      const open = nbs.filter(([a,b]) => half[a] && half[a][b] === 0).length;
      if (open <= 1) {
        const cand = [];
        for (const [dr, dc] of steps) {
          const wr = r + dr/2, wc = c + dc/2, or = r + dr, oc = c + dc;
          if (or > 0 && or < ROWS - 1 && oc > 0 && oc < HW &&
              half[wr][wc] === 1 && half[or] && half[or][oc] === 0) cand.push([wr, wc]);
        }
        if (cand.length) {
          const [wr, wc] = cand[(rng() * cand.length) | 0];
          half[wr][wc] = 0;
        }
      }
    }
  }

  // --- extra loops ---
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < HW - 1; c++) {
    if (half[r][c] !== 1) continue;
    const horiz = half[r][c-1] === 0 && c + 1 < HW && half[r][c+1] === 0;
    const vert  = half[r-1][c] === 0 && half[r+1][c] === 0;
    if ((horiz || vert) && rng() < 0.14) half[r][c] = 0;
  }

  // --- mirror onto full grid ---
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < HW; c++) {
    grid[r][c] = half[r][c];
    grid[r][COLS - 1 - c] = half[r][c];
  }

  // --- open crossings through the center column ---
  const centerRows = [];
  for (let r = 1; r < ROWS - 1; r++) if (grid[r][CX - 1] === 0) centerRows.push(r);
  shuffle(centerRows, rng);
  const nOpen = Math.max(3, (centerRows.length * 0.4) | 0);
  for (let i = 0; i < Math.min(nOpen, centerRows.length); i++) grid[centerRows[i]][CX] = 0;

  // --- carve the cat den plaza in the middle ---
  for (let r = MID - 1; r <= MID + 1; r++)
    for (let c = CX - 2; c <= CX + 2; c++) grid[r][c] = 0;

  // --- side tunnels (wrap-around) ---
  const tunnelRows = [];
  const tunnelCands = [];
  for (let r = 2; r < ROWS - 2; r++) if (grid[r][1] === 0) tunnelCands.push(r);
  tunnelCands.sort((a, b) => Math.abs(a - MID) - Math.abs(b - MID));
  const nTunnels = level >= 3 && tunnelCands.length > 6 ? 2 : 1;
  for (let i = 0; i < nTunnels && i < tunnelCands.length; i++) {
    const r = i === 0 ? tunnelCands[0] : tunnelCands[tunnelCands.length - 1];
    if (tunnelRows.includes(r)) continue;
    grid[r][0] = 0; grid[r][COLS - 1] = 0;
    tunnelRows.push(r);
  }
  if (!tunnelRows.length) { // fallback: force one through the den row
    for (let c = 0; c <= CX - 2; c++) { grid[MID][c] = 0; grid[MID][COLS - 1 - c] = 0; }
    tunnelRows.push(MID);
  }

  // --- mouse spawn: open cell low in the maze, near the center ---
  let spawn = null;
  outer:
  for (let r = ROWS - 2; r > MID + 1; r--) {
    for (let off = 0; off <= CX; off++) {
      for (const c of off === 0 ? [CX] : [CX - off, CX + off]) {
        if (grid[r][c] === 0) { spawn = { col: c, row: r }; break outer; }
      }
    }
  }
  if (!spawn) spawn = { col: CX, row: MID + 1 };

  // --- connectivity repair: every open cell must reach the spawn ---
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  function bfs(from) {
    const dist = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    const q = [[from.row, from.col]];
    dist[from.row][from.col] = 0;
    while (q.length) {
      const [r, c] = q.shift();
      for (const k of DKEYS) {
        const d = DIRS[k];
        const nr = r + d.y;
        let nc = c + d.x;
        if (nr < 0 || nr >= ROWS) continue;
        nc = ((nc % COLS) + COLS) % COLS;
        if (grid[nr][nc] === 0 && dist[nr][nc] === -1) {
          dist[nr][nc] = dist[r][c] + 1;
          q.push([nr, nc]);
        }
      }
    }
    return dist;
  }

  for (let guard = 0; guard < 80; guard++) {
    const dist = bfs(spawn);
    let fixed = true;
    scan:
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      if (grid[r][c] === 0 && dist[r][c] === -1) {
        // find a wall between a reachable and an unreachable open cell
        for (let wr = 1; wr < ROWS - 1; wr++) for (let wc = 1; wc < COLS - 1; wc++) {
          if (grid[wr][wc] !== 1) continue;
          const around = [[wr-1,wc],[wr+1,wc],[wr,wc-1],[wr,wc+1]];
          let hasReach = false, hasUnreach = false;
          for (const [ar, ac] of around) {
            if (!inBounds(ar, ac) || grid[ar][ac] !== 0) continue;
            if (dist[ar][ac] >= 0) hasReach = true; else hasUnreach = true;
          }
          if (hasReach && hasUnreach) {
            grid[wr][wc] = 0;
            grid[wr][COLS - 1 - wc] = 0; // keep symmetry
            fixed = false;
            break scan;
          }
        }
        fixed = false;
        break scan;
      }
    }
    if (fixed) break;
  }

  // --- eliminate every remaining dead end (tunnel wrap counts as a way out) ---
  const wrapC = (c) => ((c % COLS) + COLS) % COLS;
  const openCount = (r, c) => {
    let n = 0;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr;
      if (nr < 0 || nr >= ROWS) continue;
      if (grid[nr][wrapC(c + dc)] === 0) n++;
    }
    return n;
  };
  for (let pass = 0; pass < 50; pass++) {
    let fixed = 0;
    for (let r = 1; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== 0 || openCount(r, c) > 1) continue;
      const cand = [];
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const wr = r + dr, wc = c + dc, fr = r + 2 * dr, fc = c + 2 * dc;
        if (wr < 1 || wr >= ROWS - 1 || wc < 1 || wc >= COLS - 1) continue;
        if (fr < 0 || fr >= ROWS || fc < 0 || fc >= COLS) continue;
        if (grid[wr][wc] === 1 && grid[fr][fc] === 0) cand.push([wr, wc]);
      }
      if (cand.length) {
        const [wr, wc] = cand[(rng() * cand.length) | 0];
        grid[wr][wc] = 0;
        grid[wr][COLS - 1 - wc] = 0; // keep left/right symmetry
        fixed++;
      }
    }
    if (!fixed) break;
  }

  // --- distance-to-den map (for "eyes" returning home) ---
  const denDist = bfs({ row: MID, col: CX });

  // --- pellets ---
  // Every corridor cell holds cheese — compact boards, no empty stretches.
  // More cheese per level comes from the maze itself growing (mazeSize).
  const pellets = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  const reach = bfs(spawn);
  let pelletTotal = 0;
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
    if (grid[r][c] !== 0 || reach[r][c] === -1) continue;
    if (r >= MID - 1 && r <= MID + 1 && c >= CX - 2 && c <= CX + 2) continue; // den
    if (r === spawn.row && c === spawn.col) continue;
    pellets[r][c] = 1;
    pelletTotal++;
  }
  // power cheese near the four corners
  const corners = [[1,1],[1,COLS-2],[ROWS-2,1],[ROWS-2,COLS-2]];
  for (const [cr, cc] of corners) {
    let best = null, bd = Infinity;
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      if (pellets[r][c] !== 1) continue;
      const d = Math.abs(r - cr) + Math.abs(c - cc);
      if (d < bd) { bd = d; best = [r, c]; }
    }
    if (best) pellets[best[0]][best[1]] = 2;
  }

  return { grid, pellets, pelletTotal, spawn, denDist, tunnelRows, level, cols: COLS, rows: ROWS };
}

/* ============================================================
   Game state
   ============================================================ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * DPR;
canvas.height = H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const ui = {
  score: document.getElementById('score'),
  high: document.getElementById('high'),
  level: document.getElementById('level'),
  lives: document.getElementById('lives'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ov-title'),
  ovMsg: document.getElementById('ov-msg'),
  ovBtn: document.getElementById('ov-btn'),
  ovHint: document.getElementById('ov-hint'),
  mute: document.getElementById('mute'),
  music: document.getElementById('music'),
  lbOpen: document.getElementById('lb-open'),
  lbBtn: document.getElementById('lb-btn'),
  lbList: document.getElementById('lb-list'),
  nameEntry: document.getElementById('name-entry'),
  nameInput: document.getElementById('name-input'),
  nameSave: document.getElementById('name-save'),
  joystick: document.getElementById('joystick'),
  stick: document.getElementById('stick'),
  area: document.getElementById('game-area')
};

const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

const game = {
  state: 'menu',          // menu | ready | playing | dying | clear | gameover
  runSeed: (Math.random() * 0x7fffffff) | 0, // re-rolled every new game
  level: 1,
  score: 0,
  high: Number(localStorage.getItem('cmc-high') || 0),
  lives: 3,
  nextLifeAt: 10000,
  maze: null,
  mouse: null,
  cats: [],
  desired: null,
  frightTimer: 0,
  chain: 0,
  modeTimer: 0,
  modePhase: 'scatter',
  stateTimer: 0,
  wallHue: 230,
  mazeLayer: null,        // prerendered walls
  time: 0
};

/* ---------- entities (tile-to-tile movement) ---------- */
function makeEntity(col, row, speed) {
  return {
    col, row,               // target tile (wrapped)
    fromCol: col, fromRow: row,
    uCol: col, uRow: row,   // unwrapped target for smooth tunnel rendering
    prog: 1,                // 1 = sitting at (col,row)
    dir: null,
    speed
  };
}

function wrapCol(c) { return ((c % COLS) + COLS) % COLS; }

function openAt(col, row) {
  if (row < 0 || row >= ROWS) return false;
  return game.maze.grid[row][wrapCol(col)] === 0;
}

function px(e) {
  let x = (e.fromCol + (e.uCol - e.fromCol) * e.prog + 0.5) * T;
  const y = (e.fromRow + (e.uRow - e.fromRow) * e.prog + 0.5) * T;
  x = ((x % W) + W) % W;
  return { x, y };
}

function reverseEntity(e) {
  if (!e.dir || e.prog >= 1) return;
  const nd = OPP[e.dir];
  const d = DIRS[nd];
  [e.fromCol, e.col] = [e.col, e.fromCol];
  [e.fromRow, e.row] = [e.row, e.fromRow];
  e.prog = 1 - e.prog;
  e.dir = nd;
  e.uCol = e.fromCol + d.x;
  e.uRow = e.fromRow + d.y;
}

/**
 * Advance an entity. `decide(e)` is called whenever it sits at a tile
 * center and must return a direction key or null (stand still).
 * `onArrive(e)` fires every time it reaches a new tile center.
 */
function updateEntity(e, dt, decide, onArrive) {
  let remaining = e.speed * dt;
  let guard = 8;
  while (remaining > 0 && guard-- > 0) {
    if (e.prog >= 1) {
      const nd = decide(e);
      if (!nd) break;
      const d = DIRS[nd];
      if (!openAt(e.col + d.x, e.row + d.y)) break;
      e.dir = nd;
      e.fromCol = e.col; e.fromRow = e.row;
      e.uCol = e.col + d.x; e.uRow = e.row + d.y;
      e.col = wrapCol(e.col + d.x); e.row = e.row + d.y;
      e.prog = 0;
    }
    const step = Math.min(remaining, 1 - e.prog);
    e.prog += step;
    remaining -= step;
    if (e.prog >= 0.999) {
      e.prog = 1;
      e.fromCol = e.col; e.fromRow = e.row;
      e.uCol = e.col; e.uRow = e.row;
      if (onArrive) onArrive(e);
    }
  }
}

/* ---------- cats ---------- */
function makeCat(i, level) {
  const offsets = [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1]];
  const [dc, dr] = offsets[i % offsets.length];
  const cat = makeEntity(CX + dc, MID + dr, catSpeed(level));
  cat.id = i;
  cat.color = CAT_COLORS[i % CAT_COLORS.length];
  cat.name = CAT_NAMES[i % CAT_NAMES.length];
  cat.corner = [[1,1],[1,COLS-2],[ROWS-2,1],[ROWS-2,COLS-2]][i % 4];
  cat.smart = catSmart(level);
  cat.mode = 'normal';      // normal | eyes
  cat.frightened = false;
  cat.sleep = 0.6 + i * 1.1; // staggered den exit
  cat.jitter = { c: 0, r: 0, t: 0 };
  return cat;
}

function wrapDx(a, b) {
  let dx = a - b;
  if (dx > COLS / 2) dx -= COLS;
  if (dx < -COLS / 2) dx += COLS;
  return dx;
}

function distSq(c1, r1, c2, r2) {
  const dx = wrapDx(c1, c2), dy = r1 - r2;
  return dx * dx + dy * dy;
}

function catTarget(cat) {
  const m = game.mouse;
  if (game.modePhase === 'scatter') return { col: cat.corner[1], row: cat.corner[0] };
  const md = m.dir ? DIRS[m.dir] : { x: 0, y: 0 };
  switch (cat.id % 4) {
    case 0: return { col: m.col, row: m.row };                                   // direct chaser
    case 1: return { col: m.col + md.x * 4, row: m.row + md.y * 4 };             // ambusher
    case 2: {                                                                    // flanker
      cat.jitter.t -= 0;
      return { col: m.col + cat.jitter.c, row: m.row + cat.jitter.r };
    }
    default: {                                                                   // wildcard
      const d2 = distSq(cat.col, cat.row, m.col, m.row);
      return d2 > 64 ? { col: m.col, row: m.row }
                     : { col: cat.corner[1], row: cat.corner[0] };
    }
  }
}

function catDecide(cat) {
  const opts = [];
  for (const k of DKEYS) {
    if (cat.dir && k === OPP[cat.dir]) continue;
    const d = DIRS[k];
    if (openAt(cat.col + d.x, cat.row + d.y)) opts.push(k);
  }
  if (!opts.length) {
    if (cat.dir) {
      const d = DIRS[OPP[cat.dir]];
      if (openAt(cat.col + d.x, cat.row + d.y)) return OPP[cat.dir];
    }
    return null;
  }
  if (opts.length === 1) return opts[0];

  const m = game.mouse;

  if (cat.mode === 'eyes') {
    let best = opts[0], bd = Infinity;
    for (const k of opts) {
      const d = DIRS[k];
      const r = cat.row + d.y, c = wrapCol(cat.col + d.x);
      const v = game.maze.denDist[r][c];
      const dd = v === -1 ? Infinity : v;
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }

  if (cat.frightened) {
    if (Math.random() < 0.3) return opts[(Math.random() * opts.length) | 0];
    let best = opts[0], bd = -1;
    for (const k of opts) {
      const d = DIRS[k];
      const v = distSq(cat.col + d.x, cat.row + d.y, m.col, m.row);
      if (v > bd) { bd = v; best = k; }
    }
    return best;
  }

  if (Math.random() > cat.smart) return opts[(Math.random() * opts.length) | 0];
  const t = catTarget(cat);
  let best = opts[0], bd = Infinity;
  for (const k of opts) {
    const d = DIRS[k];
    const v = distSq(cat.col + d.x, cat.row + d.y, t.col, t.row);
    if (v < bd) { bd = v; best = k; }
  }
  return best;
}

function catSpeedNow(cat) {
  if (cat.mode === 'eyes') return catSpeed(game.level) * 2.0;
  if (cat.frightened) return catSpeed(game.level) * 0.55;
  return catSpeed(game.level);
}

/* ---------- level / game setup ---------- */
function applyDims(maze) {
  COLS = maze.cols; ROWS = maze.rows;
  W = COLS * T; H = ROWS * T;
  MID = (ROWS - 1) / 2; CX = (COLS - 1) / 2;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fitCanvas();
}

function startLevel(level) {
  game.maze = generateLevel(level);
  applyDims(game.maze);
  composeMusic(level);
  musicStep = 0;
  game.wallHue = (200 + level * 47 + game.runSeed % 97) % 360;
  let n = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (game.maze.pellets[r][c] > 0) n++;
  game.pelletsLeft = n;
  game.frightTimer = 0;
  game.chain = 0;
  game.modeTimer = scatterDur(level);
  game.modePhase = 'scatter';
  resetPositions();
  prerenderMaze();
}

function resetPositions() {
  const s = game.maze.spawn;
  game.mouse = makeEntity(s.col, s.row, MOUSE_SPEED);
  game.desired = null;
  game.cats = [];
  for (let i = 0; i < catCount(game.level); i++) game.cats.push(makeCat(i, game.level));
  game.frightTimer = 0;
  game.chain = 0;
}

function newGame() {
  game.runSeed = (Math.random() * 0x7fffffff) | 0; // fresh maze designs every run
  game.level = 1;
  game.score = 0;
  game.lives = 3;
  game.nextLifeAt = 10000;
  scoreSaved = false;
  ui.nameEntry.classList.add('hidden');
  ui.lbList.classList.add('hidden');
  startLevel(1);
  setState('ready');
  updateHud();
}

/* ---------- state machine ---------- */
function setState(s) {
  game.state = s;
  game.stateTimer = 0;
  if (s === 'menu' || s === 'gameover' || s === 'paused') {
    ui.overlay.classList.remove('hidden');
  } else {
    ui.overlay.classList.add('hidden');
  }
  if (s === 'gameover') {
    ui.ovTitle.textContent = 'Game Over';
    ui.ovMsg.innerHTML = `Score: <b>${game.score}</b> &nbsp;·&nbsp; Level ${game.level}` +
      (game.score >= game.high && game.score > 0 ? '<br>🏆 New high score!' : '');
    ui.ovBtn.textContent = 'Play Again';
    ui.nameEntry.classList.add('hidden');
    ui.lbList.classList.add('hidden');
    maybeOfferNameEntry(game.score);
  }
}

/* ============================================================
   Leaderboard — top 15, shared via the server when available,
   localStorage when not (offline / file://).
   ============================================================ */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function localLB() {
  try {
    const lb = JSON.parse(localStorage.getItem('cmc-lb') || '[]');
    return Array.isArray(lb) ? lb : [];
  } catch { return []; }
}
const LB_MAX = 7;
function saveLocalLB(lb) {
  localStorage.setItem('cmc-lb', JSON.stringify(lb));
  // The HUD "High" mirrors the top of the leaderboard (the true game record),
  // raised live by your current run if you're beating it.
  const top = lb.length ? Number(lb[0].score) || 0 : 0;
  localStorage.setItem('cmc-high', String(top));
  game.high = Math.max(top, game.score);
  updateHud();
}
function mergeLB(lb, entry) {
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  return lb.slice(0, LB_MAX);
}

async function fetchLeaderboard() {
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) {
      const lb = await r.json();
      if (Array.isArray(lb)) { saveLocalLB(lb); return lb; }
    }
  } catch { /* offline — fall back */ }
  return localLB();
}

async function submitScore(name, score, level) {
  try {
    const r = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score, level })
    });
    if (r.ok) {
      const lb = await r.json();
      if (Array.isArray(lb)) { saveLocalLB(lb); return lb; }
    }
  } catch { /* offline — fall back */ }
  const lb = mergeLB(localLB(), { name, score, level });
  saveLocalLB(lb);
  return lb;
}

function renderLeaderboard(lb) {
  const head =
    '<li class="lb-head"><span class="lb-rank"></span>' +
    '<span class="lb-name">Name</span>' +
    '<span class="lb-level">Level</span>' +
    '<span class="lb-score">Score</span></li>';
  ui.lbList.innerHTML = lb.length
    ? head + lb.map((e, i) =>
        `<li><span class="lb-rank">${i + 1}.</span>` +
        `<span class="lb-name">${escapeHtml(e.name)}</span>` +
        `<span class="lb-level">${Number(e.level) > 0 ? Number(e.level) : '–'}</span>` +
        `<span class="lb-score">${Number(e.score) || 0}</span></li>`).join('')
    : '<li class="lb-empty">No scores yet — be the first! 🧀</li>';
}

let scoreSaved = false;
async function maybeOfferNameEntry(score) {
  if (score <= 0 || scoreSaved) return;
  const lb = await fetchLeaderboard();
  if (game.state !== 'gameover') return; // player already moved on
  if (lb.length < LB_MAX || score > lb[lb.length - 1].score) {
    ui.nameInput.value = localStorage.getItem('cmc-name') || '';
    ui.nameEntry.classList.remove('hidden');
    setTimeout(() => { try { ui.nameInput.focus(); } catch {} }, 60);
  } else {
    renderLeaderboard(lb);
    ui.lbList.classList.remove('hidden');
  }
}

async function saveScore() {
  if (scoreSaved) return;
  scoreSaved = true;
  const name = (ui.nameInput.value || '').trim().slice(0, 12) || 'MOUSE';
  localStorage.setItem('cmc-name', name);
  ui.nameEntry.classList.add('hidden');
  const lb = await submitScore(name, game.score, game.level);
  renderLeaderboard(lb);
  ui.lbList.classList.remove('hidden');
}

/* ---------- scoring ---------- */
function addScore(n) {
  game.score += n;
  if (game.score >= game.nextLifeAt) {
    game.lives++;
    game.nextLifeAt += 10000;
    sfxExtraLife();
  }
  if (game.score > game.high) {
    game.high = game.score; // beating the record live; the board sync persists it
  }
  updateHud();
}

function updateHud() {
  ui.score.textContent = game.score;
  ui.high.textContent = game.high;
  ui.level.textContent = game.level;
  ui.lives.textContent = '🐭'.repeat(Math.max(0, Math.min(game.lives, 6)));
}

/* ---------- floating score popups ---------- */
const popups = [];
function popup(x, y, text) { popups.push({ x, y, text, t: 0 }); }

/* ============================================================
   Update loop
   ============================================================ */
function update(dt) {
  game.time += dt;
  game.stateTimer += dt;

  if (game.state === 'ready') {
    if (game.stateTimer >= 1.4) setState('playing');
    return;
  }
  if (game.state === 'dying') {
    if (game.stateTimer >= 1.5) {
      game.lives--;
      updateHud();
      if (game.lives <= 0) setState('gameover');
      else { resetPositions(); setState('ready'); }
    }
    return;
  }
  if (game.state === 'clear') {
    if (game.stateTimer >= 2.0) {
      game.level++;
      startLevel(game.level);
      setState('ready');
      updateHud();
    }
    return;
  }
  if (game.state !== 'playing') return;

  // --- global cat mode (scatter <-> chase) ---
  if (game.frightTimer > 0) {
    game.frightTimer -= dt;
    if (game.frightTimer <= 0) {
      game.frightTimer = 0;
      for (const c of game.cats) c.frightened = false;
    }
  } else {
    game.modeTimer -= dt;
    if (game.modeTimer <= 0) {
      game.modePhase = game.modePhase === 'scatter' ? 'chase' : 'scatter';
      game.modeTimer = game.modePhase === 'scatter' ? scatterDur(game.level) : 14 + game.level;
      for (const c of game.cats) if (c.mode !== 'eyes') reverseEntity(c);
    }
  }

  // --- mouse ---
  const m = game.mouse;
  if (game.desired && m.dir && game.desired === OPP[m.dir] && m.prog < 1) {
    reverseEntity(m); // instant about-face mid-corridor
  }
  updateEntity(m, dt,
    (e) => {
      if (game.desired) {
        const d = DIRS[game.desired];
        if (openAt(e.col + d.x, e.row + d.y)) return game.desired;
      }
      if (e.dir) {
        const d = DIRS[e.dir];
        if (openAt(e.col + d.x, e.row + d.y)) return e.dir;
      }
      return null;
    },
    (e) => {
      const p = game.maze.pellets[e.row][e.col];
      if (p > 0) {
        game.maze.pellets[e.row][e.col] = 0;
        game.pelletsLeft--;
        if (p === 1) { addScore(10); sfxChomp(); }
        else {
          addScore(50);
          sfxPower();
          game.frightTimer = frightDur(game.level);
          game.chain = 0;
          for (const c of game.cats) {
            if (c.mode !== 'eyes') { c.frightened = true; reverseEntity(c); }
          }
        }
        if (game.pelletsLeft <= 0) {
          sfxLevelClear();
          setState('clear');
        }
      }
    }
  );

  if (game.state !== 'playing') return; // level may have just cleared

  // --- cats ---
  for (const cat of game.cats) {
    if (cat.sleep > 0) { cat.sleep -= dt; continue; }
    // refresh flanker jitter occasionally
    cat.jitter.t -= dt;
    if (cat.jitter.t <= 0) {
      cat.jitter = { c: ((Math.random() * 7) | 0) - 3, r: ((Math.random() * 7) | 0) - 3, t: 2 };
    }
    cat.speed = catSpeedNow(cat);
    updateEntity(cat, dt, catDecide, (e) => {
      if (e.mode === 'eyes' && game.maze.denDist[e.row][e.col] === 0) {
        e.mode = 'normal';
        e.frightened = false;
        e.sleep = 0.5;
      }
    });
  }

  // --- collisions ---
  const mp = px(m);
  for (const cat of game.cats) {
    if (cat.mode === 'eyes') continue;
    const cp = px(cat);
    let dx = Math.abs(mp.x - cp.x);
    dx = Math.min(dx, W - dx);
    const dy = mp.y - cp.y;
    if (dx * dx + dy * dy < (T * 0.62) * (T * 0.62)) {
      if (cat.frightened) {
        cat.mode = 'eyes';
        cat.frightened = false;
        game.chain++;
        const pts = 100 * Math.pow(2, game.chain); // 200, 400, 800, 1600...
        addScore(pts);
        popup(cp.x, cp.y, String(pts));
        sfxEatCat();
      } else {
        sfxDeath();
        setState('dying');
        return;
      }
    }
  }

  // --- popups ---
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt;
    if (popups[i].t > 1) popups.splice(i, 1);
  }
}

/* ============================================================
   Rendering
   ============================================================ */
function prerenderMaze() {
  const layer = document.createElement('canvas');
  layer.width = W * DPR;
  layer.height = H * DPR;
  const c = layer.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  const hue = game.wallHue;
  c.fillStyle = '#12121c';
  c.fillRect(0, 0, W, H);
  for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
    if (game.maze.grid[r][col] !== 1) continue;
    const x = col * T, y = r * T;
    c.fillStyle = `hsl(${hue}, 48%, 30%)`;
    roundRect(c, x + 1.5, y + 1.5, T - 3, T - 3, 5);
    c.fill();
    c.fillStyle = `hsl(${hue}, 52%, 38%)`;
    roundRect(c, x + 3.5, y + 3.5, T - 7, T - 7, 4);
    c.fill();
  }
  game.mazeLayer = layer;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawCheese(x, y, size, wob) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ffd24a';
  ctx.strokeStyle = '#caa12e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-size, size * 0.7 + wob);
  ctx.lineTo(size, size * 0.7 + wob);
  ctx.lineTo(size * 0.2, -size * 0.8 + wob);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (size > 5) {
    ctx.fillStyle = '#e8b830';
    ctx.beginPath(); ctx.arc(-size * 0.25, size * 0.25 + wob, size * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.3, size * 0.1 + wob, size * 0.13, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function dirAngle(dir) {
  switch (dir) {
    case 'right': return 0;
    case 'down': return Math.PI / 2;
    case 'left': return Math.PI;
    case 'up': return -Math.PI / 2;
    default: return 0;
  }
}

function drawMouse(x, y, dir, chompPhase, scale) {
  ctx.save();
  ctx.translate(x, y);
  if (dir === 'left') ctx.scale(-1, 1); // mirror instead of rotating — stays upright
  else ctx.rotate(dirAngle(dir));
  ctx.scale(scale, scale);
  // tail
  ctx.strokeStyle = '#d99aa8';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.quadraticCurveTo(-14, 3, -16, -2);
  ctx.stroke();
  // ears
  ctx.fillStyle = '#a8aebf';
  ctx.beginPath(); ctx.arc(-3, -7, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-3, 7, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8b7c4';
  ctx.beginPath(); ctx.arc(-3, -7, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-3, 7, 2.2, 0, Math.PI * 2); ctx.fill();
  // body (with chomping mouth, Pac-Man style)
  const mouth = 0.22 + 0.28 * Math.abs(Math.sin(chompPhase));
  ctx.fillStyle = '#c3c9d9';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, 9, mouth, Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = '#22222e';
  ctx.beginPath(); ctx.arc(2.5, -4, 1.6, 0, Math.PI * 2); ctx.fill();
  // nose
  ctx.fillStyle = '#e88bc4';
  ctx.beginPath(); ctx.arc(8.6 * Math.cos(mouth), -8.6 * Math.sin(mouth) * 0.4 - 2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCat(cat) {
  const { x, y } = px(cat);
  ctx.save();
  ctx.translate(x, y);

  if (cat.mode === 'eyes') {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3.5, -1, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -1, 3.2, 0, Math.PI * 2); ctx.fill();
    const d = cat.dir ? DIRS[cat.dir] : { x: 0, y: 0 };
    ctx.fillStyle = '#2b6cb0';
    ctx.beginPath(); ctx.arc(-3.5 + d.x * 1.5, -1 + d.y * 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5 + d.x * 1.5, -1 + d.y * 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  const flashing = game.frightTimer > 0 && game.frightTimer < 2 &&
                   Math.floor(game.time * 8) % 2 === 0;
  const body = cat.frightened ? (flashing ? '#e8e8ff' : '#4453d6') : cat.color;

  // ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.lineTo(-7.5, -13); ctx.lineTo(-2, -8); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(9, -4); ctx.lineTo(7.5, -13); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = cat.frightened ? '#2a2a55' : 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.moveTo(-7.6, -5.4); ctx.lineTo(-7, -10.5); ctx.lineTo(-3.8, -7.4); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7.6, -5.4); ctx.lineTo(7, -10.5); ctx.lineTo(3.8, -7.4); ctx.closePath(); ctx.fill();

  // head
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.fill();

  if (cat.frightened) {
    // worried face
    ctx.fillStyle = flashing ? '#4453d6' : '#fff';
    ctx.beginPath(); ctx.arc(-3.5, -2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3.5, -2, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = flashing ? '#4453d6' : '#fff';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-4.5, 4.5);
    for (let i = 0; i <= 6; i++) ctx.lineTo(-4.5 + i * 1.5, 4.5 + (i % 2 ? 1.6 : 0));
    ctx.stroke();
  } else {
    // eyes track the mouse
    const mp = px(game.mouse);
    const ang = Math.atan2(mp.y - y, mp.x - x);
    const ex = Math.cos(ang) * 1.3, ey = Math.sin(ang) * 1.3;
    ctx.fillStyle = '#fffbe8';
    ctx.beginPath(); ctx.ellipse(-3.6, -2, 2.6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.6, -2, 2.6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1c28';
    ctx.beginPath(); ctx.ellipse(-3.6 + ex, -2 + ey, 1.1, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.6 + ex, -2 + ey, 1.1, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    // nose + whiskers
    ctx.fillStyle = '#e88';
    ctx.beginPath();
    ctx.moveTo(0, 1.5); ctx.lineTo(-1.6, 3.4); ctx.lineTo(1.6, 3.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.9;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 4, 3); ctx.lineTo(s * 11, 1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 4, 4.5); ctx.lineTo(s * 11, 5.5); ctx.stroke();
    }
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // maze (flash on level clear)
  if (game.state === 'clear' && Math.floor(game.stateTimer * 6) % 2 === 0) {
    ctx.globalAlpha = 0.35;
  }
  if (game.mazeLayer) ctx.drawImage(game.mazeLayer, 0, 0, W, H);
  ctx.globalAlpha = 1;

  // pellets
  const wob = Math.sin(game.time * 4) * 0.8;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = game.maze.pellets[r][c];
    if (!p) continue;
    const x = (c + 0.5) * T, y = (r + 0.5) * T;
    if (p === 1) drawCheese(x, y, 4, 0);
    else drawCheese(x, y, 7.5 + Math.sin(game.time * 5) * 1.2, wob);
  }

  // cats
  if (game.state !== 'dying' || game.stateTimer < 0.3) {
    for (const cat of game.cats) drawCat(cat);
  }

  // mouse
  const mp = px(game.mouse);
  if (game.state === 'dying') {
    const t = Math.min(game.stateTimer / 1.2, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.9;
    drawMouse(mp.x, mp.y, game.mouse.dir, 0, 1 - t * 0.8);
    ctx.restore();
  } else {
    const moving = game.mouse.prog < 1;
    drawMouse(mp.x, mp.y, game.mouse.dir, moving ? game.time * 10 : 0.3, 1);
  }

  // popups
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = 1 - p.t;
    ctx.fillStyle = '#7fd47f';
    ctx.fillText(p.text, p.x, p.y - 8 - p.t * 18);
  }
  ctx.globalAlpha = 1;

  // ready text
  if (game.state === 'ready') {
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd24a';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillText(`Level ${game.level} — Ready!`, W / 2, MID * T - 30);
    ctx.shadowBlur = 0;
  }
}

/* ============================================================
   Audio (tiny WebAudio synth)
   ============================================================ */
let ac = null;
let masterOut = null; // boosted master bus -> compressor -> speakers
let sfxMuted = localStorage.getItem('cmc-muted') === '1';
let musicMuted = localStorage.getItem('cmc-music-muted') === '1';

function ensureAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      ac = new AC();
      // Raw oscillator gains are kept low to mix cleanly, then boosted here.
      // The compressor stops the boost from clipping when notes overlap.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      masterOut = ac.createGain();
      masterOut.gain.value = 3.4;
      masterOut.connect(comp);
      comp.connect(ac.destination);
    }
  }
  if (ac && ac.state === 'suspended') ac.resume();
}

// low-level note scheduler (shared by sfx and music)
function note(freq, when, dur, type, vol) {
  if (!ac || freq <= 0) return;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(masterOut);
  o.start(when);
  o.stop(when + dur + 0.02);
}

function tone(f0, f1, dur, type = 'square', vol = 0.06, when = 0) {
  if (!ac || sfxMuted) return;
  const t0 = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(masterOut);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/* ---------- background music ----------
   A fresh tune is composed for every level: seeded by the level number,
   so each level has its own key, chord progression, and melody — and the
   tempo climbs as the levels do. */
let MELODY = [], BASS = [];
function midiF(n) { return 440 * Math.pow(2, (n - 69) / 12); }

function composeMusic(level) {
  const rng = mulberry32(level * 9176 + 271);
  const root = 55 + ((level * 7) % 12);            // key walks the circle of fifths
  const minor = rng() < 0.5;
  const scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const progressions = [
    [0, 5, 3, 4], [0, 3, 4, 0], [0, 5, 1, 4],
    [0, 2, 5, 4], [0, 4, 1, 4], [0, 3, 1, 4]
  ];
  const prog = progressions[(rng() * progressions.length) | 0];
  MELODY = []; BASS = [];
  for (const deg of prog) {
    const chord = [0, 2, 4].map(o => {
      const d = deg + o;
      return scale[d % 7] + 12 * Math.floor(d / 7);
    });
    for (let s = 0; s < 8; s++) { // one bar = eight 8th-note steps
      if (s === 0) {
        MELODY.push(root + 12 + chord[0]); // ground each bar on the chord root
      } else if (rng() < 0.78) {
        let n = chord[(rng() * chord.length) | 0];
        if (rng() < 0.25) n += 12;
        let midi = root + 12 + n;
        while (midi > 95) midi -= 12; // keep the melody out of shrill territory
        MELODY.push(midi);
      } else {
        MELODY.push(0); // rest
      }
      if (s % 2 === 0) {
        const fifth = s % 4 === 2;
        BASS.push(root - 12 + scale[deg % 7] + (fifth ? 7 : 0));
      } else {
        BASS.push(0);
      }
    }
  }
}

let musicStep = 0, musicNext = 0;
setInterval(() => {
  if (!ac) return;
  const active = !musicMuted && (game.state === 'ready' || game.state === 'playing' || game.state === 'clear');
  if (!active) { musicNext = ac.currentTime + 0.1; return; }
  if (musicNext < ac.currentTime) musicNext = ac.currentTime + 0.05;
  const horizon = ac.currentTime + 0.25;
  while (musicNext < horizon) {
    const bpm = Math.min(112 + 4 * game.level, 168);
    const dur = 30 / bpm; // 8th note
    const i = musicStep % MELODY.length;
    if (MELODY[i] > 0) note(midiF(MELODY[i]), musicNext, dur * 0.85, 'triangle', 0.032);
    if (BASS[i] > 0) note(midiF(BASS[i]), musicNext, dur * 0.9, 'square', 0.02);
    musicNext += dur;
    musicStep++;
  }
}, 60);

let chompAlt = false;
function sfxChomp()    { chompAlt = !chompAlt; tone(chompAlt ? 740 : 620, chompAlt ? 620 : 740, 0.05, 'square', 0.035); }
function sfxPower()    { tone(180, 720, 0.3, 'sawtooth', 0.07); }
function sfxEatCat()   { tone(300, 1000, 0.22, 'square', 0.08); }
function sfxDeath()    { tone(520, 60, 0.7, 'sawtooth', 0.09); }
function sfxExtraLife(){ tone(660, 1320, 0.4, 'triangle', 0.08); }
function sfxLevelClear(){
  [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.08, i * 0.13));
}

function refreshAudioButtons() {
  ui.mute.textContent = sfxMuted ? '🔇' : '🔊';
  ui.mute.classList.toggle('off', sfxMuted);
  ui.music.textContent = '🎶';
  ui.music.classList.toggle('off', musicMuted);
}
refreshAudioButtons();
ui.mute.addEventListener('click', () => {
  sfxMuted = !sfxMuted;
  localStorage.setItem('cmc-muted', sfxMuted ? '1' : '0');
  ensureAudio();
  refreshAudioButtons();
});
ui.music.addEventListener('click', () => {
  musicMuted = !musicMuted;
  localStorage.setItem('cmc-music-muted', musicMuted ? '1' : '0');
  ensureAudio();
  refreshAudioButtons();
});

/* ============================================================
   Input — keyboard + virtual joystick
   ============================================================ */
window.addEventListener('keydown', (e) => {
  const map = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };
  if (map[e.key]) {
    e.preventDefault();
    game.desired = map[e.key];
    ensureAudio();
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (game.state === 'menu' || game.state === 'gameover') {
      e.preventDefault();
      ensureAudio();
      newGame();
    }
  }
});

ui.ovBtn.addEventListener('click', () => {
  ensureAudio();
  if (game.state === 'paused') {
    ui.lbList.classList.add('hidden');
    setState('playing');
  } else {
    newGame();
  }
});

/* leaderboard buttons */
ui.lbBtn.addEventListener('click', async () => {
  ensureAudio();
  if (ui.lbList.classList.contains('hidden')) {
    renderLeaderboard(await fetchLeaderboard());
    ui.lbList.classList.remove('hidden');
  } else {
    ui.lbList.classList.add('hidden');
  }
});

ui.lbOpen.addEventListener('click', async () => {
  ensureAudio();
  if (game.state === 'playing' || game.state === 'ready') {
    setState('paused');
    ui.ovTitle.textContent = 'Leaderboard';
    ui.ovMsg.textContent = 'Top 7 mice of all time';
    ui.ovBtn.textContent = 'Resume';
    ui.nameEntry.classList.add('hidden');
    renderLeaderboard(await fetchLeaderboard());
    ui.lbList.classList.remove('hidden');
  } else if (game.state === 'menu' || game.state === 'gameover') {
    ui.lbBtn.click();
  }
});

/* name entry */
ui.nameSave.addEventListener('click', saveScore);
ui.nameInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // typing must not steer the mouse or restart the game
  if (e.key === 'Enter') saveScore();
});

/* virtual joystick: appears wherever the finger lands, slide to steer */
let joyTouchId = null;
let joyOrigin = null;
const JOY_DEAD = 14;   // px before a direction registers
const JOY_MAX = 42;    // stick visual travel

function joyShow(x, y) {
  ui.joystick.classList.remove('hidden');
  ui.joystick.style.left = x + 'px';
  ui.joystick.style.top = y + 'px';
  ui.stick.style.transform = 'translate(-50%, -50%)';
}
function joyHide() {
  ui.joystick.classList.add('hidden');
}

ui.area.addEventListener('touchstart', (e) => {
  if (e.target.closest('#overlay')) return; // let overlay buttons work
  e.preventDefault();
  ensureAudio();
  if (joyTouchId !== null) return;
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  joyOrigin = { x: t.clientX, y: t.clientY };
  joyShow(t.clientX, t.clientY);
}, { passive: false });

ui.area.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (joyTouchId === null) return;
  for (const t of e.changedTouches) {
    if (t.identifier !== joyTouchId) continue;
    let dx = t.clientX - joyOrigin.x;
    let dy = t.clientY - joyOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_DEAD) {
      game.desired = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down' : 'up');
    }
    if (len > JOY_MAX) { dx = dx / len * JOY_MAX; dy = dy / len * JOY_MAX; }
    ui.stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}, { passive: false });

function joyEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTouchId) {
      joyTouchId = null;
      joyHide();
    }
  }
}
ui.area.addEventListener('touchend', joyEnd);
ui.area.addEventListener('touchcancel', joyEnd);

/* ---------- responsive canvas ---------- */
function fitCanvas() {
  const hudH = document.getElementById('top-bar').offsetHeight;
  const availW = window.innerWidth - 12;
  const availH = window.innerHeight - hudH - 14;
  const scale = Math.min(availW / W, availH / H);
  canvas.style.width = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);

/* ---------- boot ---------- */
ui.ovHint.textContent = isTouch
  ? 'Touch and slide anywhere to steer with the joystick'
  : 'Arrow keys or WASD to move · Enter to start';

startLevel(1);                  // so the menu has a maze behind it
updateHud();
fetchLeaderboard();             // sync the HUD "High" with the shared board

// debug/testing handle
window.CMC = {
  game, generateLevel, setState, fetchLeaderboard, renderLeaderboard,
  composeMusic, getMusic: () => ({ melody: MELODY.slice(), bass: BASS.slice() })
};

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
