"use strict";

/* =====================================================================
   Formation skydiving
   ---------------------------------------------------------------------
   In "Formation" mode, three friends jump just before you. The first one
   is the "base": everyone else flies into a slot next to them.

   1. Your slot is the glowing circle. Fly into it and match speed to dock.
      You start above the group, so dive (F) to get down, and track
      (←/→) to slide sideways. Tracking also slows your fall a little.
   2. Hold your slot and the group moves to the next shape (a new "point").
   3. At 5,500 ft everyone BREAKS OFF: turn and track away from each other
      so nobody opens a parachute on top of someone else.

   In a wingsuit it's the same idea, but the group glides together and
   you match speed with nose up/down.
   ===================================================================== */

const BREAK_OFF_ALTITUDE = 5500;
const DOCK_DISTANCE = 35;   // feet from the center of your slot
const ASSIST_DISTANCE = 110; // close to your slot, you get a gentle pull into it
const SAFE_PULL_DISTANCE = 250;

const BUDDY_PAINTS = [
  { suit: '#3a86ff', suitDark: '#2359b3', rig: '#1d1d1f', helmet: '#f1f1f1', visor: '#1d1d1f' },
  { suit: '#06d6a0', suitDark: '#04946e', rig: '#2b3a8c', helmet: '#1d1d1f', visor: '#6fd3ff' },
  { suit: '#ffd166', suitDark: '#c99a2e', rig: '#8338ec', helmet: '#e63946', visor: '#6fd3ff' },
];
const BUDDY_CANOPIES = [['#3a86ff', '#ffffff'], ['#06d6a0', '#073b4c'], ['#ffd166', '#e63946']];

// Slot offsets for [buddy 1, buddy 2, you], relative to the base.
// x is in the direction of flight (feet), alt is up (feet).
const BELLY_SHAPES = [
  { name: 'Line', slots: [[70, 0], [-70, 0], [140, 0]] },
  { name: 'Line, other side', slots: [[70, 0], [-70, 0], [-140, 0]] },
  { name: 'Stair step', slots: [[70, 30], [140, 60], [-70, -30]] },
];
const WS_SHAPES = [
  { name: 'Echelon', slots: [[-110, 30], [-220, 60], [-330, 90]] },
  { name: 'Arrow', slots: [[-110, 40], [-110, -40], [-220, 0]] },
  { name: 'Stack', slots: [[0, 60], [0, 120], [0, -60]] },
];

let crew = null;

function resetFormation() {
  crew = null;
}

function onExitFormation(j) {
  if (game.mode !== 'formation') return;
  const dir = Math.sign(game.plane.vx) || 1;
  const ws = j.ws;
  const buddies = [];
  for (let i = 0; i < 3; i++) {
    const b = newJumper();
    // They left the plane just before you, so they're a bit lower and behind.
    b.x = j.x - dir * (50 + i * 45);
    b.alt = j.alt - 140 - i * 25;
    b.vx = j.vx;
    b.vy = phys.terminal * 0.4;
    b.faceDir = dir;
    b.paint = BUDDY_PAINTS[i];
    b.canopyColors = BUDDY_CANOPIES[i];
    b.phase = 'freefall';
    b.pullAlt = 3600 + (2 - i) * 250; // stagger the openings
    b.landX = game.targetX + (i - 1) * 90;
    b.awayDir = [1, -1, 1][i];
    if (ws) {
      startWingsuit(b, dir);
      b.wsInflate = 0.5;
    }
    buddies.push(b);
  }
  crew = { buddies, dir, ws, shape: 0, docked: false, dockTime: 0, points: 0, pts: 0, broken: false };
  popup('Your friends are below you. Fly into the glowing slot!', '#8ef');
}

function formationZoom() {
  return crew && game.phase === 'freefall' && !crew.broken
    && Math.hypot(game.jumper.x - crew.buddies[0].x, game.jumper.alt - crew.buddies[0].alt) < 900;
}

function formationShapes() {
  return crew.ws ? WS_SHAPES : BELLY_SHAPES;
}

// Where slot `i` is right now (0-1 = buddies, 2 = you).
function slotPosition(i) {
  const base = crew.buddies[0];
  const [dx, dAlt] = formationShapes()[crew.shape].slots[i];
  return { x: base.x + dx * crew.dir, alt: base.alt + dAlt };
}

