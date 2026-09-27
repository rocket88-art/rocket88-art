"use strict";

/* =====================================================================
   Wingsuit flying
   ---------------------------------------------------------------------
   A wingsuit has fabric wings between your arms and body and between
   your legs. It turns falling into gliding: for every foot you drop,
   you fly about 1.75 feet forward (the "glide ratio"). A pro suit
   from the gear shop glides even farther.

   Controls:
     ↑ nose up (flare): trade speed for a slower fall. Too slow and you stall!
     ↓ nose down (dive): pick up speed but fall faster
     ←/→ turn around

   The physics here uses real-world numbers (feet per second), then
   multiplies by phys.freefallSpeedup, the same as the rest of freefall.
   ===================================================================== */

const WS_NEUTRAL_AIR = 130;  // ft/s forward speed in a normal glide (~90 mph)
const WS_STALL_AIR = 65;     // slower than this and the wings stop working
const WS_BELLY_FALL = 176;   // before the wings open you fall like normal
const WS_INFLATE_TIME = 3;   // real seconds for the wings to fill with air
// While the wings fill, you drop without gliding much. After that you're
// about this many feet "behind" a perfect glide path.
const WS_INFLATE_LAG = 300;

function startWingsuit(j, dir) {
  j.ws = true;
  j.wsDir = dir;
  j.wsHeading = dir;
  j.wsPitch = 0;
  j.wsAir = 40;
  j.wsInflate = 0;
  j.wsStalled = false;
  j.faceDir = dir;
  j.smokeTimer = 0;
}

// Where to leave the plane in a wingsuit: far "behind" the target, because
// you're going to glide a long way toward it.
function wingsuitIdealExit(alt, dir) {
  const glide = game.gear ? game.gear.wingsuit.glide : 1.75;
  const drop = Math.max(0, alt - PULL_ALTITUDE);
  const flightTime = drop / (WS_NEUTRAL_AIR / glide);                 // real seconds
  const windDrift = game.wind * flightTime;
  const canopyDrift = game.wind * phys.canopySpeedup * (PULL_ALTITUDE / phys.canopySink);
  // Aim to pull a little short of the spot above the target: it's easy to
  // stretch a glide with a gentle flare, but you can't get distance back.
  const pullPoint = game.targetX - canopyDrift - dir * 500;
  return pullPoint - dir * (drop * glide - WS_INFLATE_LAG) - windDrift;
}

function updateWingsuit(j, dt, wind) {
  const gear = game.gear.wingsuit;
  const realDt = dt * phys.freefallSpeedup; // wingsuit physics runs in real seconds
  j.wsInflate = Math.min(1, j.wsInflate + realDt / WS_INFLATE_TIME);

  // Pitch: ↑ is nose up (flare), ↓ is nose down (dive). Let go to glide normally.
  let pitchInput = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  if (j.wsStalled) pitchInput = 0.7; // in a stall the nose drops by itself
  j.wsPitch = approach(j.wsPitch, pitchInput, dt * 2);

  // Airspeed builds in a dive and bleeds away in a flare.
  const neutral = WS_NEUTRAL_AIR * gear.speed;
  // A full flare slowly bleeds speed below the stall speed: hold it for more
  // than about 3 seconds and you'll stall.
  const targetAir = j.wsPitch >= 0 ? neutral + 80 * j.wsPitch : neutral + 80 * j.wsPitch;
  const settle = j.wsPitch < 0 ? 5 : 2.5;
  j.wsAir += (targetAir - j.wsAir) * (1 - Math.exp(-realDt / settle));

  if (j.wsInflate >= 1 && !j.wsStalled && j.wsAir < WS_STALL_AIR) {
    j.wsStalled = true;
    popup('STALL! The wings stopped flying', '#ff6b6b');
    Sfx.stall();
  } else if (j.wsStalled && j.wsAir > WS_NEUTRAL_AIR * 0.8) {
    j.wsStalled = false;
    popup('Flying again! Easy on the flare', '#8ef');
  }

  // Turning around
  const turnInput = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  if (turnInput !== 0 && turnInput !== j.wsDir && !j.wsStalled) j.wsDir = turnInput;
  j.wsHeading = approach(j.wsHeading, j.wsDir, dt * 0.9 * phys.freefallSpeedup / 3);
  if (Math.abs(j.wsHeading) > 0.2) j.faceDir = Math.sign(j.wsHeading);
  const turning = 1 + 0.6 * (1 - Math.abs(j.wsHeading));

  // Fall rate: airspeed divided by glide ratio. A flare floats you; a dive drops you.
  let sink = (j.wsAir / gear.glide) * (1 + 0.8 * j.wsPitch) * turning;
  if (j.wsStalled) sink = 150;
  sink = Math.max(12, sink);

  // Before the wings fill up you just fall like a normal skydiver.
  const vyTarget = lerp(WS_BELLY_FALL, sink, j.wsInflate) * phys.freefallSpeedup;
  const vxTarget = j.wsAir * j.wsInflate * j.wsHeading * phys.freefallSpeedup + wind;
  j.vy += (vyTarget - j.vy) * ease(dt, 0.35);
  j.vx += (vxTarget - j.vx) * ease(dt, 0.35);
  j.x += j.vx * dt;
  j.alt -= j.vy * dt;

  // Smoke trail from your feet
  j.smokeTimer -= dt;
  if (j.smokeTimer <= 0 && j.wsInflate > 0.5) {
    j.smokeTimer = 0.04;
    const feet = -j.faceDir * 20;
    smokeTrail(j.x + feet, j.alt, (j.paint || paint).suit);
  }
}

// The glide ratio you're flying right now (for the HUD).
function currentGlide(j) {
  const horizontal = Math.abs(j.vx - windNow() * phys.freefallSpeedup);
  return j.vy > 1 ? horizontal / j.vy : 0;
}

// Side view of a wingsuit pilot: a stretched-out body with fabric wings.
function drawWingsuitBody(j) {
  ctx.scale(j.faceDir, 1);
  let tilt = j.wsPitch * 0.35;
  if (j.wsStalled) tilt += Math.sin(game.time * 18) * 0.25; // wobbling in a stall
  ctx.rotate(tilt);
  const spread = 0.4 + 0.6 * j.wsInflate;

  // Wings (drawn first so the body sits on top)
  ctx.fillStyle = paint.suit;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-14, 1);
  ctx.lineTo(-3, 3 + 9 * spread);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 1);
  ctx.lineTo(-25, 1);
  ctx.lineTo(-19, 2 + 5 * spread);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = paint.suitDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-14, 1);
  ctx.lineTo(-3, 3 + 9 * spread);
  ctx.lineTo(10, 0);
  ctx.stroke();

  // Legs, straight back
  ctx.strokeStyle = paint.suitDark;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-24, 0);
  ctx.stroke();

  // Body and parachute container
  ctx.fillStyle = paint.suit;
  roundRect(-9, -4, 21, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = paint.rig;
  roundRect(-6, -7, 13, 4, 2);
  ctx.fill();

  // Head
  ctx.fillStyle = paint.helmet;
  ctx.beginPath();
  ctx.arc(16, -0.5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = paint.visor;
  ctx.beginPath();
  ctx.arc(19, 0.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
}
