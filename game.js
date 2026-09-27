"use strict";

/* =====================================================================
   Rocket88 Skydive
   ---------------------------------------------------------------------
   A small skydiving game that runs entirely in the browser: no server,
   no build step. Open index.html and it works.

   The file is organized top to bottom:
     1. Settings & data   – numbers and lists you can tweak
     2. Helpers           – tiny math/utility functions
     3. Input             – keyboard, mouse and touch buttons
     4. Game state        – one object that holds the whole game
     5. Update            – moves everything forward a tiny bit each frame
     6. Draw              – paints the current state onto the <canvas>
     7. Menus             – the HTML screens before and after a jump
     8. Start-up          – kicks everything off

   Every frame (about 60 times per second) the game calls update() and
   then draw(). That loop is the heartbeat of almost every video game.
   ===================================================================== */

// =====================================================================
// 1. SETTINGS & DATA
// =====================================================================

// Real skydives are slow: about a minute of freefall and several minutes
// under the parachute. "Arcade" speeds time up so jumps stay snappy;
// "Real time" runs at true speed.
const SPEEDUPS = {
  arcade: { freefall: 3, canopy: 7 },
  real: { freefall: 1, canopy: 1 },
};

// Distances are in feet, speeds in feet per second of *game* time.
function makePhysics(speed) {
  const s = SPEEDUPS[speed];
  return {
    freefallSpeedup: s.freefall,
    canopySpeedup: s.canopy,
    terminal: 176 * s.freefall,     // ~120 mph belly-to-earth
    track: 70 * s.freefall,         // sideways speed when tracking
    canopyForward: 25 * s.canopy,   // how fast the canopy flies forward
    canopySink: 16 * s.canopy,      // how fast you come down under canopy
    accelTau: 3.6 / s.freefall,     // it takes ~10 real seconds to reach full speed
    perfectFlareTime: speed === 'real' ? 4 : 2.5, // flare for less than this before touchdown
    flareCueAlt: speed === 'real' ? 40 : 150,     // when the FLARE! reminder shows
  };
}
let phys = makePhysics('arcade');

const EXIT_THROW = 0.6;          // share of the plane's speed you keep on exit

const PULL_ALTITUDE = 3000;      // open your parachute around here
const LOW_PULL_ALTITUDE = 2000;  // below this is a "low pull" (penalty)
const AAD_ALTITUDE = 1000;       // safety device opens the reserve for you
const OPEN_TIME = 1.2;           // seconds for the canopy to inflate
const TRICK_TIME = 0.9;          // seconds each trick takes
const COMBO_WINDOW = 0.8;        // start the next trick within this to chain a combo
const SPOT_ZONE = 800;           // how close to the ideal exit point counts as "green light"
const FT_PER_SEC_TO_MPH = 0.6818;

// Flying up yourself. A real climb to altitude takes 15+ minutes, so climbs
// are always sped up, even in Real time mode.
const CLIMB_BOOST = 4;
const MIN_EXIT_ALTITUDE = 3500;  // lowest altitude you're allowed to jump from
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Wind is in real-world feet per second. Its direction is random each jump.
// `water` lists stretches of ground (in feet from the target) that are water.
const LOCATIONS = [
  {
    id: 'beach', name: 'Sunny Beach',
    blurb: 'Light breeze and soft sand. Perfect first jump. Stay out of the ocean!',
    wind: 6, gust: 0.1,
    skyTop: '#2f80d4', skyBottom: '#c4ecff', far: '#6cbfdf', hills: 0.5,
    ground: '#e8d39b', groundTop: '#f6e7bd', pad: null,
    decor: 'palm', decorHeight: [25, 45],
    water: [[-100000, -1400]], runway: [300, 3300], seed: 11,
  },
  {
    id: 'farm', name: 'Farm Dropzone',
    blurb: 'A classic grassy landing area surrounded by trees.',
    wind: 10, gust: 0.2,
    skyTop: '#3d85c6', skyBottom: '#dcefff', far: '#7fae6a', hills: 1,
    ground: '#6aa84f', groundTop: '#8cc56f', pad: '#86c96a',
    decor: 'tree', decorHeight: [30, 60],
    water: [], runway: [-3600, -600], seed: 23,
  },
  {
    id: 'desert', name: 'Desert Canyon',
    blurb: 'Strong, gusty wind. Pick your exit point carefully!',
    wind: 18, gust: 0.35,
    skyTop: '#d8743a', skyBottom: '#ffe0a8', far: '#b5663c', hills: 1.6,
    ground: '#d9a86c', groundTop: '#e9c08a', pad: null,
    decor: 'cactus', decorHeight: [10, 28],
    water: [], runway: [-3600, -600], seed: 37,
  },
  {
    id: 'mountain', name: 'Mountain Lake',
    blurb: 'Big peaks, and a cold lake right next to the landing area.',
    wind: 12, gust: 0.25,
    skyTop: '#3a6fa8', skyBottom: '#d3e6f7', far: '#7d8fa8', hills: 3,
    ground: '#5b8c47', groundTop: '#79aa62', pad: null,
    decor: 'pine', decorHeight: [40, 90],
    water: [[700, 2600]], runway: [-4200, -1200], seed: 41,
  },
  {
    id: 'city', name: 'City at Night',
    blurb: 'Land in the little park between the skyscrapers.',
    wind: 8, gust: 0.3, night: true,
    skyTop: '#070b24', skyBottom: '#27305f', far: '#161b3a', hills: 1, skyline: true,
    ground: '#2e3139', groundTop: '#454a55', pad: '#3e6b3b',
    decor: 'building', decorHeight: [80, 320],
    water: [], runway: [-3600, -600], seed: 53,
  },
];

const AIRCRAFT = [
  {
    id: 'cessna', name: 'Cessna 182', blurb: 'Small and cozy. Exit at 10,000 ft.',
    kind: 'plane', style: 'cessna', altitude: 10000, speed: 240, size: 0.8,
    color: '#f5f5f5', stripe: '#d23b3b',
  },
  {
    id: 'otter', name: 'Twin Otter', blurb: 'The classic jump plane. Exit at 13,500 ft.',
    kind: 'plane', style: 'otter', altitude: 13500, speed: 300, size: 1.1,
    color: '#f2f2f2', stripe: '#2b6cd6',
  },
  {
    id: 'skyvan', name: 'Skyvan', blurb: 'A flying box with a huge rear door. Exit at 15,000 ft.',
    kind: 'plane', style: 'skyvan', altitude: 15000, speed: 270, size: 1.2,
    color: '#dfe3e8', stripe: '#f0a020',
  },
  {
    id: 'balloon', name: 'Hot-air Balloon', blurb: 'Silent and slow. Drifts with the wind. Exit at 7,000 ft.',
    kind: 'balloon', altitude: 7000, speed: 0, size: 1,
    color: '#e74c3c', stripe: '#f9d648',
  },
];

const MODES = [
  { id: 'target', name: 'Target landing', blurb: 'Score points for tricks and for landing on the bullseye.' },
  { id: 'free', name: 'Free jump', blurb: 'No target. Just fly, flip, and land wherever you like.' },
];

const CLIMBS = [
  { id: 'ride', name: 'Ride up', blurb: 'Start at jump altitude with the door open, ready to go.' },
  { id: 'fly', name: 'Fly it up yourself', blurb: 'Take off from the runway and climb to altitude. You\'re the pilot!' },
];

const SPEEDS = [
  { id: 'arcade', name: 'Arcade', blurb: 'Time is sped up so jumps stay snappy (about 20 s of freefall).' },
  { id: 'real', name: 'Real time', blurb: 'As long as a real skydive: about a minute of freefall, then a few minutes under canopy.' },
];

// dir: which way the jumper rotates. Flips turn head-over-heels, spins turn flat.
const TRICKS = {
  backflip: { name: 'Backflip', points: 100, kind: 'flip', dir: -1 },
  frontflip: { name: 'Front flip', points: 100, kind: 'flip', dir: 1 },
  spinLeft: { name: 'Left 360', points: 75, kind: 'spin', dir: -1 },
  spinRight: { name: 'Right 360', points: 75, kind: 'spin', dir: 1 },
};

// Landing target rings, smallest first. Radius is in feet.
const RINGS = [
  { name: 'Dead center!', radius: 10, points: 1000, color: '#ffd166' },
  { name: 'Inner ring', radius: 30, points: 600, color: '#e63946' },
  { name: 'Middle ring', radius: 75, points: 300, color: '#ffffff' },
  { name: 'Outer ring', radius: 150, points: 100, color: '#e63946' },
];

const CANOPY_COLORS = [
  ['#e63946', '#f1faee'],
  ['#ffb703', '#023047'],
  ['#8338ec', '#3a86ff'],
  ['#06d6a0', '#118ab2'],
  ['#ff006e', '#fb5607'],
];

const SUIT = '#ff7a1a';
const SUIT_DARK = '#c95a0c';
const RIG = '#2b3a8c';
const HELMET = '#1d1d1f';
const VISOR = '#6fd3ff';

