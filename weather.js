"use strict";

/* =====================================================================
   Weather
   ---------------------------------------------------------------------
   Each kind of weather changes how the jump looks, and some change how
   it flies too:
     Cloudy – lots of big grey clouds to fall through
     Rain   – stronger, gustier wind, a heavier canopy, and rain streaks
              (in freefall you fall faster than the rain, so it seems to go UP!)
     Fog    – a thick layer near the ground hides the target until you're low
     Sunset – golden light, pink clouds and a glowing sun
   Harder weather earns a bonus.
   ===================================================================== */

const WEATHERS = [
  {
    id: 'clear', name: 'Clear skies', blurb: 'Sunshine and a blue sky.',
    windScale: 1, gustExtra: 0, sinkScale: 1, clouds: 1, bonus: 0, hello: '',
  },
  {
    id: 'cloudy', name: 'Cloudy', blurb: 'Big grey clouds to fall through.',
    windScale: 1.1, gustExtra: 0.05, sinkScale: 1, clouds: 2.5, bonus: 50,
    hello: 'Cloudy today: watch for gaps between the clouds',
  },
  {
    id: 'rain', name: 'Rain', blurb: 'Gusty wind and a heavier canopy. +150 bonus.',
    windScale: 1.3, gustExtra: 0.2, sinkScale: 1.1, clouds: 2, bonus: 150,
    hello: 'Rain and gusts! Your canopy will come down faster',
  },
  {
    id: 'fog', name: 'Fog', blurb: 'A thick fog layer hides the ground until you\'re low. +200 bonus.',
    windScale: 0.8, gustExtra: 0, sinkScale: 1, clouds: 1, bonus: 200, fogTop: 2200,
    hello: 'Fog below 2,200 ft. Trust your instruments!',
  },
  {
    id: 'sunset', name: 'Sunset', blurb: 'Golden light, pink clouds and a glowing sun.',
    windScale: 0.9, gustExtra: 0, sinkScale: 1, clouds: 1.3, bonus: 50,
    hello: 'Sunset jump. Enjoy the view!',
  },
];
const WEATHER_CHOICES = [...WEATHERS, { id: 'random', name: 'Surprise me', blurb: 'Different weather every jump.' }];

function pickWeather(choice) {
  if (choice === 'random') return WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
  return WEATHERS.find(w => w.id === choice) || WEATHERS[0];
}

const raindrops = Array.from({ length: 140 }, () => ({
  x: Math.random(), y: Math.random(), len: 10 + Math.random() * 18,
}));

function updateWeather(dt) {
  const w = game.weather;
  if (!w || w.id !== 'rain' || game.phase === 'menu') return;
  // Rain falls at about 30 ft/s. How fast it moves on screen depends on how fast YOU fall.
  const speedup = game.phase === 'canopy' ? phys.canopySpeedup : phys.freefallSpeedup;
  const viewerFall = game.phase === 'freefall' || game.phase === 'canopy' ? game.jumper.vy : 0;
  let px = (30 * speedup - viewerFall) * game.cam.scale * 2;
  if (Math.abs(px) < 450) px = (Math.sign(px) || 1) * 450;
  const drift = windNow() * speedup * game.cam.scale * 2;
  for (const d of raindrops) {
    d.y += (px * dt) / H;
    d.x += (drift * dt) / W;
    if (d.y > 1.1) d.y -= 1.2;
    if (d.y < -0.1) d.y += 1.2;
    if (d.x > 1.05) d.x -= 1.1;
    if (d.x < -0.05) d.x += 1.1;
  }
  game.rainUp = px < 0;
}

function cloudColor(loc, alpha) {
  const id = game.weather && game.phase !== 'menu' ? game.weather.id : 'clear';
  if (loc.night) return `rgba(170, 180, 230, ${0.2 * alpha})`;
  if (id === 'cloudy' || id === 'rain') return `rgba(196, 202, 212, ${0.92 * alpha})`;
  if (id === 'sunset') return `rgba(255, 196, 180, ${0.85 * alpha})`;
  return `rgba(255, 255, 255, ${0.85 * alpha})`;
}

// Tints drawn right after the sky, behind everything else.
function drawWeatherSky() {
  const w = game.weather;
  if (!w || game.phase === 'menu') return;
  if (w.id === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(43, 29, 79, 0.85)');
    g.addColorStop(0.55, 'rgba(217, 87, 122, 0.7)');
    g.addColorStop(1, 'rgba(255, 179, 107, 0.8)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The sun sits on the horizon, just above the ground.
    const gy = toScreen(0, 0).y;
    const sy = Math.min(gy - 70, H * 0.82);
    const sx = W * 0.78;
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 220);
    glow.addColorStop(0, 'rgba(255, 230, 160, 0.9)');
    glow.addColorStop(1, 'rgba(255, 150, 90, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 220, sy - 220, 440, 440);
    ctx.fillStyle = '#ffe3a3';
    ctx.beginPath();
    ctx.arc(sx, sy, 34, 0, Math.PI * 2);
    ctx.fill();
  } else if (w.id === 'cloudy') {
    ctx.fillStyle = 'rgba(110, 120, 135, 0.3)';
    ctx.fillRect(0, 0, W, H);
  } else if (w.id === 'rain') {
    ctx.fillStyle = 'rgba(55, 65, 85, 0.45)';
    ctx.fillRect(0, 0, W, H);
  }
}

// Drawn on top of the world: rain streaks and the fog layer.
function drawWeatherFront() {
  const w = game.weather;
  if (!w || game.phase === 'menu') return;
  if (w.id === 'rain') {
    ctx.strokeStyle = 'rgba(200, 215, 235, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const slant = clamp(windNow() * 0.02, -0.4, 0.4);
    for (const d of raindrops) {
      const x = d.x * W;
      const y = d.y * H;
      ctx.moveTo(x, y);
      ctx.lineTo(x - slant * d.len, y + d.len);
    }
    ctx.stroke();
  } else if (w.id === 'fog') {
    drawFog(w.fogTop);
  } else if (w.id === 'sunset') {
    ctx.fillStyle = 'rgba(255, 120, 60, 0.08)';
    ctx.fillRect(0, 0, W, H);
  }
}

// Fog gets thicker the farther below you it is, so things far below you
// disappear but things close to you stay visible.
function drawFog(fogTop) {
  const c = game.cam;
  const altAtY = y => c.alt + (H * c.frac - y) / c.scale;
  const fogAlpha = alt => {
    if (alt >= fogTop) return 0;
    const inside = clamp((fogTop - alt) / 400, 0, 1);
    const far = clamp((c.alt - alt) / 1300, 0, 1);
    const haze = c.alt < fogTop ? 0.18 : 0; // a little haze when you're inside it
    return Math.min(0.9, inside * (haze + 0.8 * far));
  };
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i <= 10; i++) {
    const y = (H * i) / 10;
    g.addColorStop(i / 10, `rgba(225, 230, 236, ${fogAlpha(altAtY(y))})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function weatherResults() {
  const w = game.weather;
  if (!w || !w.bonus) return [];
  return [{ label: `${w.name} jump bonus`, pts: w.bonus }];
}