function updateFormation(dt) {
  if (!crew) return;
  const base = crew.buddies[0];
  const wind = windNow();

  crew.buddies.forEach((b, i) => {
    if (b.phase === 'freefall') {
      if (i === 0) flyBase(b, dt, wind);
      else flyToSlot(b, i - 1, dt, wind);
      if (b.alt <= b.pullAlt) aiPull(b);
    } else if (b.phase === 'canopy') {
      flyAiCanopy(b, dt, wind);
    } else if (b.phase === 'landed') {
      b.landedT = (b.landedT || 0) + dt;
    }
  });

  // Break-off: everyone turns and tracks away.
  if (!crew.broken && base.phase === 'freefall' && base.alt <= BREAK_OFF_ALTITUDE) {
    crew.broken = true;
    crew.docked = false;
    // Everyone tracks away from you, and you should track away from the group.
    const j = game.jumper;
    const center = crew.buddies.reduce((sum, b) => sum + b.x, 0) / crew.buddies.length;
    crew.awayDir = Math.sign(j.x - center) || 1;
    crew.buddies.forEach((b, i) => {
      // Freefly: everyone tracks the other way from you. Wingsuit: spread out up and down.
      b.awayDir = crew.ws ? (i % 2 ? -1 : 1) : -crew.awayDir;
      b.breakSpeed = 0.6 + i * 0.2; // spread out from each other too
    });
    if (game.phase === 'freefall') {
      popup('BREAK OFF! Turn and track away', '#ff6b6b');
      Sfx.beep(2, true);
    }
  }

  if (game.phase === 'freefall' && !crew.broken) updateDocking(dt);
}

// The base just falls straight and steady so everyone can fly to them.
function flyBase(b, dt, wind) {
  if (b.ws) return aiGlide(b, dt, wind, 0, 0);
  const awayVx = crew.broken ? b.awayDir * phys.track * (b.breakSpeed || 1) : 0;
  b.vy += (phys.terminal * 0.97 - b.vy) * ease(dt, phys.accelTau);
  b.vx += (wind * phys.freefallSpeedup + awayVx - b.vx) * ease(dt, 0.8);
  b.tracking = approach(b.tracking, crew.broken ? b.awayDir : 0, dt * 3);
  b.x += b.vx * dt;
  b.alt -= b.vy * dt;
}

// Buddies are good at this: they steer smoothly into their slots.
function flyToSlot(b, slot, dt, wind) {
  const base = crew.buddies[0];
  const target = slotPosition(slot);
  const ex = target.x - b.x;
  const eAlt = target.alt - b.alt;
  if (b.ws) return aiGlide(b, dt, wind, ex, eAlt);
  let vxWant = base.vx + clamp(ex * 1.5, -phys.track * 0.9, phys.track * 0.9);
  let vyWant = base.vy - clamp(eAlt * 1.5, -phys.terminal * 0.2, phys.terminal * 0.2);
  if (crew.broken) {
    vxWant = wind * phys.freefallSpeedup + b.awayDir * phys.track * (b.breakSpeed || 1);
    vyWant = phys.terminal * 0.9;
  }
  b.vx += (vxWant - b.vx) * ease(dt, 0.5);
  b.vy += (vyWant - b.vy) * ease(dt, 0.5);
  const side = (b.vx - base.vx) / phys.track;
  b.tracking = approach(b.tracking, clamp(side, -1, 1), dt * 3);
  if (Math.abs(b.tracking) > 0.3) b.faceDir = Math.sign(b.tracking);
  b.x += b.vx * dt;
  b.alt -= b.vy * dt;
}

