"use strict";

/* =====================================================================
   Ring course
   ---------------------------------------------------------------------
   In "Ring course" mode, a line of rings appears in the sky when you
   jump, leading down to about 3,500 ft. Fly through them in order!

   - Freefly suit: you fall straight down, so the rings lie flat like
     hoops and you fall through them. Track left/right to line up.
   - Wingsuit: you fly sideways, so the rings stand up like doorways.
     Use nose up/down to hit each ring's height.

   Each ring is worth 150, plus 50 more for every ring in your current
   streak. Get every ring for a "Perfect course" bonus.
   ===================================================================== */

let course = null;

function resetRings() {
  course = null;
}

// Build the course from where you actually left the plane, so it's always reachable.
function onExitRings(j) {
  if (game.mode !== 'rings') return;
  const ws = game.suit === 'wingsuit';
  const exitAlt = j.alt;
  const startAlt = exitAlt - (ws ? 1100 : 700);
  const endAlt = ws ? 3500 : 3700;
  const count = clamp(Math.round((startAlt - endAlt) / (ws ? 900 : 1000)) + 1, 3, 12);
  const spacing = (startAlt - endAlt) / (count - 1);
  const dir = j.wsDir || 1;
  const glide = game.gear.wingsuit.glide;
  const canopyDrift = game.wind * phys.canopySpeedup * (PULL_ALTITUDE / phys.canopySink);
  const aimX = game.targetX - canopyDrift; // where you'd like to be when you pull
  const rings = [];
  // Keep each ring reachable: tracking moves you sideways about 0.45 ft for every
  // foot you fall, so never ask for more than about half of that between rings.
  const maxShift = spacing * 0.22;
  let prevOffset = 0;

  for (let i = 0; i < count; i++) {
    const drop = exitAlt - (startAlt - i * spacing);
    let alt = startAlt - i * spacing;
    let x;
    if (ws) {
      // Along a normal glide path, with the wind pushing you too.
      const seconds = drop / (WS_NEUTRAL_AIR / glide);
      x = j.x + dir * (drop * glide - WS_INFLATE_LAG) + game.wind * seconds;
      if (i > 0) alt += (i % 2 ? 1 : -1) * 100; // make you work the pitch
    } else {
      // Straight down with the wind (that part is free), then an offset you have
      // to track for: drifting toward the target, and zig-zagging a little.
      const seconds = drop / 176;
      const natural = j.x + j.vx * 0.8 + game.wind * seconds;
      let offset = (aimX - natural) * (i / (count - 1)) * 0.5;
      if (i > 0) offset += (i % 2 ? 1 : -1) * Math.min(120, spacing * 0.1);
      offset = clamp(offset, prevOffset - maxShift, prevOffset + maxShift);
      prevOffset = offset;
      x = natural + offset;
    }
    rings.push({ x, alt, r: ws ? 120 : 100, orient: ws ? 'v' : 'h', state: 'ahead', pop: 0 });
  }
  course = { rings, streak: 0, bestStreak: 0, passed: 0, pts: 0, prevX: j.x, prevAlt: j.alt };
  popup(`Ring course! ${count} rings. Fly through them in order`, '#ffd166');
}

function updateRings(dt) {
  if (!course) return;
  for (const r of course.rings) r.pop = Math.max(0, r.pop - dt);
  const j = game.jumper;
  if (game.phase === 'freefall') {
    for (const r of course.rings) {
      if (r.state !== 'ahead') continue;
      let crossed = false;
      let inside = false;
      if (r.orient === 'h') {
        // A flat hoop: did you fall through its height, close enough to its center?
        crossed = course.prevAlt > r.alt && j.alt <= r.alt;
        inside = Math.abs(j.x - r.x) <= r.r;
      } else {
        // A standing ring: did you fly past it sideways, at the right height?
        crossed = Math.sign(course.prevX - r.x) !== Math.sign(j.x - r.x);
        inside = Math.abs(j.alt - r.alt) <= r.r;
        if (!crossed && j.alt < r.alt - r.r - 600) { crossed = true; inside = false; } // flew under it
      }
      if (crossed) {
        if (inside) passRing(r);
        else missRing(r);
      }
    }
  } else if (game.phase === 'canopy' || game.phase === 'landed') {
    // Pulled before the end of the course: the rest count as missed.
    for (const r of course.rings) if (r.state === 'ahead') r.state = 'missed';
  }
  course.prevX = j.x;
  course.prevAlt = j.alt;
}