// =====================================================================
// 2. HELPERS
// =====================================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => Math.round(n).toLocaleString('en-US');

// Move `v` toward `target` by at most `step`.
function approach(v, target, step) {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

// For smooth motion: returns how much of the remaining gap to close this
// frame. `tau` is roughly how many seconds it takes to get most of the way.
function ease(dt, tau) {
  return 1 - Math.exp(-dt / tau);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// A random number generator that gives the same sequence for the same seed,
// so each location always has the same trees and buildings.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turns any number into a stable "random" value between 0 and 1.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

function inWater(loc, x) {
  return loc.water.some(([from, to]) => x >= from && x <= to);
}

// Saving is optional: private windows can block storage, so never let it crash the game.
const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable. That's fine, we just won't remember it.
    }
  },
};

// ---------- Canvas setup ----------

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;

function resize() {
  // Draw at the screen's real pixel density so things look sharp.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Set the font, shrinking it if the text would be wider than maxWidth.
function fitFont(text, weight, size, maxWidth) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) {
    ctx.font = `${weight} ${Math.max(10, (size * maxWidth) / width)}px ${FONT}`;
  }
}

// =====================================================================
// 3. INPUT
// =====================================================================
// Keys are turned into "actions" so the rest of the game doesn't care
// whether you pressed an arrow key, WASD, or a touch button.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyQ: 'spinL', KeyZ: 'spinL',
  KeyE: 'spinR', KeyX: 'spinR',
  Space: 'action', Enter: 'action',
  Escape: 'menu',
};

const held = {};             // actions being held down right now
const pressed = new Set();   // actions that started this frame
let touchMode = window.matchMedia('(pointer: coarse)').matches;

const isPlaying = () => ['plane', 'pilot', 'freefall', 'canopy'].includes(game.phase);

window.addEventListener('keydown', e => {
  const action = KEYMAP[e.code];
  if (!action) return;
  if (action === 'menu') {
    if (game.phase !== 'menu') showMenu();
    return;
  }
  if (!isPlaying()) return;
  e.preventDefault(); // stop the page from scrolling on Space/arrows
  if (!e.repeat) pressed.add(action);
  held[action] = true;
});

window.addEventListener('keyup', e => {
  const action = KEYMAP[e.code];
  if (action) held[action] = false;
});

window.addEventListener('blur', () => {
  for (const k in held) held[k] = false;
});

// Clicking the game with a mouse works like Space. On touch screens we only
// allow tapping to jump, so a stray tap doesn't open your parachute.
canvas.addEventListener('pointerdown', e => {
  if (!isPlaying()) return;
  if (e.pointerType === 'mouse' || game.phase === 'plane') pressed.add('action');
});

