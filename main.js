"use strict";

/* =====================================================================
   Start-up
   ---------------------------------------------------------------------
   This file loads last, after every other part of the game exists.
   It restores your last menu choices, builds the menus, hooks up the
   shop and mute buttons, and starts the game loop.
   ===================================================================== */

const prefs = storage.get('r88-prefs', {});
game.location = LOCATIONS.find(l => l.id === prefs.location) || LOCATIONS[0];
game.aircraft = AIRCRAFT.find(a => a.id === prefs.aircraft) || AIRCRAFT[1];
game.mode = MODES.some(m => m.id === prefs.mode) ? prefs.mode : 'target';
game.suit = SUITS.some(s => s.id === prefs.suit) ? prefs.suit : 'belly';
game.weatherChoice = WEATHER_CHOICES.some(w => w.id === prefs.weather) ? prefs.weather : 'clear';
game.climb = CLIMBS.some(c => c.id === prefs.climb) ? prefs.climb : 'ride';
game.speed = SPEEDS.some(s => s.id === prefs.speed) ? prefs.speed : 'arcade';

renderChoices(ui.locations, LOCATIONS, item => {
  game.location = item;
  game.scenery = makeScenery(item);
});
renderChoices(ui.aircraft, AIRCRAFT, item => { game.aircraft = item; });
renderChoices(ui.modes, MODES, item => { game.mode = item.id; });
renderChoices(ui.suits, SUITS, item => { game.suit = item.id; });
renderChoices(ui.weathers, WEATHER_CHOICES, item => { game.weatherChoice = item.id; });
renderChoices(ui.climbs, CLIMBS, item => { game.climb = item.id; });
renderChoices(ui.speeds, SPEEDS, item => { game.speed = item.id; });

// Gear shop
$('#shop-btn').addEventListener('click', openShop);
$('#shop-close').addEventListener('click', closeShop);
$('#results-shop-btn').addEventListener('click', () => {
  showMenu();
  openShop();
});

// Mute: the button in the corner, or press M.
function syncMuteButton() {
  const btn = $('#mute-btn');
  btn.textContent = Sfx.muted ? '🔇' : '🔊';
  btn.setAttribute('aria-label', Sfx.muted ? 'Turn sound on' : 'Mute sound');
  btn.setAttribute('aria-pressed', Sfx.muted);
}
$('#mute-btn').addEventListener('click', () => {
  Sfx.unlock();
  Sfx.toggleMute();
  syncMuteButton();
});
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !$('#shop').classList.contains('hidden')) closeShop();
  if (e.code === 'KeyM' && !e.repeat) {
    Sfx.unlock();
    Sfx.toggleMute();
    syncMuteButton();
  }
});
syncMuteButton();

// A soft click on every menu button
document.addEventListener('click', e => {
  if (e.target.closest('.choice, button.big, button.secondary')) Sfx.click();
});

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