// Wingsuit AI: glide at a normal speed, nudging toward the slot.
function aiGlide(b, dt, wind, ex, eAlt) {
  const glide = 1.75;
  b.wsInflate = Math.min(1, b.wsInflate + dt * phys.freefallSpeedup / WS_INFLATE_TIME);
  b.wsAir += (WS_NEUTRAL_AIR - b.wsAir) * ease(dt, 0.8);
  const speedup = phys.freefallSpeedup;
  let vxWant = (b.wsAir * b.wsInflate * crew.dir) * speedup + wind * speedup;
  let vyWant = lerp(WS_BELLY_FALL, b.wsAir / glide, b.wsInflate) * speedup;
  vxWant += clamp(ex * 1.2, -60 * speedup, 60 * speedup);
  vyWant -= clamp(eAlt * 1.2, -40 * speedup, 40 * speedup);
  if (crew.broken) vyWant += b.awayDir * 25 * speedup; // spread out up and down
  b.wsPitch = clamp((vyWant / speedup - WS_NEUTRAL_AIR / glide) / 60, -1, 1);
  b.vx += (vxWant - b.vx) * ease(dt, 0.5);
  b.vy += (vyWant - b.vy) * ease(dt, 0.5);
  b.x += b.vx * dt;
  b.alt -= b.vy * dt;
  b.smokeTimer = (b.smokeTimer || 0) - dt;
  if (b.smokeTimer <= 0) {
    b.smokeTimer = 0.06;
    smokeTrail(b.x - crew.dir * 20, b.alt, b.paint.suit);
  }
}

function updateDocking(dt) {
  const j = game.jumper;
  const base = crew.buddies[0];
  const slot = slotPosition(2);
  const dist = Math.hypot(j.x - slot.x, j.alt - slot.alt);
  const relSpeed = Math.hypot(j.vx - base.vx, j.vy - base.vy);
  const input = held.left || held.right || held.dive || held.up || held.down || j.trick;

  if (!crew.docked) {
    // Close to the slot: a gentle "magnet" helps you settle in (a real formation
    // flyer makes lots of tiny corrections that a keyboard can't).
    if (dist < ASSIST_DISTANCE) {
      const pull = ease(dt, crew.ws ? 0.8 : 1.2);
      j.x += (slot.x - j.x) * pull;
      j.alt += (slot.alt - j.alt) * pull;
      j.vx += (base.vx - j.vx) * pull;
      j.vy += (base.vy - j.vy) * pull;
    }
    if (dist < DOCK_DISTANCE && relSpeed < phys.terminal * 0.4 && !j.trick) {
      crew.docked = true;
      crew.dockTime = 0;
      crew.points++;
      const pts = crew.points === 1 ? 300 : 200;
      crew.pts += pts;
      const name = formationShapes()[crew.shape].name;
      popup(`Docked! ${name} +${pts}`, '#8ef');
      Sfx.dock();
      sparkle(j.x, j.alt, '#8ef', 18);
    }
    return;
  }

  // Docked: hold your slot (you move with the group) until you fly out of it.
  if (!input) {
    j.x += (slot.x - j.x) * ease(dt, 0.1);
    j.alt += (slot.alt - j.alt) * ease(dt, 0.1);
    j.vx = base.vx;
    j.vy = base.vy;
  }
  if (Math.hypot(j.x - slot.x, j.alt - slot.alt) > DOCK_DISTANCE * 2) crew.docked = false;

  crew.dockTime += dt;
  const holdNeeded = 2.5 / Math.sqrt(phys.freefallSpeedup / 3); // a bit longer in real time
  if (crew.dockTime > holdNeeded && base.alt > BREAK_OFF_ALTITUDE + 1500) {
    // Next point: the group moves into a new shape.
    crew.shape = (crew.shape + 1) % formationShapes().length;
    crew.docked = false;
    popup(`Next point: ${formationShapes()[crew.shape].name}! Fly to the new slot`, '#ffd166');
  }
}

function aiPull(b) {
  b.phase = 'canopy';
  b.ws = false;
  b.openT = 0;
  b.heading = b.facing = Math.sign(b.landX - b.x) || 1;
  b.brake = 0;
  b.twists = 0;
}