document.querySelectorAll('#touch [data-action]').forEach(btn => {
  const action = btn.dataset.action;
  const down = e => {
    e.preventDefault();
    if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
    held[action] = true;
    pressed.add(action);
    btn.classList.add('down');
  };
  const up = () => {
    held[action] = false;
    btn.classList.remove('down');
  };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

window.addEventListener('touchstart', () => {
  if (!touchMode) {
    touchMode = true;
    updateTouchVisibility();
  }
}, { passive: true });

// =====================================================================
// 4. GAME STATE
// =====================================================================

const game = {
  phase: 'menu', // 'menu' | 'plane' | 'pilot' | 'freefall' | 'canopy' | 'landed'
  location: LOCATIONS[0],
  aircraft: AIRCRAFT[1],
  mode: 'target',
  climb: 'ride',   // 'ride' starts at altitude, 'fly' means you pilot it up
  speed: 'arcade', // 'arcade' or 'real'
  time: 0,
  wind: 0,        // real ft/s; positive blows to the right
  targetX: 0,
  idealExit: 0,
  plane: { x: 0, alt: 0, vx: 0 },
  jumper: null,
  score: null,
  popups: [],
  scenery: { decor: [], clouds: [] },
  cam: { x: 0, alt: 9000, scale: 0.3, frac: 0.4 },
  canopyColors: CANOPY_COLORS[0],
  landedTime: 0,
  resultsShown: false,
  result: null,
};

const stars = Array.from({ length: 120 }, () => ({
  x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.3 + 0.3,
}));
const streaks = Array.from({ length: 28 }, () => ({
  x: Math.random(), y: Math.random(), len: 20 + Math.random() * 50,
}));

function newJumper() {
  return {
    x: 0, alt: 0,
    vx: 0, vy: 0,        // vy is downward speed
    angle: 0,            // flip rotation
    spin: 0,             // spin rotation
    faceDir: 1,
    tracking: 0,         // -1..1, how hard you're tracking sideways
    trick: null, trickT: 0,
    heading: 1,          // canopy: -1 flying left ... 1 flying right
    facing: 1,           // canopy: the direction you're steering toward
    turnRate: 0,
    brake: 0, brakeHeld: 0,
    twists: 0,
    openT: 0,
    landStyle: null,
  };
}

function makeScenery(loc) {
  const rand = mulberry32(loc.seed);
  const decor = [];
  for (let x = -20000; x < 20000; x += 80 + rand() * 260) {
    const h = lerp(loc.decorHeight[0], loc.decorHeight[1], rand());
    const w = loc.decor === 'building' ? 60 + rand() * 100 : h;
    const seed = rand();
    // Keep the landing area, the runway and the water clear.
    const onRunway = x > loc.runway[0] - 150 && x < loc.runway[1] + 150;
    if (Math.abs(x) < 300 || onRunway || inWater(loc, x)) continue;
    decor.push({ x, h, w, seed });
  }
  const clouds = [];
  for (let i = 0; i < 140; i++) {
    clouds.push({
      x: -16000 + Math.random() * 32000,
      alt: 2500 + Math.random() * 12500,
      w: 300 + Math.random() * 900,
      puffs: 3 + Math.floor(Math.random() * 3),
      front: Math.random() < 0.3,
    });
  }
  return { decor, clouds };
}

// The wind isn't perfectly steady: gusts make it rise and fall.
function windNow() {
  const t = game.time;
  const wobble = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4;
  return game.wind * (1 + game.location.gust * wobble);
}

// Where should you leave the plane? The wind will carry you while you fall,
// so the ideal exit point is upwind of the target. Real skydivers call
// this "spotting".
// `alt` is the exit altitude and `groundSpeed` the plane's speed (negative
// when it's flying left), since both change when you're the pilot.
function computeIdealExit(alt = game.aircraft.altitude, groundSpeed = game.aircraft.speed) {
  const freefallTime = Math.max(0, alt - PULL_ALTITUDE) / phys.terminal + phys.accelTau * 1.25;
  const canopyTime = PULL_ALTITUDE / phys.canopySink;
  const drift = game.wind * phys.freefallSpeedup * freefallTime + game.wind * phys.canopySpeedup * canopyTime;
  const exitThrow = groundSpeed * EXIT_THROW * 0.8;
  return game.targetX - drift - exitThrow;
}

// Everything the plane (or balloon) needs, whether it's on autopilot or you're flying it.
function makePlane(fields) {
  return {
    x: 0, alt: 0, vx: 0,
    speed: 0,        // airspeed
    pitch: 0,        // nose angle: positive is nose up
    dir: 1,          // 1 flying right, -1 flying left
    turnVis: 1,      // smoothly goes from 1 to -1 while turning around
    throttle: 0,
    onGround: false,
    stalled: false,
    leveled: false,  // reached jump altitude
    heat: 0,         // balloon burner heat
    climb: 0,        // balloon climb rate
    burning: false,
    ...fields,
  };
}

function resetPlane() {
  const ac = game.aircraft;
  if (ac.kind === 'balloon') {
    const dir = Math.sign(game.wind) || 1;
    game.plane = makePlane({ x: game.idealExit - 200 * dir, alt: ac.altitude, vx: game.wind * phys.freefallSpeedup });
  } else {
    game.plane = makePlane({ x: game.idealExit - 3500, alt: ac.altitude, vx: ac.speed, speed: ac.speed });
  }
}

// Fly-it-up mode: the plane waits at the start of the runway. The balloon
// launches from a field upwind, so the wind carries it toward the spot.
function resetPilot() {
  const ac = game.aircraft;
  const loc = game.location;
  if (ac.kind === 'balloon') {
    const dir = Math.sign(game.wind) || 1;
    let x = computeIdealExit(ac.altitude, 0) - dir * 900;
    // Don't launch from the water: move toward the landing area until it's dry land.
    while (inWater(loc, x)) x += x < 0 ? 100 : -100;
    if (Math.abs(x) < 400) x = -dir * 400;
    game.plane = makePlane({ x, onGround: true });
  } else {
    game.plane = makePlane({ x: loc.runway[0] + 150, onGround: true });
  }
}

function startJump() {
  const ac = game.aircraft;
  const flying = game.climb === 'fly';
  phys = makePhysics(game.speed);
  game.phase = flying ? 'pilot' : 'plane';
  game.time = 0;
  const dir = Math.random() < 0.5 ? -1 : 1;
  game.wind = dir * game.location.wind * (0.75 + Math.random() * 0.5);
  game.targetX = 0;
  game.idealExit = computeIdealExit();
  game.scenery = makeScenery(game.location);
  game.jumper = newJumper();
  game.score = {
    tricks: 0, trickCount: 0, combo: 0, bestCombo: 0,
    lastTrickEnd: -99, lastTrickId: null, items: [],
  };
  game.popups = [];
  game.canopyColors = CANOPY_COLORS[Math.floor(Math.random() * CANOPY_COLORS.length)];
  game.landedTime = 0;
  game.resultsShown = false;
  game.result = null;
  if (flying) resetPilot();
  else resetPlane();
  game.cam.x = game.plane.x;
  game.cam.alt = game.plane.alt;
  game.cam.scale = flying ? 1.4 : 0.35;

  pressed.clear();
  for (const k in held) held[k] = false;
  ui.menu.classList.add('hidden');
  ui.results.classList.add('hidden');
  updateTouchVisibility();
  let hello = ac.kind === 'balloon' ? 'Floating at 7,000 ft. Jump whenever you like' : 'Wait for the green light, then JUMP';
  if (flying) {
    hello = ac.kind === 'balloon'
      ? `Hold ${touchMode ? '▲' : '↑'} to fire the burner and lift off`
      : `${touchMode ? 'Tap GO' : 'Press Space'} for full power, then hold ${touchMode ? '▲' : '↑'} to take off`;
  }
  popup(hello, '#fff');
}

function popup(text, color) {
  game.popups.push({ text, color, age: 0 });
  if (game.popups.length > 4) game.popups.shift();
}

// =====================================================================
// 5. UPDATE
// =====================================================================

function update(dt) {
  game.time += dt;

  if (game.phase === 'plane') updatePlane(dt);
  else if (game.phase === 'pilot') updatePilot(dt);
  else if (game.phase === 'freefall') updateFreefall(dt);
  else if (game.phase === 'canopy') updateCanopy(dt);
  else if (game.phase === 'landed') updateLanded(dt);

  // The plane keeps flying after you leave it.
  if (!['menu', 'plane', 'pilot'].includes(game.phase)) game.plane.x += game.plane.vx * dt;

  for (const p of game.popups) p.age += dt;
  game.popups = game.popups.filter(p => p.age < 2.2);

  updateCamera(dt);
  updateStreaks(dt);
  syncTouchLabels();
}

function updatePlane(dt) {
  const p = game.plane;
  p.x += p.vx * dt;

  if (pressed.has('action')) {
    exitPlane();
    return;
  }

  // Missed the spot? The pilot circles around for another pass.
  const limit = game.aircraft.kind === 'balloon' ? 1500 : 4000;
  if ((p.x - game.idealExit) * Math.sign(p.vx || 1) > limit) {
    resetPlane();
    popup('Go-around! The pilot circles back', '#ffd166');
  }
}

// ---------- Flying it up yourself ----------

function updatePilot(dt) {
  if (game.aircraft.kind === 'balloon') updateBalloonPilot(dt);
  else updatePlanePilot(dt);

  const p = game.plane;
  // The best exit point moves as you climb and turn, so keep recalculating it.
  game.idealExit = computeIdealExit(Math.max(p.alt, MIN_EXIT_ALTITUDE), p.vx);

  if (p.alt >= game.aircraft.altitude - 1 && !p.leveled) {
    p.leveled = true;
    popup('Jump altitude! Head for the green light', '#7ee2a8');
  }
}

function tryPilotJump() {
  if (game.plane.alt >= MIN_EXIT_ALTITUDE) exitPlane();
  else popup(`Too low to jump! Climb above ${fmt(MIN_EXIT_ALTITUDE)} ft`, '#ffb347');
}

function updatePlanePilot(dt) {
  const p = game.plane;
  const ac = game.aircraft;
  const wasFlying = !p.onGround;
  const rotateSpeed = ac.speed * 0.45; // fast enough to lift off
  const stallSpeed = ac.speed * 0.4;   // slower than this and the wings stop flying

  if (pressed.has('action')) {
    if (p.onGround && p.throttle === 0) {
      p.throttle = 1;
      popup(`Full power! Hold ${touchMode ? '▲' : '↑'} to lift off at takeoff speed`, '#fff');
    } else if (!p.onGround) {
      tryPilotJump();
      if (game.phase !== 'pilot') return;
    }
  }

  // Nose up / nose down
  const pitchInput = (held.up ? 1 : 0) - (held.down ? 1 : 0);
  if (p.onGround) {
    // On the runway you can only lift the nose once you're fast enough.
    p.pitch = p.speed >= rotateSpeed ? clamp(p.pitch + pitchInput * 0.6 * dt, 0, 0.25) : 0;
    p.speed = Math.min(p.speed + 45 * p.throttle * dt, ac.speed * 0.9);
  } else {
    if (p.stalled) {
      // In a stall the nose drops by itself until you have speed again.
      p.pitch = approach(p.pitch, -0.35, dt * 1.2);
      if (p.speed > stallSpeed * 1.3) {
        p.stalled = false;
        popup('Recovered! Nice flying', '#8ef');
      }
    } else {
      p.pitch = clamp(p.pitch + pitchInput * 0.6 * dt, -0.4, 0.75);
    }
    // Climbing steeply bleeds off speed; diving builds it up.
    p.speed += ((ac.speed * p.throttle - p.speed) * 0.35 - 120 * Math.sin(p.pitch)) * dt;
    p.speed = clamp(p.speed, 0, ac.speed * 1.4);
    if (!p.stalled && p.speed < stallSpeed) {
      p.stalled = true; // the big STALL! warning in the HUD tells the player
    }
  }

  // Turning around (only in the air)
  const turnInput = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (!p.onGround && turnInput !== 0 && turnInput !== p.dir) p.dir = turnInput;
  p.turnVis = approach(p.turnVis, p.dir, dt * 1.3);

  p.vx = p.speed * Math.cos(p.pitch) * p.turnVis;
  let climb = p.onGround ? 0 : p.speed * Math.sin(p.pitch) * CLIMB_BOOST;
  if (p.alt >= ac.altitude && climb > 0) {
    // At jump altitude the autopilot holds you level.
    climb = 0;
    p.pitch = approach(p.pitch, 0, dt * 0.8);
  }
  p.x += p.vx * dt;
  p.alt = Math.min(ac.altitude, p.alt + climb * dt);

  if (p.onGround && p.pitch > 0.05) {
    p.onGround = false;
    popup('Liftoff! Climb to altitude', '#7ee2a8');
  }
  if (wasFlying && p.alt <= 0) {
    if (-climb > 90 || p.pitch < -0.15) {
      popup('Hard landing! The plane bounced back to the runway', '#ff6b6b');
      resetPilot();
      return;
    }
    p.alt = 0;
    p.pitch = 0;
    p.onGround = true;
  }
  const [, runwayEnd] = game.location.runway;
  if (p.onGround && p.throttle > 0 && p.x > runwayEnd) {
    popup('Ran off the end of the runway! Lift off sooner', '#ff6b6b');
    resetPilot();
  }
}

function updateBalloonPilot(dt) {
  const p = game.plane;
  const ac = game.aircraft;
  if (pressed.has('action')) {
    tryPilotJump();
    if (game.phase !== 'pilot') return;
  }
  // Fire the burner to heat the air: hot air rises, cooling air sinks.
  p.burning = !!held.up;
  p.heat = clamp(p.heat + (p.burning ? 0.45 : -0.07) * dt, 0, 1);
  p.climb += ((p.heat - 0.35) * 420 - p.climb) * ease(dt, 1.5);
  p.alt += p.climb * dt;
  if (p.alt <= 0) {
    p.alt = 0;
    p.climb = Math.max(0, p.climb);
  }
  if (p.alt >= ac.altitude) {
    p.alt = ac.altitude;
    p.climb = Math.min(0, p.climb);
  }
  p.onGround = p.alt <= 0;
  p.vx = p.onGround ? 0 : windNow() * CLIMB_BOOST;
  p.x += p.vx * dt;
}

function exitPlane() {
  const p = game.plane;
  const j = game.jumper;
  j.x = p.x;
  j.alt = p.alt - 15;
  j.vx = p.vx * EXIT_THROW;
  j.vy = 0;
  j.faceDir = Math.sign(p.vx) || 1;
  p.pitch = 0;
  p.burning = false;
  game.phase = 'freefall';
  const goodSpot = Math.abs(p.x - game.idealExit) < SPOT_ZONE;
  popup(goodSpot ? 'Great spot! Arch!' : 'Exit! Arch!', '#fff');
}

function updateFreefall(dt) {
  const j = game.jumper;
  const wind = windNow() * phys.freefallSpeedup;

  // Gravity speeds you up until air resistance balances it (terminal velocity).
  j.vy += (phys.terminal - j.vy) * ease(dt, phys.accelTau);

  // Tracking: flying your body sideways across the sky.
  let input = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (j.trick) input = 0;
  j.tracking = approach(j.tracking, input, dt * 4);
  if (Math.abs(j.tracking) > 0.3 && !j.trick) j.faceDir = Math.sign(j.tracking);
  const targetVx = wind + j.tracking * phys.track;
  j.vx += (targetVx - j.vx) * ease(dt, 0.8);

  j.x += j.vx * dt;
  j.alt -= j.vy * dt;

  // Tricks
  if (!j.trick) {
    if (pressed.has('up')) startTrick('backflip');
    else if (pressed.has('down')) startTrick('frontflip');
    else if (pressed.has('spinL')) startTrick('spinLeft');
    else if (pressed.has('spinR')) startTrick('spinRight');
  }
  if (j.trick) {
    const trick = TRICKS[j.trick];
    j.trickT += dt;
    const t = Math.min(1, j.trickT / TRICK_TIME);
    const turn = trick.dir * easeInOut(t) * Math.PI * 2;
    if (trick.kind === 'flip') j.angle = turn;
    else j.spin = turn;
    if (t >= 1) finishTrick();
  }

  // Parachute
  if (pressed.has('action')) deploy(false);
  else if (j.alt <= AAD_ALTITUDE) deploy(true);
}

function startTrick(id) {
  const s = game.score;
  const j = game.jumper;
  s.combo = game.time - s.lastTrickEnd <= COMBO_WINDOW ? s.combo + 1 : 1;
  s.bestCombo = Math.max(s.bestCombo, s.combo);
  j.trick = id;
  j.trickT = 0;
}

function finishTrick() {
  const s = game.score;
  const j = game.jumper;
  const trick = TRICKS[j.trick];
  let pts = trick.points * s.combo;
  // Doing the same trick twice in a row is worth less. Mix it up!
  if (s.lastTrickId === j.trick) pts = Math.round(pts / 2);
  s.tricks += pts;
  s.trickCount++;
  s.lastTrickEnd = game.time;
  s.lastTrickId = j.trick;
  let label = `${trick.name} +${pts}`;
  if (s.combo > 1) label += `  ×${s.combo} combo!`;
  popup(label, s.combo > 1 ? '#ffd166' : '#fff');
  j.trick = null;
  j.angle = 0;
  j.spin = 0;
}

function deploy(byAAD) {
  const j = game.jumper;
  const s = game.score;
  if (byAAD) {
    s.items.push({ label: 'AAD fired your reserve (you forgot to pull!)', pts: -250 });
    popup('AAD FIRED! Reserve out', '#ff6b6b');
    game.canopyColors = ['#f4f4f4', '#9aa0a6'];
  } else if (j.alt < LOW_PULL_ALTITUDE) {
    s.items.push({ label: 'Low pull', pts: -100 });
    popup('Low pull!', '#ffb347');
  } else {
    popup('Pull! Canopy opening…', '#fff');
  }
  if (j.trick) {
    j.twists = 2.5;
    popup('Line twists! Kicking out of them…', '#ffb347');
  }
  j.trick = null;
  j.angle = 0;
  j.spin = 0;
  j.openT = 0;
  // Start off facing the target (or into the wind in free jump mode).
  const toward = game.mode === 'target' ? Math.sign(game.targetX - j.x) : -Math.sign(game.wind);
  j.facing = j.heading = toward || 1;
  game.phase = 'canopy';
}

function updateCanopy(dt) {
  const j = game.jumper;
  const wind = windNow() * phys.canopySpeedup;
  j.openT += dt;
  const open = clamp(j.openT / OPEN_TIME, 0, 1);

  let steer = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (j.twists > 0) {
    j.twists -= dt;
    steer = 0;
    if (j.twists <= 0) popup('Twists cleared. You have control!', '#8ef');
  }
  if (steer !== 0) j.facing = steer;
  const prevHeading = j.heading;
  j.heading = approach(j.heading, j.facing, dt * 2.2);
  j.turnRate = (j.heading - prevHeading) / dt;

  // Brakes slow you down. A flare is a big pull on the brakes right before landing.
  const braking = held.down && j.twists <= 0;
  j.brake = approach(j.brake, braking ? 1 : 0, dt * 5);
  j.brakeHeld = braking ? j.brakeHeld + dt : 0;

  const turning = 1 + 0.5 * (1 - Math.abs(j.heading)); // turns make you sink faster
  const forward = phys.canopyForward * (1 - 0.65 * j.brake);
  const sink = phys.canopySink * (1 - 0.45 * j.brake) * turning;

  j.vy += (sink - j.vy) * ease(dt, 0.35);
  j.vx += (j.heading * forward * open + wind - j.vx) * ease(dt, 0.5);
  j.x += j.vx * dt;
  j.alt -= j.vy * dt;

  if (j.alt <= 0) land();
}

function land() {
  const j = game.jumper;
  const s = game.score;
  const items = [];
  j.alt = 0;
  game.phase = 'landed';
  game.landedTime = 0;

  if (s.trickCount > 0) {
    items.push({ label: `Freefall tricks (${s.trickCount}, best combo ×${s.bestCombo})`, pts: s.tricks });
  }
  if (game.climb === 'fly') {
    const label = game.aircraft.kind === 'balloon' ? 'Piloted the balloon up yourself' : 'Flew the plane up yourself';
    items.push({ label, pts: 200 });
  }
  items.push(...s.items);

  if (inWater(game.location, j.x)) {
    j.landStyle = 'splash';
    items.push({ label: 'Water landing! Swim to shore…', pts: -200 });
  } else {
    if (game.mode === 'target') {
      const dist = Math.abs(j.x - game.targetX);
      const ring = RINGS.find(r => dist <= r.radius);
      if (ring) items.push({ label: `${ring.name} (${fmt(dist)} ft from center)`, pts: ring.points });
      else items.push({ label: `Missed the target by ${fmt(dist)} ft`, pts: 0 });
    }

    if (j.brake > 0.6 && j.brakeHeld < phys.perfectFlareTime) {
      j.landStyle = 'stand';
      items.push({ label: 'Perfect flare: stand-up landing!', pts: 300 });
    } else if (j.brake > 0.6) {
      j.landStyle = 'slide';
      items.push({ label: 'Flared too early: slid in on your butt', pts: 100 });
    } else {
      j.landStyle = 'plf';
      items.push({ label: 'No flare: parachute landing roll (ouch)', pts: 0 });
    }

    const intoWind = Math.abs(game.wind) > 3 && Math.abs(j.heading) > 0.5
      && Math.sign(j.heading) === -Math.sign(game.wind);
    if (intoWind) items.push({ label: 'Landed into the wind', pts: 100 });
  }

  const total = items.reduce((sum, it) => sum + it.pts, 0);
  const key = `r88-best-${game.location.id}-${game.mode}`;
  const best = storage.get(key, null);
  const isBest = best === null || total > best;
  if (isBest) storage.set(key, total);
  game.result = { items, total, best: isBest ? total : best, isBest };

  const headline = { stand: 'Stand-up landing!', slide: 'Slid it in!', plf: 'Roll it out!', splash: 'SPLASH!' };
  popup(headline[j.landStyle], '#fff');
  updateTouchVisibility();
}

function updateLanded(dt) {
  game.landedTime += dt;
  if (game.landedTime > 2 && !game.resultsShown) {
    game.resultsShown = true;
    showResults();
  }
}

function updateCamera(dt) {
  const c = game.cam;
  if (game.phase === 'menu') {
    c.x += 60 * dt;
    c.alt = 9000;
    c.scale = 0.3;
    c.frac = 0.4;
    return;
  }
  let focusX;
  let focusAlt;
  let targetScale;
  if (game.phase === 'plane') {
    focusX = game.plane.x;
    focusAlt = game.plane.alt;
    targetScale = 0.35;
  } else if (game.phase === 'pilot') {
    focusX = game.plane.x;
    focusAlt = game.plane.alt;
    targetScale = clamp(420 / (focusAlt + 150), 0.3, 1.4);
  } else {
    focusX = game.jumper.x;
    focusAlt = game.jumper.alt;
    // Zoom in as you get close to the ground so you can aim your landing.
    targetScale = clamp(420 / (focusAlt + 150), 0.18, 2.2);
  }
  c.scale += (targetScale - c.scale) * ease(dt, 0.6);
  c.x += (focusX - c.x) * ease(dt, 0.25);
  c.alt = focusAlt;
  c.frac = 0.4 + 0.18 * (1 - clamp(focusAlt / 1500, 0, 1));
}

function updateStreaks(dt) {
  if (game.phase !== 'freefall') return;
  const speedPx = game.jumper.vy * game.cam.scale * 3;
  for (const s of streaks) {
    s.y -= (speedPx * dt) / H;
    if (s.y < -0.1) {
      s.y = 1.1;
      s.x = Math.random();
    }
  }
}

// Turn a world position (feet) into a screen position (pixels).
function toScreen(x, alt) {
  const c = game.cam;
  return {
    x: W / 2 + (x - c.x) * c.scale,
    y: H * c.frac - (alt - c.alt) * c.scale,
  };
}

// =====================================================================
// 6. DRAW
// =====================================================================

function draw() {
  const loc = game.location;
  drawSky(loc);
  for (const c of game.scenery.clouds) if (!c.front) drawCloud(c, loc, 1);
  drawGround(loc);
  if (game.phase !== 'menu') {
    drawAircraft();
    if (game.phase !== 'plane' && game.phase !== 'pilot') drawJumper();
  }
  for (const c of game.scenery.clouds) if (c.front) drawCloud(c, loc, 0.55);
  if (game.phase === 'freefall') drawStreaks();
  if (game.phase !== 'menu') drawHud();
}

function drawSky(loc) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, loc.skyTop);
  g.addColorStop(1, loc.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // The sky gets darker the higher you go.
  const high = clamp(game.cam.alt / 16000, 0, 1);
  ctx.fillStyle = `rgba(8, 16, 60, ${high * 0.35})`;
  ctx.fillRect(0, 0, W, H);

  if (loc.night) {
    for (const s of stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.4 * Math.sin(game.time * 2 + s.x * 50)})`;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
  }
}

function drawCloud(c, loc, alpha) {
  const p = toScreen(c.x, c.alt);
  const w = c.w * game.cam.scale;
  if (p.x + w < 0 || p.x - w > W || p.y + w < 0 || p.y - w > H) return;
  ctx.fillStyle = loc.night
    ? `rgba(170, 180, 230, ${0.2 * alpha})`
    : `rgba(255, 255, 255, ${0.85 * alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + w * 0.05, w * 0.55, w * 0.16, 0, 0, Math.PI * 2);
  for (let i = 0; i < c.puffs; i++) {
    const ox = (i / (c.puffs - 1) - 0.5) * w;
    const r = w * (0.22 + 0.1 * Math.sin(i * 1.7 + c.x));
    const oy = -r * 0.3 * Math.abs(Math.sin(i + 1));
    ctx.moveTo(p.x + ox + r, p.y + oy);
    ctx.arc(p.x + ox, p.y + oy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawGround(loc) {
  const scale = game.cam.scale;
  const gy = toScreen(0, 0).y;
  if (gy - 350 > H) return; // ground is still far below the screen

  // Distant hills (or city skyline). They move slower than the ground,
  // which makes them feel far away. This trick is called parallax.
  ctx.fillStyle = loc.far;
  if (loc.skyline) {
    const off = game.cam.x * 0.03;
    const bw = 34;
    const first = Math.floor(off / bw);
    for (let i = first; (i - first) * bw <= W + bw * 2; i++) {
      const h = 30 + hash(i) * 110;
      ctx.fillRect(i * bw - off, gy - h, bw - 3, h + 1);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(0, gy + 1);
    for (let sx = 0; sx <= W + 16; sx += 16) {
      const wx = sx + game.cam.x * 0.04;
      const h = (50 + 35 * Math.sin(wx / 170) + 20 * Math.sin(wx / 63 + 1)) * loc.hills;
      ctx.lineTo(sx, gy - Math.max(8, h));
    }
    ctx.lineTo(W, gy + 1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = loc.ground;
  ctx.fillRect(0, gy, W, H - gy + 1);

  if (loc.pad) {
    const a = toScreen(game.targetX - 320, 0).x;
    const b = toScreen(game.targetX + 320, 0).x;
    ctx.fillStyle = loc.pad;
    ctx.fillRect(a, gy, b - a, H - gy + 1);
  }

  for (const [from, to] of loc.water) {
    const a = Math.max(-10, toScreen(from, 0).x);
    const b = Math.min(W + 10, toScreen(to, 0).x);
    if (b <= a) continue;
    ctx.fillStyle = loc.night ? '#1b3a5e' : '#2c78b8';
    ctx.fillRect(a, gy, b - a, H - gy + 1);
    ctx.fillStyle = '#86c9f0';
    ctx.fillRect(a, gy, b - a, Math.max(2, 3 * scale));
  }

  drawRunway(loc, gy);

  ctx.fillStyle = loc.groundTop;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(0, gy, W, Math.max(2, 4 * scale));
  ctx.globalAlpha = 1;

  for (const d of game.scenery.decor) {
    const h = d.h * scale;
    if (h < 1.5) continue;
    const x = toScreen(d.x, 0).x;
    const w = d.w * scale;
    if (x < -w || x > W + w) continue;
    drawDecor(loc, x, gy, h, w, d);
  }

  if (game.mode === 'target') drawTarget(gy);
  drawWindsock(gy);
}

function drawRunway(loc, gy) {
  const scale = game.cam.scale;
  const [from, to] = loc.runway;
  const a = toScreen(from, 0).x;
  const b = toScreen(to, 0).x;
  if (b < 0 || a > W) return;
  const h = Math.max(3, 7 * scale);
  ctx.fillStyle = loc.night ? '#26292f' : '#50555e';
  ctx.fillRect(a, gy, b - a, h);
  if (scale < 0.25) return;
  // Dashed centerline
  ctx.fillStyle = '#e8e8e8';
  for (let x = from + 60; x < to - 60; x += 120) {
    const sx = toScreen(x, 0).x;
    if (sx < -60 || sx > W + 60) continue;
    ctx.fillRect(sx, gy + h * 0.4, 50 * scale, Math.max(1, h * 0.2));
  }
}

function drawDecor(loc, x, y, h, w, d) {
  ctx.lineCap = 'round';
  switch (loc.decor) {
    case 'palm': {
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = Math.max(1, h * 0.07);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + h * 0.15, y - h * 0.5, x + h * 0.1, y - h);
      ctx.stroke();
      ctx.strokeStyle = '#2f9e44';
      ctx.lineWidth = Math.max(1, h * 0.06);
      const tx = x + h * 0.1;
      const ty = y - h;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI + k * (Math.PI / 4);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          tx + Math.cos(a) * h * 0.3, ty + Math.sin(a) * h * 0.3 - h * 0.1,
          tx + Math.cos(a) * h * 0.45, ty + Math.sin(a) * h * 0.2 + h * 0.15,
        );
        ctx.stroke();
      }
      break;
    }
    case 'tree': {
      ctx.fillStyle = '#6b4423';
      ctx.fillRect(x - h * 0.05, y - h * 0.45, h * 0.1, h * 0.45);
      ctx.fillStyle = d.seed > 0.5 ? '#3f7d34' : '#356b2c';
      ctx.beginPath();
      ctx.arc(x, y - h * 0.65, h * 0.32, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cactus': {
      ctx.strokeStyle = '#4f8f3a';
      ctx.lineWidth = Math.max(1, h * 0.2);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - h);
      ctx.moveTo(x, y - h * 0.45);
      ctx.lineTo(x - h * 0.3, y - h * 0.45);
      ctx.lineTo(x - h * 0.3, y - h * 0.75);
      ctx.moveTo(x, y - h * 0.55);
      ctx.lineTo(x + h * 0.3, y - h * 0.55);
      ctx.lineTo(x + h * 0.3, y - h * 0.85);
      ctx.stroke();
      break;
    }
    case 'pine': {
      ctx.fillStyle = '#5a3d22';
      ctx.fillRect(x - h * 0.03, y - h * 0.2, h * 0.06, h * 0.2);
      ctx.fillStyle = d.seed > 0.5 ? '#2d5a3a' : '#264d31';
      for (let k = 0; k < 3; k++) {
        const base = y - h * (0.15 + k * 0.25);
        const half = h * (0.25 - k * 0.06);
        ctx.beginPath();
        ctx.moveTo(x - half, base);
        ctx.lineTo(x, base - h * 0.4);
        ctx.lineTo(x + half, base);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'building': {
      const left = x - w / 2;
      ctx.fillStyle = `hsl(225, 12%, ${14 + d.seed * 10}%)`;
      ctx.fillRect(left, y - h, w, h);
      const floorPx = 12 * game.cam.scale;
      if (floorPx < 3) break; // too far away to see windows
      const rows = Math.floor(d.h / 12);
      const cols = Math.floor(d.w / 10);
      for (let r = 1; r < rows; r++) {
        const wy = y - r * floorPx;
        if (wy < -floorPx || wy > H + floorPx) continue;
        for (let c = 0; c < cols; c++) {
          const lit = hash(d.x + r * 7.3 + c * 13.1) > 0.55;
          ctx.fillStyle = lit ? '#ffd46b' : '#2a2f40';
          ctx.fillRect(left + (c + 0.25) * 10 * game.cam.scale, wy - floorPx * 0.7, 5 * game.cam.scale, floorPx * 0.45);
        }
      }
      break;
    }
  }
}

function drawTarget(gy) {
  const scale = game.cam.scale;
  const x = toScreen(game.targetX, 0).x;
  for (let i = RINGS.length - 1; i >= 0; i--) {
    const r = Math.max(RINGS[i].radius * scale, 1 + i);
    ctx.fillStyle = RINGS[i].color;
    ctx.beginPath();
    ctx.ellipse(x, gy + 1, r, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWindsock(gy) {
  const scale = game.cam.scale;
  const x = toScreen(game.targetX + 240, 0).x;
  const pole = 25 * scale;
  if (pole < 3) return;
  const top = gy - pole;
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = Math.max(1, 0.8 * scale);
  ctx.beginPath();
  ctx.moveTo(x, gy);
  ctx.lineTo(x, top);
  ctx.stroke();

  const wind = windNow();
  const dir = Math.sign(wind) || 1;
  const strength = clamp(Math.abs(wind) / 15, 0.2, 1);
  const len = 12 * scale;
  const sag = len * (1 - strength) * 0.8;
  ctx.fillStyle = '#ff7a1a';
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + dir * len, top + sag + len * 0.1);
  ctx.lineTo(x + dir * len, top + sag + len * 0.22);
  ctx.lineTo(x, top + len * 0.35);
  ctx.closePath();
  ctx.fill();
}

function drawAircraft() {
  const ac = game.aircraft;
  const plane = game.plane;
  const p = toScreen(plane.x, plane.alt);
  if (p.x < -200 || p.x > W + 200 || p.y < -60 || p.y > H + 250) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(ac.size, ac.size);
  if (ac.kind === 'balloon') {
    ctx.translate(0, -10); // so the basket sits on the ground
    drawBalloon(ac);
  } else {
    ctx.translate(0, -12); // so the wheels sit on the ground
    // Squash through zero while turning around, then face the new way.
    const tv = plane.turnVis;
    ctx.scale(Math.sign(tv || 1) * Math.max(0.15, Math.abs(tv)), 1);
    ctx.rotate(-plane.pitch);
    drawPlane(ac);
  }
  ctx.restore();
}

function drawPlane(ac) {
  const boxy = ac.style === 'skyvan';

  // Landing gear
  ctx.strokeStyle = '#3a3f48';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 6);
  ctx.lineTo(-10, 10);
  ctx.moveTo(30, 5);
  ctx.lineTo(31, 10);
  ctx.stroke();
  ctx.fillStyle = '#1d1f24';
  for (const wx of [-10, 31]) {
    ctx.beginPath();
    ctx.arc(wx, 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tail fin
  ctx.fillStyle = ac.color;
  ctx.beginPath();
  ctx.moveTo(-38, -6);
  ctx.lineTo(-56, -30);
  ctx.lineTo(-46, -30);
  ctx.lineTo(-22, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ac.stripe;
  ctx.fillRect(-55, -30, 9, 5);

  // Body
  ctx.fillStyle = ac.color;
  if (boxy) {
    roundRect(-48, -14, 94, 24, 4);
  } else {
    ctx.beginPath();
    ctx.ellipse(0, -1, 52, 10, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = ac.stripe;
  ctx.fillRect(-44, 2, 86, 3);

  // Windows
  ctx.fillStyle = '#9fd4ff';
  for (let i = 0; i < 4; i++) {
    roundRect(6 + i * 8, -7, 5, 4, 1.5);
    ctx.fill();
  }
  roundRect(40, -8, 7, 5, 2);
  ctx.fill();

  // Open door (that's where you jump from!)
  ctx.fillStyle = '#1c2230';
  if (boxy) ctx.fillRect(-48, -12, 6, 20);
  else {
    roundRect(-20, -7, 11, 13, 2);
    ctx.fill();
  }

  // Wing (seen edge-on) and propellers
  ctx.fillStyle = '#9aa3ad';
  roundRect(0, -14, 20, 4, 2);
  ctx.fill();
  const blur = 'rgba(255, 255, 255, 0.5)';
  if (ac.style === 'cessna') {
    ctx.fillStyle = blur;
    ctx.beginPath();
    ctx.ellipse(54, -1, 2, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#6b7380';
    roundRect(4, -13, 20, 8, 3);
    ctx.fill();
    ctx.fillStyle = blur;
    ctx.beginPath();
    ctx.ellipse(26, -9, 2, 11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBalloon(ac) {
  ctx.strokeStyle = '#5a4630';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.lineTo(-22, -34);
  ctx.moveTo(9, -2);
  ctx.lineTo(22, -34);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-22, -34);
  ctx.bezierCurveTo(-62, -60, -42, -118, 0, -118);
  ctx.bezierCurveTo(42, -118, 62, -60, 22, -34);
  ctx.closePath();
  ctx.fillStyle = ac.color;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = ac.stripe;
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(i * 12 - 5, -120, 10, 90);
  ctx.restore();

  ctx.fillStyle = '#8b5a2b';
  roundRect(-10, -4, 20, 14, 3);
  ctx.fill();

  // Burner flame: a big roar when you're firing it, a pilot light otherwise.
  const roaring = game.plane.burning;
  if (roaring || Math.sin(game.time * 9) > 0.3) {
    const flicker = roaring ? 1.6 + Math.sin(game.time * 40) * 0.3 : 1;
    ctx.fillStyle = roaring ? '#ff8c1a' : '#ffb703';
    ctx.beginPath();
    ctx.ellipse(0, -30 - 3 * flicker, 3 * flicker, 6 * flicker, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawJumper() {
  const j = game.jumper;
  const p = toScreen(j.x, j.alt);
  ctx.save();
  ctx.translate(p.x, p.y);
  const size = clamp(0.9 + game.cam.scale * 0.25, 1, 1.5);
  ctx.scale(size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (game.phase === 'freefall') drawFreefallBody(j);
  else if (game.phase === 'canopy') drawCanopyJumper(j);
  else drawLandedJumper(j);
  ctx.restore();
}

// Side view of a skydiver lying belly-down on the air.
function drawFreefallBody(j) {
  ctx.scale(j.faceDir, 1);
  ctx.rotate(j.angle);
  ctx.scale(Math.cos(j.spin), 1); // a flat spin seen from the side
  const t = Math.abs(j.tracking);
  const arch = 1 - t;

  // Legs
  ctx.strokeStyle = SUIT_DARK;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-16, -3 * arch);
  ctx.lineTo(-22 - 4 * t, -9 * arch);
  ctx.stroke();

  // Torso and parachute container
  ctx.fillStyle = SUIT;
  roundRect(-9, -4, 20, 8, 4);
  ctx.fill();
  ctx.fillStyle = RIG;
  roundRect(-6, -8, 13, 5, 2);
  ctx.fill();

  // Arms: reaching forward in a normal arch, swept back when tracking
  ctx.strokeStyle = SUIT;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(7, -1);
  ctx.lineTo(lerp(12, 0, t), lerp(-8, 4, t));
  ctx.lineTo(lerp(18, -10, t), lerp(-11, 5, t));
  ctx.stroke();

  // Helmet and visor
  ctx.fillStyle = HELMET;
  ctx.beginPath();
  ctx.arc(15, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = VISOR;
  ctx.beginPath();
  ctx.arc(17, 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCanopyJumper(j) {
  const inflate = easeInOut(clamp(j.openT / OPEN_TIME, 0, 1));
  const f = Math.sign(j.heading) || j.facing;
  ctx.rotate(clamp(j.turnRate * 0.2, -0.35, 0.35)); // bank into turns

  const [c1, c2] = game.canopyColors;
  const cy = -96;
  const hw = 16 + 26 * inflate;
  const top = 6 + 14 * inflate;
  const twisted = j.twists > 0;

  // Suspension lines
  ctx.strokeStyle = 'rgba(40, 40, 40, 0.7)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const ax of [-hw, -hw * 0.4, hw * 0.4, hw]) {
    ctx.moveTo(ax, cy + 4);
    if (twisted) {
      ctx.lineTo(0, -52);
      ctx.lineTo(ax < 0 ? 4 : -4, -30);
    } else {
      ctx.lineTo(ax < 0 ? -4 : 4, -30);
    }
  }
  ctx.stroke();

  // Canopy with striped cells
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hw, cy + 4);
  ctx.quadraticCurveTo(0, cy - top * 2, hw, cy + 4);
  ctx.quadraticCurveTo(0, cy - 2, -hw, cy + 4);
  ctx.closePath();
  ctx.fillStyle = c1;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = c2;
  const cell = (hw * 2) / 7;
  for (let i = 1; i < 7; i += 2) ctx.fillRect(-hw + i * cell, cy - 40, cell, 60);
  ctx.restore();

  ctx.save();
  if (twisted) ctx.scale(Math.cos(game.time * 14), 1);
  drawHangingBody(j.brake, f);
  ctx.restore();
}

// Upright body, with its feet at (0, 0). brake 0 = hands up, 1 = hands down.
function drawHangingBody(brake, f) {
  ctx.strokeStyle = SUIT_DARK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-2, -14);
  ctx.lineTo(-2 + f, 0);
  ctx.moveTo(2, -14);
  ctx.lineTo(3 + f * 2, -1);
  ctx.stroke();

  ctx.fillStyle = RIG;
  roundRect(f > 0 ? -8 : 4, -29, 4, 13, 1.5);
  ctx.fill();
  ctx.fillStyle = SUIT;
  roundRect(-4, -29, 8, 16, 3);
  ctx.fill();

  const handY = -46 + brake * 18;
  ctx.strokeStyle = SUIT;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-3, -27);
  ctx.lineTo(-6, handY);
  ctx.moveTo(3, -27);
  ctx.lineTo(6, handY);
  ctx.stroke();

  ctx.fillStyle = HELMET;
  ctx.beginPath();
  ctx.arc(0, -34, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = VISOR;
  ctx.beginPath();
  ctx.arc(f * 2.5, -34, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawLandedJumper(j) {
  const f = Math.sign(j.heading) || 1;
  const t = clamp(game.landedTime / 0.8, 0, 1);
  const [c1] = game.canopyColors;

  if (j.landStyle === 'splash') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 + t * 30, 3 + t * 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.ellipse(-f * 45, 0, 28, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HELMET;
    ctx.beginPath();
    ctx.arc(0, -3, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // The canopy collapses onto the ground behind you.
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.ellipse(-f * (30 + 20 * t), -3, 26, 5 + 10 * (1 - t), 0, 0, Math.PI * 2);
  ctx.fill();

  if (j.landStyle === 'plf') {
    ctx.translate(0, -4);
    ctx.rotate(-f * (Math.PI / 2) * t);
    drawHangingBody(0.5, f);
  } else if (j.landStyle === 'slide') {
    ctx.translate(0, 6 * t);
    ctx.rotate(-f * 0.5 * t);
    drawHangingBody(1, f);
  } else {
    // Stand-up landing, then throw your arms up to celebrate.
    drawHangingBody(t < 1 ? 1 : 0, f);
  }
}

function drawStreaks() {
  const a = 0.25 * (game.jumper.vy / phys.terminal);
  ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const s of streaks) {
    ctx.moveTo(s.x * W, s.y * H);
    ctx.lineTo(s.x * W, s.y * H + s.len);
  }
  ctx.stroke();
}

// ---------- Heads-up display (the text and meters on top) ----------

function hudPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 12, 32, 0.55)';
  roundRect(x, y, w, h, 12);
  ctx.fill();
}

function currentScore() {
  if (game.result) return game.result.total;
  const s = game.score;
  return s.tricks + s.items.reduce((sum, it) => sum + it.pts, 0);
}

function drawHud() {
  const j = game.jumper;
  const phase = game.phase;
  const plane = game.plane;
  const inAircraft = phase === 'plane' || phase === 'pilot';
  const alt = inAircraft ? plane.alt : j.alt;
  const isBalloon = game.aircraft.kind === 'balloon';
  const stallSpeed = game.aircraft.speed * 0.4;
  const panelW = Math.min(200, (W - 48) / 2);
  const bottomInset = touchMode && isPlaying() ? 170 : 0;
  const flash = Math.sin(game.time * 12) > 0;

  // Left panel: altimeter
  hudPanel(16, 16, panelW, 82);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText('ALTITUDE', 28, 36);
  let altColor = '#ffffff';
  if (phase === 'freefall' && alt < PULL_ALTITUDE + 1000) altColor = '#ffd166';
  if (phase === 'freefall' && alt < LOW_PULL_ALTITUDE + 500) altColor = '#ff6b6b';
  ctx.fillStyle = altColor;
  fitFont(`${fmt(alt)} ft`, 750, 26, panelW - 24);
  ctx.fillText(`${fmt(alt)} ft`, 28, 66);
  let sub = game.aircraft.name;
  if (phase === 'freefall') sub = `Fall rate ${fmt((j.vy / phys.freefallSpeedup) * FT_PER_SEC_TO_MPH)} mph`;
  if (phase === 'canopy') sub = `Descent ${fmt((j.vy / phys.canopySpeedup) * FT_PER_SEC_TO_MPH)} mph`;
  if (phase === 'landed') sub = 'On the ground';
  if (phase === 'pilot') {
    if (isBalloon) sub = `Burner heat ${Math.round(plane.heat * 100)}%`;
    else if (plane.onGround && plane.throttle === 0) sub = 'Engine idling';
    else sub = `Airspeed ${fmt(plane.speed * FT_PER_SEC_TO_MPH)} mph`;
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  fitFont(sub, 500, 12, panelW - 24);
  ctx.fillText(sub, 28, 86);

  // Right panel: score and wind
  const rx = W - 16 - panelW;
  hudPanel(rx, 16, panelW, 82);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText('SCORE', rx + 12, 36);
  ctx.fillStyle = '#ffd166';
  fitFont(fmt(currentScore()), 750, 26, panelW - 24);
  ctx.fillText(fmt(currentScore()), rx + 12, 66);
  const wind = windNow();
  const windText = `Wind ${fmt(Math.abs(wind) * FT_PER_SEC_TO_MPH)} mph ${wind >= 0 ? '→' : '←'}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  fitFont(windText, 500, 12, panelW - 24);
  ctx.fillText(windText, rx + 12, 86);

  // Distance to target
  if (game.mode === 'target' && (phase === 'freefall' || phase === 'canopy')) {
    const dx = game.targetX - j.x;
    const text = Math.abs(dx) < 75 ? 'Right over the target!' : `Target ${fmt(Math.abs(dx))} ft ${dx > 0 ? '→' : '←'}`;
    fitFont(text, 650, 13, W - 32);
    const tw = ctx.measureText(text).width + 24;
    hudPanel(16, 106, tw, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 28, 125);
    drawOffscreenTarget(bottomInset);
  }

  // Big warnings in the middle of the screen
  ctx.textAlign = 'center';
  let warning = null;
  let warningColor = phase === 'canopy' ? '#8ef' : '#ff6b6b';
  const up = touchMode ? '▲' : '↑';
  const down = touchMode ? '▼' : '↓';
  if (phase === 'pilot' && !isBalloon) {
    if (plane.stalled) warning = flash ? `STALL! Nose down ${down}` : null;
    else if (!plane.onGround && plane.speed < stallSpeed * 1.2) warning = 'Low airspeed! Ease the nose down';
    else if (plane.onGround && plane.speed >= game.aircraft.speed * 0.45) {
      warning = `Takeoff speed! Hold ${up}`;
      warningColor = '#8ef';
    }
  } else if (phase === 'freefall' && alt < PULL_ALTITUDE + 300) warning = flash ? (touchMode ? 'PULL!' : 'PULL! (Space)') : null;
  else if (phase === 'freefall' && alt < PULL_ALTITUDE + 1500) warning = 'Get ready to pull…';
  else if (phase === 'canopy' && alt < phys.flareCueAlt) warning = flash ? (touchMode ? 'FLARE! Hold ▼' : 'FLARE! Hold ↓') : null;
  if (warning) {
    fitFont(warning, 800, 30, W - 32);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.strokeText(warning, W / 2, H * 0.68 - bottomInset / 2);
    ctx.fillStyle = warningColor;
    ctx.fillText(warning, W / 2, H * 0.68 - bottomInset / 2);
  }

  if (phase === 'plane' || (phase === 'pilot' && !plane.onGround)) drawSpotMeter(bottomInset);

  // Control hints along the bottom
  let hintKey = phase;
  if (phase === 'pilot') {
    if (isBalloon) hintKey = 'balloon';
    else if (plane.onGround && plane.throttle === 0) hintKey = 'runway';
    else if (plane.onGround) hintKey = 'rolling';
    else hintKey = 'flying';
  }
  const hints = {
    runway: ['Space: full power  ·  then hold ↑ to lift off', 'Tap GO for full power, then hold ▲ to lift off'],
    rolling: ['Hold ↑ to lift off once you reach takeoff speed', 'Hold ▲ to lift off at takeoff speed'],
    flying: ['↑/↓ nose up/down  ·  ←/→ turn around  ·  Space: JUMP (above 3,500 ft)', '▲▼ nose · ◀▶ turn · JUMP above 3,500 ft'],
    balloon: ['Hold ↑ to fire the burner  ·  Space: JUMP (above 3,500 ft)', 'Hold ▲ for the burner · JUMP above 3,500 ft'],
    plane: ['Space or click: JUMP. Wait for the green light', 'Tap JUMP when the light is green'],
    freefall: ['←/→ track  ·  ↑ backflip  ·  ↓ front flip  ·  Q/E spin  ·  Space: PULL', '▲▼ flips · ⟲⟳ spins · PULL before 3,000 ft'],
    canopy: ['←/→ steer  ·  hold ↓ for brakes. Flare just before you land', '◀ ▶ steer · hold ▼ to flare just before landing'],
  };
  if (hints[hintKey]) {
    const text = hints[hintKey][touchMode ? 1 : 0];
    fitFont(text, 500, 13, W - 48);
    const tw = ctx.measureText(text).width + 24;
    const y = H - 20 - bottomInset;
    hudPanel(W / 2 - tw / 2, y - 19, tw, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(text, W / 2, y);
  }

  // Pop-up messages
  game.popups.forEach((p, i) => {
    const y = H * 0.26 + 20 + i * 32 - p.age * 10;
    ctx.globalAlpha = clamp((2.2 - p.age) / 0.5, 0, 1);
    fitFont(p.text, 750, 20, W - 32);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.strokeText(p.text, W / 2, y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, W / 2, y);
  });
  ctx.globalAlpha = 1;
}

// When the target is off screen, show a marker at the edge pointing to it.
function drawOffscreenTarget(bottomInset) {
  const p = toScreen(game.targetX, 0);
  const bottom = H - 60 - bottomInset;
  if (p.y < bottom && p.x > 0 && p.x < W) return;
  const x = clamp(p.x, 36, W - 36);
  const y = Math.min(p.y, bottom);
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.lineTo(x - 9, y - 6);
  ctx.lineTo(x + 9, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText('TARGET', x, y - 12);
}

// A bar showing where the plane is compared to the best place to jump.
function drawSpotMeter(bottomInset) {
  const w = Math.min(420, W - 32);
  const x = W / 2 - w / 2;
  const y = H - 90 - bottomInset;
  const range = 5000;
  const toBar = worldX => x + clamp((worldX - game.idealExit + range) / (range * 2), 0, 1) * w;
  const offset = game.plane.x - game.idealExit;
  const green = Math.abs(offset) < SPOT_ZONE;
  const past = offset * Math.sign(game.plane.vx || 1) > SPOT_ZONE;
  let status = green ? '● GREEN LIGHT: JUMP!' : past ? '● Past the spot. Jump now or wait for a go-around' : '● Red light: not yet…';
  let statusColor = green ? '#7ee2a8' : '#ff8a8a';
  if (game.phase === 'pilot') {
    // You're the pilot, so tell them how to get to the spot.
    const toSpot = game.idealExit - game.plane.x;
    const ahead = Math.sign(toSpot) === Math.sign(game.plane.vx || 1) || game.aircraft.kind === 'balloon';
    if (game.plane.alt < MIN_EXIT_ALTITUDE) {
      status = `Climb above ${fmt(MIN_EXIT_ALTITUDE)} ft to jump`;
      statusColor = '#ffffff';
    } else if (!green) {
      status = ahead ? `● Red light: spot is ${fmt(Math.abs(toSpot))} ft ahead`
        : `● Spot is ${fmt(Math.abs(toSpot))} ft behind you. Turn around!`;
    }
  }

  hudPanel(x - 10, y - 38, w + 20, 62);
  ctx.textAlign = 'center';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillStyle = statusColor;
  fitFont(status, 700, 14, w);
  ctx.fillText(status, W / 2, y - 16);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  roundRect(x, y, w, 10, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(126, 226, 168, 0.8)';
  const gz = toBar(game.idealExit - SPOT_ZONE);
  ctx.fillRect(gz, y, toBar(game.idealExit + SPOT_ZONE) - gz, 10);

  if (game.mode === 'target') {
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(toBar(game.targetX), y + 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const px = toBar(game.plane.x);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px, y + 12);
  ctx.lineTo(px - 6, y + 21);
  ctx.lineTo(px + 6, y + 21);
  ctx.closePath();
  ctx.fill();
}

// =====================================================================
// 7. MENUS
// =====================================================================

const $ = sel => document.querySelector(sel);
const ui = {
  menu: $('#menu'),
  results: $('#results'),
  touch: $('#touch'),
  locations: $('#location-list'),
  aircraft: $('#aircraft-list'),
  modes: $('#mode-list'),
  climbs: $('#climb-list'),
  speeds: $('#speed-list'),
  start: $('#start-btn'),
  best: $('#best-line'),
  resultsTitle: $('#results-title'),
  resultsList: $('#results-list'),
  resultsTotal: $('#results-total'),
  resultsBest: $('#results-best'),
  again: $('#again-btn'),
  menuBtn: $('#menu-btn'),
  actionBtn: $('#touch [data-action="action"]'),
};

function renderChoices(el, items, onPick) {
  el.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.dataset.id = item.id;
    if (item.skyTop) {
      b.classList.add('has-swatch');
      b.style.setProperty('--swatch', `linear-gradient(90deg, ${item.skyTop}, ${item.skyBottom}, ${item.ground})`);
    }
    const name = document.createElement('span');
    name.className = 'choice-name';
    name.textContent = item.name;
    const blurb = document.createElement('span');
    blurb.className = 'choice-blurb';
    blurb.textContent = item.blurb;
    b.append(name, blurb);
    b.addEventListener('click', () => {
      onPick(item);
      refreshMenu();
    });
    el.appendChild(b);
  }
}

function refreshMenu() {
  const mark = (el, id) => el.querySelectorAll('.choice').forEach(b => b.setAttribute('aria-pressed', b.dataset.id === id));
  mark(ui.locations, game.location.id);
  mark(ui.aircraft, game.aircraft.id);
  mark(ui.modes, game.mode);
  mark(ui.climbs, game.climb);
  mark(ui.speeds, game.speed);
  const best = storage.get(`r88-best-${game.location.id}-${game.mode}`, null);
  ui.best.textContent = best === null ? 'No jumps here yet' : `Your best here: ${fmt(best)} points`;
  storage.set('r88-prefs', {
    location: game.location.id, aircraft: game.aircraft.id, mode: game.mode,
    climb: game.climb, speed: game.speed,
  });
}

function showMenu() {
  game.phase = 'menu';
  game.scenery = makeScenery(game.location);
  ui.menu.classList.remove('hidden');
  ui.results.classList.add('hidden');
  refreshMenu();
  updateTouchVisibility();
}

function showResults() {
  const r = game.result;
  ui.resultsTitle.textContent = r.total >= 1500 ? 'Legendary jump!'
    : r.total >= 800 ? 'Great jump!'
      : r.total >= 300 ? 'Nice jump!'
        : 'You made it down!';
  ui.resultsList.innerHTML = '';
  for (const item of r.items) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = item.label;
    const pts = document.createElement('span');
    pts.className = `pts ${item.pts > 0 ? 'pos' : item.pts < 0 ? 'neg' : 'zero'}`;
    pts.textContent = item.pts > 0 ? `+${fmt(item.pts)}` : fmt(item.pts);
    li.append(label, pts);
    ui.resultsList.appendChild(li);
  }
  ui.resultsTotal.innerHTML = '';
  const totalLabel = document.createElement('span');
  totalLabel.textContent = 'Total';
  const totalValue = document.createElement('span');
  totalValue.textContent = fmt(r.total);
  ui.resultsTotal.append(totalLabel, totalValue);
  ui.resultsBest.textContent = r.isBest ? '★ New personal best!' : `Best here: ${fmt(r.best)}`;
  ui.results.classList.remove('hidden');
  ui.again.focus();
}

function updateTouchVisibility() {
  ui.touch.classList.toggle('hidden', !(touchMode && isPlaying()));
}

function syncTouchLabels() {
  let label = { plane: 'JUMP', pilot: 'JUMP', freefall: 'PULL', canopy: '—' }[game.phase];
  const p = game.plane;
  if (game.phase === 'pilot' && game.aircraft.kind !== 'balloon' && p.onGround && p.throttle === 0) label = 'GO';
  if (label && ui.actionBtn.textContent !== label) ui.actionBtn.textContent = label;
}

ui.start.addEventListener('click', startJump);
ui.again.addEventListener('click', startJump);
ui.menuBtn.addEventListener('click', showMenu);

// =====================================================================
// 8. START-UP
// =====================================================================

const prefs = storage.get('r88-prefs', {});
game.location = LOCATIONS.find(l => l.id === prefs.location) || LOCATIONS[0];
game.aircraft = AIRCRAFT.find(a => a.id === prefs.aircraft) || AIRCRAFT[1];
game.mode = MODES.some(m => m.id === prefs.mode) ? prefs.mode : 'target';
game.climb = CLIMBS.some(c => c.id === prefs.climb) ? prefs.climb : 'ride';
game.speed = SPEEDS.some(s => s.id === prefs.speed) ? prefs.speed : 'arcade';

renderChoices(ui.locations, LOCATIONS, item => {
  game.location = item;
  game.scenery = makeScenery(item);
});
renderChoices(ui.aircraft, AIRCRAFT, item => { game.aircraft = item; });
renderChoices(ui.modes, MODES, item => { game.mode = item.id; });
renderChoices(ui.climbs, CLIMBS, item => { game.climb = item.id; });
renderChoices(ui.speeds, SPEEDS, item => { game.speed = item.id; });
showMenu();

// The game loop: update, draw, repeat, about 60 times per second.
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  pressed.clear();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
