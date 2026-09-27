"use strict";

/* =====================================================================
   Sound effects
   ---------------------------------------------------------------------
   Every sound is made on the fly with the Web Audio API: no sound files.
   There are two kinds:
     - Loops that play the whole time and just get louder or quieter:
       wind, the plane's engine, rain and the balloon burner.
     - One-shots for events: beeps, chimes, the canopy opening, landings.

   Browsers only allow sound after the player clicks or presses a key,
   so nothing plays until Sfx.unlock() runs.
   Press M to mute.
   ===================================================================== */

const Sfx = (() => {
  let ac = null;       // the AudioContext
  let master = null;   // everything goes through this, so mute is one knob
  let loops = null;
  let muted = storage.get('r88-muted', false);

  // A couple of seconds of random noise, reused for wind, rain and whooshes.
  function noiseBuffer() {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noiseLoop(filterType, freq) {
    const src = ac.createBufferSource();
    src.buffer = loops.noise;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return { filter, gain };
  }

  function unlock() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // very old browser: the game just stays silent
    try {
      ac = new AC();
    } catch {
      return;
    }
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ac.destination);
    loops = { noise: noiseBuffer() };
    loops.wind = noiseLoop('lowpass', 600);
    loops.rain = noiseLoop('highpass', 3000);
    loops.burner = noiseLoop('lowpass', 900);

    // The engine: two slightly out-of-tune buzzes, muffled by a filter.
    const engineGain = ac.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ac.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineFilter.connect(engineGain).connect(master);
    const oscs = [55, 55.7].map(f => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(engineFilter);
      o.start();
      return o;
    });
    loops.engine = { gain: engineGain, filter: engineFilter, oscs };
  }

  // Glide a sound setting toward a value instead of jumping (no clicks).
  function glide(param, value, time = 0.15) {
    param.setTargetAtTime(value, ac.currentTime, time);
  }

  // Called every frame: set loop volumes from what's happening in the game.
  function update(g) {
    if (!ac) return;
    let wind = 0;
    let windFreq = 500;
    let engine = 0;
    let engineRev = 1;
    let burner = 0;
    const playing = !['menu', 'landed'].includes(g.phase);
    if (g.phase === 'freefall') {
      const speed = clamp(g.jumper.vy / (phys.terminal * 1.35), 0, 1);
      const sideways = clamp(Math.abs(g.jumper.vx) / (phys.freefallSpeedup * 200), 0, 1);
      const rush = Math.max(speed, sideways);
      wind = 0.08 + 0.32 * rush;
      windFreq = 350 + 1500 * rush;
    } else if (g.phase === 'canopy') {
      wind = 0.05;
      windFreq = 400;
    } else if (g.phase === 'plane' || g.phase === 'pilot') {
      wind = 0.04;
      if (g.aircraft.kind === 'balloon') {
        burner = g.plane.burning ? 0.35 : 0;
      } else {
        const throttle = g.phase === 'plane' ? 1 : g.plane.throttle;
        engine = 0.05 + 0.13 * throttle;
        engineRev = 1 + (g.plane.speed || 0) / Math.max(1, g.aircraft.speed);
      }
    }
    // The engine fades away as the plane flies off after you jump.
    if (['freefall', 'canopy'].includes(g.phase) && g.aircraft.kind !== 'balloon') {
      const dist = Math.hypot(g.plane.x - g.jumper.x, g.plane.alt - g.jumper.alt);
      engine = 0.12 * clamp(1 - dist / 4000, 0, 1);
    }
    const rain = playing && g.weather && g.weather.id === 'rain' ? 0.12 : 0;
    glide(loops.wind.gain.gain, playing ? wind : 0);
    glide(loops.wind.filter.frequency, windFreq);
    glide(loops.engine.gain.gain, playing ? engine : 0, 0.3);
    loops.engine.oscs[0].frequency.setTargetAtTime(55 * engineRev, ac.currentTime, 0.3);
    loops.engine.oscs[1].frequency.setTargetAtTime(55.7 * engineRev, ac.currentTime, 0.3);
    glide(loops.rain.gain.gain, rain, 0.5);
    glide(loops.burner.gain.gain, burner, 0.08);
  }

  // A simple beep: one tone that fades out.
  function tone(freq, start, duration, type = 'sine', volume = 0.25) {
    if (!ac) return;
    const t = ac.currentTime + start;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  // A burst of filtered noise that sweeps from one pitch to another.
  function noiseBurst(fromFreq, toFreq, duration, volume = 0.4, type = 'bandpass') {
    if (!ac) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = loops.noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(fromFreq, t);
    f.frequency.exponentialRampToValueAtTime(toFreq, t + duration);
    const g = ac.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  // A low "boom" that drops in pitch, for impacts.
  function thump(volume = 0.5, freq = 120) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  }

  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5]; // C major-ish

  return {
    unlock,
    update,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      storage.set('r88-muted', muted);
      if (master) glide(master.gain, muted ? 0 : 0.8, 0.05);
      return muted;
    },
    // Altimeter beeps: `count` short beeps. `urgent` is higher and harsher.
    beep(count = 1, urgent = false) {
      for (let i = 0; i < count; i++) tone(urgent ? 2200 : 1600, i * 0.14, 0.09, urgent ? 'square' : 'sine', urgent ? 0.12 : 0.18);
    },
    // Trick landed: a rising little tune, higher for bigger combos.
    chime(combo = 1) {
      const start = Math.min(combo - 1, 4);
      [0, 2, 4].forEach((n, i) => tone(NOTES[start + n] || 1318.5, i * 0.07, 0.25, 'triangle', 0.18));
    },
    // Ring passed: pitch climbs with your streak.
    ding(streak = 1) {
      const f = NOTES[Math.min(streak - 1, NOTES.length - 1)] * 2;
      tone(f, 0, 0.35, 'sine', 0.25);
      tone(f * 1.5, 0.05, 0.3, 'sine', 0.1);
    },
    miss() {
      tone(220, 0, 0.25, 'sawtooth', 0.08);
    },
    dock() {
      tone(900, 0, 0.05, 'square', 0.1);
      tone(1318.5, 0.06, 0.3, 'triangle', 0.2);
    },
    whoosh(volume = 0.4) {
      noiseBurst(300, 2500, 0.5, volume);
    },
    canopyOpen() {
      noiseBurst(2500, 200, 0.7, 0.5);
      setTimeout(() => thump(0.6, 150), 350);
    },
    landing(style) {
      if (style === 'splash') {
        noiseBurst(1500, 300, 0.8, 0.5, 'lowpass');
      } else if (style === 'plf') {
        thump(0.7, 90);
        noiseBurst(600, 200, 0.3, 0.3, 'lowpass');
      } else {
        thump(0.35, 160);
      }
    },
    // Big moment: bullseye, swoop, perfect ring course.
    fanfare() {
      [0, 2, 4, 7].forEach((n, i) => tone(NOTES[n] || 1046.5, i * 0.12, 0.4, 'triangle', 0.2));
      tone(NOTES[7], 0.5, 0.8, 'triangle', 0.22);
    },
    stall() {
      tone(160, 0, 0.3, 'square', 0.1);
    },
    click() {
      tone(1200, 0, 0.04, 'square', 0.05);
    },
  };
})();

// Browsers need a click or key press before any sound can play.
window.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
window.addEventListener('keydown', () => Sfx.unlock(), { once: true });

// Altimeter: beep at 4,500 ft, double at 3,500 ft, then keep beeping from
// 3,000 ft until you pull. Real skydivers wear one of these in their helmet.
let lastBeepAlt = Infinity;
let nextUrgentBeep = 0;
function updateAltimeterBeeps() {
  if (game.phase !== 'freefall') {
    lastBeepAlt = Infinity;
    return;
  }
  const alt = game.jumper.alt;
  if (lastBeepAlt > 4500 && alt <= 4500) Sfx.beep(1);
  if (lastBeepAlt > 3500 && alt <= 3500) Sfx.beep(2);
  if (alt <= PULL_ALTITUDE && game.time >= nextUrgentBeep) {
    Sfx.beep(3, true);
    nextUrgentBeep = game.time + 0.6;
  }
  lastBeepAlt = alt;
}