// AI under canopy: fly toward a landing spot next to the target, flare, land.
function flyAiCanopy(b, dt, wind) {
  b.openT += dt;
  const open = clamp(b.openT / OPEN_TIME, 0, 1);
  const dx = b.landX - b.x;
  if (Math.abs(dx) > 80) b.facing = Math.sign(dx);
  else if (b.alt < 400) b.facing = -Math.sign(game.wind) || b.facing; // land into the wind
  const prev = b.heading;
  b.heading = approach(b.heading, b.facing, dt * 2.2);
  b.turnRate = (b.heading - prev) / dt;
  b.brake = approach(b.brake, b.alt < 40 ? 1 : 0, dt * 5);
  const sink = phys.canopySink * (1 - 0.45 * b.brake);
  const forward = phys.canopyForward * (1 - 0.65 * b.brake);
  b.vy += (sink - b.vy) * ease(dt, 0.35);
  b.vx += (b.heading * forward * open + wind * phys.canopySpeedup - b.vx) * ease(dt, 0.5);
  b.x += b.vx * dt;
  b.alt -= b.vy * dt;
  if (b.alt <= 0) {
    b.alt = 0;
    b.phase = 'landed';
    b.landStyle = 'stand';
    b.landedT = 0;
  }
}

// When you pull: is anyone too close?
function onDeployFormation(j) {
  if (!crew) return;
  const nearest = Math.min(...crew.buddies.map(b => Math.hypot(b.x - j.x, b.alt - j.alt)));
  if (nearest < SAFE_PULL_DISTANCE) {
    game.score.items.push({ label: `Pulled only ${fmt(nearest)} ft from a friend`, pts: -100 });
    popup('Too close! Track away before you pull', '#ff6b6b');
  } else if (crew.broken) {
    game.score.items.push({ label: 'Clean break-off: plenty of space at pull time', pts: 100 });
  }
}

function formationResults() {
  if (!crew) return [];
  if (crew.points === 0) return [{ label: 'Never docked with the formation', pts: 0 }];
  const s = crew.points === 1 ? '' : 's';
  return [{ label: `Formation complete: ${crew.points} point${s} built`, pts: crew.pts }];
}

function drawFormation() {
  if (!crew) return;
  // Hands joined: a short line between friends who are close together.
  if (game.phase === 'freefall' && !crew.broken) {
    const people = [...crew.buddies, game.jumper].filter(p => p.phase === 'freefall' || p === game.jumper);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    for (let a = 0; a < people.length; a++) {
      for (let b = a + 1; b < people.length; b++) {
        const d = Math.hypot(people[a].x - people[b].x, people[a].alt - people[b].alt);
        if (d > 95) continue;
        const p1 = toScreen(people[a].x, people[a].alt);
        const p2 = toScreen(people[b].x, people[b].alt);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    // Your slot
    if (!crew.docked) {
      const s = slotPosition(2);
      const p = toScreen(s.x, s.alt);
      const r = Math.max(12, DOCK_DISTANCE * game.cam.scale);
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -game.time * 20;
      ctx.strokeStyle = `rgba(136, 238, 255, ${0.7 + 0.3 * Math.sin(game.time * 6)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const b of crew.buddies) drawJumper(b, b.phase);
}

function drawFormationHud(y) {
  if (!crew || game.phase !== 'freefall') return y;
  const j = game.jumper;
  let text;
  if (crew.broken) {
    const arrow = crew.awayDir > 0 ? '→' : '←';
    text = crew.ws ? 'BREAK OFF! Turn or dive away from your friends' : `BREAK OFF! Track ${arrow} away from your friends`;
  } else if (crew.docked) {
    text = `Docked: ${formationShapes()[crew.shape].name}. Hold it!`;
  } else {
    const s = slotPosition(2);
    const dx = s.x - j.x;
    const dAlt = s.alt - j.alt;
    const vert = Math.abs(dAlt) < 20 ? 'level' : `${fmt(Math.abs(dAlt))} ft ${dAlt < 0 ? 'below ↓' : 'above ↑'}`;
    const side = Math.abs(dx) < 20 ? 'lined up' : `${fmt(Math.abs(dx))} ft ${dx > 0 ? '→' : '←'}`;
    text = `Your slot: ${vert}, ${side}`;
  }
  ctx.textAlign = 'left';
  fitFont(text, 650, 13, W - 32);
  const tw = ctx.measureText(text).width + 24;
  hudPanel(16, y, tw, 28);
  ctx.fillStyle = crew.broken ? '#ff8a8a' : '#8ef';
  ctx.fillText(text, 28, y + 19);
  return y + 36;
}
