"use strict";

/* =====================================================================
   Juice: the little extras that make a game feel good
   ---------------------------------------------------------------------
   - Screen shake on big impacts (hard openings, hard landings).
   - Particles: small dots that fly out, fade, and disappear. Sparkles for
     rings, confetti for great landings, dust when you touch down, and the
     smoke trail wingsuit pilots fly with.

   Particles live in the game world (feet), so they stay put in the sky
   while the camera moves past them.
   ===================================================================== */

let shakeAmount = 0;   // pixels; fades out on its own
let particles = [];
const MAX_PARTICLES = 700;

function resetJuice() {
  shakeAmount = 0;
  particles = [];
}

function shake(pixels) {
  shakeAmount = Math.max(shakeAmount, pixels);
}

function applyShake() {
  if (shakeAmount < 0.3) return;
  ctx.translate((Math.random() - 0.5) * shakeAmount * 2, (Math.random() - 0.5) * shakeAmount * 2);
}

// Add one particle. Speeds are in feet per second of game time, `life` in seconds.
// `sizeFt` makes a particle grow and shrink with the camera zoom (smoke);
// otherwise `size` is in pixels (sparkles, confetti).
function addParticle(p) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({
    vx: 0, vy: 0, gravity: 0, drag: 0, size: 3, sizeFt: 0, layer: 'front',
    shape: 'dot', spin: 0, angle: 0, age: 0,
    ...p,
  });
}

function sparkle(x, alt, color = '#ffd166', count = 24) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 150 + Math.random() * 350;
    addParticle({
      x, alt, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      drag: 2.5, life: 0.6 + Math.random() * 0.5, color, size: 2 + Math.random() * 2.5, shape: 'star',
    });
  }
}

function confetti(x, alt, count = 60) {
  const colors = ['#ffd166', '#e63946', '#06d6a0', '#118ab2', '#ff7a1a', '#ffffff'];
  for (let i = 0; i < count; i++) {
    addParticle({
      x, alt: alt + 20,
      vx: (Math.random() - 0.5) * 160, vy: 120 + Math.random() * 180,
      gravity: -260, drag: 1.2, life: 1.6 + Math.random(),
      color: colors[i % colors.length], size: 3 + Math.random() * 3,
      shape: 'rect', spin: (Math.random() - 0.5) * 12,
    });
  }
}

// A soft cloud of dust or air.
function puff(x, alt, color = '#d9c9a3', count = 14) {
  for (let i = 0; i < count; i++) {
    addParticle({
      x: x + (Math.random() - 0.5) * 20, alt: alt + Math.random() * 6,
      vx: (Math.random() - 0.5) * 120, vy: Math.random() * 40,
      drag: 2, life: 0.8 + Math.random() * 0.6, color, sizeFt: 6 + Math.random() * 6, layer: 'back',
    });
  }
}

// Wingsuit pilots often fly with smoke on their feet so people can see them.
function smokeTrail(x, alt, color) {
  addParticle({
    x: x + (Math.random() - 0.5) * 6, alt: alt + (Math.random() - 0.5) * 6,
    drag: 0.5, life: 3.5, color, sizeFt: 10, layer: 'back', grow: 2.5,
  });
}

function updateJuice(dt) {
  shakeAmount *= Math.exp(-dt * 7);
  for (const p of particles) {
    p.age += dt;
    p.vy += p.gravity * dt;
    const keep = Math.exp(-p.drag * dt);
    p.vx *= keep;
    p.vy *= keep;
    p.x += p.vx * dt;
    p.alt += p.vy * dt;
    p.angle += p.spin * dt;
  }
  particles = particles.filter(p => p.age < p.life);
}

function drawParticles(layer) {
  for (const p of particles) {
    if (p.layer !== layer) continue;
    const s = toScreen(p.x, p.alt);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
    const t = p.age / p.life;
    ctx.globalAlpha = (1 - t) * (p.sizeFt ? 0.55 : 1);
    ctx.fillStyle = p.color;
    const size = p.sizeFt ? Math.max(1.5, p.sizeFt * game.cam.scale * (1 + (p.grow || 0) * t)) : p.size;
    if (p.shape === 'rect') {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(p.angle);
      ctx.fillRect(-size / 2, -size / 4, size, size / 2);
      ctx.restore();
    } else if (p.shape === 'star') {
      ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
      ctx.fillRect(s.x - size * 1.5, s.y - 0.5, size * 3, 1);
      ctx.fillRect(s.x - 0.5, s.y - size * 1.5, 1, size * 3);
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// Called once when you touch down: sound, shake and particles to match the landing.
function landingJuice(j, items) {
  const great = items.some(it => /Dead center|Swoop landing|Perfect course|Formation complete/.test(it.label));
  Sfx.landing(j.landStyle);
  if (j.landStyle === 'splash') {
    puff(j.x, 0, '#bfe6ff', 30);
    shake(6);
  } else if (j.landStyle === 'plf') {
    puff(j.x, 0, game.location.groundTop, 22);
    shake(10);
  } else {
    puff(j.x, 0, game.location.groundTop, 12);
  }
  if (great) {
    confetti(j.x, 0);
    setTimeout(() => Sfx.fanfare(), 250);
  }
}