function passRing(r) {
  r.state = 'passed';
  r.pop = 0.5;
  course.passed++;
  course.streak++;
  course.bestStreak = Math.max(course.bestStreak, course.streak);
  const pts = 150 + 50 * (Math.min(course.streak, 6) - 1);
  course.pts += pts;
  const streakText = course.streak > 1 ? `  streak ×${course.streak}!` : '';
  popup(`Ring ${course.passed}/${course.rings.length} +${pts}${streakText}`, course.streak > 1 ? '#ffd166' : '#fff');
  Sfx.ding(course.streak);
  sparkle(r.x, r.alt);
}

function missRing(r) {
  r.state = 'missed';
  if (course.streak > 1) popup(`Missed a ring. Streak lost!`, '#ffb347');
  else popup('Missed a ring', '#ffb347');
  course.streak = 0;
  Sfx.miss();
}

function ringResults() {
  if (!course) return [];
  const n = course.rings.length;
  const items = [{ label: `Rings: ${course.passed}/${n} (best streak ×${course.bestStreak})`, pts: course.pts }];
  if (course.passed === n) items.push({ label: 'Perfect course! Every single ring', pts: 500 });
  return items;
}

function nextRing() {
  return course && course.rings.find(r => r.state === 'ahead');
}

function drawRings() {
  if (!course) return;
  const scale = game.cam.scale;
  const next = nextRing();
  for (const r of course.rings) {
    const p = toScreen(r.x, r.alt);
    const size = r.r * scale;
    if (p.x < -size - 20 || p.x > W + size + 20 || p.y < -size - 20 || p.y > H + size + 20) continue;
    const grow = 1 + r.pop;
    const rx = (r.orient === 'h' ? size : size * 0.32) * grow;
    const ry = (r.orient === 'h' ? size * 0.3 : size) * grow;
    let color = 'rgba(255, 209, 102, 0.45)';
    if (r === next) color = `rgba(255, 209, 102, ${0.8 + 0.2 * Math.sin(game.time * 8)})`;
    if (r.state === 'passed') color = `rgba(126, 226, 168, ${0.35 + r.pop})`;
    if (r.state === 'missed') color = 'rgba(160, 160, 170, 0.3)';
    ctx.lineWidth = Math.max(2.5, 14 * scale);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(rx, 3), Math.max(ry, 3), 0, 0, Math.PI * 2);
    ctx.stroke();
    if (r === next) {
      // A soft glow so the next ring stands out
      ctx.lineWidth = Math.max(6, 30 * scale);
      ctx.strokeStyle = 'rgba(255, 209, 102, 0.15)';
      ctx.stroke();
    }
  }
}

// Ring counter plus an arrow at the edge of the screen pointing to the next ring.
function drawRingHud(y) {
  if (!course) return y;
  const n = course.rings.length;
  const text = `Rings ${course.passed}/${n}` + (course.streak > 1 ? `  ·  streak ×${course.streak}` : '');
  ctx.textAlign = 'left';
  fitFont(text, 650, 13, W - 32);
  const tw = ctx.measureText(text).width + 24;
  hudPanel(16, y, tw, 28);
  ctx.fillStyle = '#ffd166';
  ctx.fillText(text, 28, y + 19);

  const r = nextRing();
  if (r && game.phase === 'freefall') {
    const p = toScreen(r.x, r.alt);
    const m = 40;
    if (p.x < m || p.x > W - m || p.y < m + 140 || p.y > H - m) {
      const cx = W / 2;
      const cy = H / 2;
      const angle = Math.atan2(p.y - cy, p.x - cx);
      const ex = clamp(p.x, m, W - m);
      const ey = clamp(p.y, m + 140, H - m - 60);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  return y + 36;
}
