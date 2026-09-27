"use strict";

/* =====================================================================
   Coins and the gear shop
   ---------------------------------------------------------------------
   Every jump earns coins (your score ÷ 10, at least 5). Spend them on
   better canopies and wingsuits, or new colors. What you own and what
   you're wearing are saved in this browser.
   ===================================================================== */

const GEAR = {
  canopy: {
    title: 'Canopies',
    items: [
      { id: 'student', name: 'Student canopy', blurb: 'Big, slow and forgiving. Great for learning.', price: 0,
        forward: 1, sink: 1, turn: 1, swoopBonus: 1 },
      { id: 'sport', name: 'Sport canopy', blurb: '20% faster and turns quicker, but comes down a little faster. Swoops ×1.2.', price: 600,
        forward: 1.2, sink: 1.08, turn: 1.3, swoopBonus: 1.2 },
      { id: 'swoop', name: 'Swoop canopy', blurb: 'Built for swooping: 45% faster, swoops are worth 1.5×. Land it carefully!', price: 1800,
        forward: 1.45, sink: 1.2, turn: 1.6, swoopBonus: 1.5 },
    ],
  },
  wingsuit: {
    title: 'Wingsuits',
    items: [
      { id: 'basic', name: 'Beginner wingsuit', blurb: 'Glides 1.75 ft forward for every foot down.', price: 0, glide: 1.75, speed: 1 },
      { id: 'pro', name: 'Pro wingsuit', blurb: 'Glides 2.4 : 1 and flies 10% faster. Reach rings the beginner suit can\'t.', price: 1500, glide: 2.4, speed: 1.1 },
    ],
  },
  suit: {
    title: 'Jumpsuit colors',
    items: [
      { id: 'orange', name: 'Rocket orange', price: 0, paint: DEFAULT_PAINT },
      { id: 'teal', name: 'Deep teal', price: 250,
        paint: { suit: '#2dd4bf', suitDark: '#138a7c', rig: '#1d1d1f', helmet: '#f1f1f1', visor: '#1d1d1f' } },
      { id: 'purple', name: 'Ultraviolet', price: 250,
        paint: { suit: '#8338ec', suitDark: '#5a1fb0', rig: '#ffd166', helmet: '#1d1d1f', visor: '#ff6bd6' } },
      { id: 'stealth', name: 'Stealth black', price: 400,
        paint: { suit: '#2a2d34', suitDark: '#15171b', rig: '#e63946', helmet: '#15171b', visor: '#e63946' } },
      { id: 'gold', name: 'Champion gold', price: 800,
        paint: { suit: '#f5c542', suitDark: '#b8891a', rig: '#1d1d1f', helmet: '#ffffff', visor: '#3a86ff' } },
    ],
  },
  look: {
    title: 'Canopy colors',
    items: [
      { id: 'random', name: 'Surprise me', blurb: 'A different color every jump.', price: 0, colors: null },
      { id: 'classic', name: 'Classic red & white', price: 200, colors: ['#e63946', '#f1faee'] },
      { id: 'ocean', name: 'Ocean', price: 200, colors: ['#118ab2', '#8ecae6'] },
      { id: 'galaxy', name: 'Galaxy', price: 400, colors: ['#3a0ca3', '#f72585'] },
      { id: 'tiger', name: 'Tiger', price: 400, colors: ['#ff7a1a', '#1d1d1f'] },
    ],
  },
};

const DEFAULT_GEAR = {
  owned: ['student', 'basic', 'orange', 'random'],
  canopy: 'student', wingsuit: 'basic', suit: 'orange', look: 'random',
};

function loadGear() {
  const g = storage.get('r88-gear', null);
  if (!g || !Array.isArray(g.owned)) return { ...DEFAULT_GEAR, owned: [...DEFAULT_GEAR.owned] };
  return { ...DEFAULT_GEAR, ...g };
}

let coins = storage.get('r88-coins', 0);
let gearState = loadGear();

function findGear(slot, id) {
  const items = GEAR[slot].items;
  return items.find(i => i.id === id) || items[0];
}

// Called at the start of every jump: put on your gear.
function applyGear() {
  game.gear = {
    canopy: findGear('canopy', gearState.canopy),
    wingsuit: findGear('wingsuit', gearState.wingsuit),
  };
  paint = findGear('suit', gearState.suit).paint;
  const look = findGear('look', gearState.look);
  game.canopyColors = look.colors || CANOPY_COLORS[Math.floor(Math.random() * CANOPY_COLORS.length)];
}

function awardCoins(total) {
  const earned = Math.max(5, Math.round(total / 10));
  coins += earned;
  storage.set('r88-coins', coins);
  return earned;
}

function buyOrEquip(slot, item) {
  const owned = gearState.owned.includes(item.id);
  if (!owned) {
    if (coins < item.price) return;
    coins -= item.price;
    gearState.owned.push(item.id);
    storage.set('r88-coins', coins);
    Sfx.chime(3);
  } else {
    Sfx.click();
  }
  gearState[slot] = item.id;
  storage.set('r88-gear', gearState);
  renderShop();
}

function renderShop() {
  $('#shop-coins').textContent = `🪙 ${fmt(coins)} coins`;
  const wrap = $('#shop-sections');
  wrap.innerHTML = '';
  for (const [slot, group] of Object.entries(GEAR)) {
    const h = document.createElement('h2');
    h.textContent = group.title;
    const list = document.createElement('div');
    list.className = 'choices shop-list';
    for (const item of group.items) {
      const owned = gearState.owned.includes(item.id);
      const equipped = gearState[slot] === item.id;
      const card = document.createElement('div');
      card.className = 'shop-item' + (equipped ? ' equipped' : '');

      const swatch = item.paint || item.colors;
      if (swatch) {
        const s = document.createElement('span');
        s.className = 'swatch';
        const [a, b] = item.paint ? [item.paint.suit, item.paint.rig] : item.colors;
        s.style.background = `linear-gradient(90deg, ${a} 60%, ${b} 60%)`;
        card.appendChild(s);
      }
      const name = document.createElement('span');
      name.className = 'choice-name';
      name.textContent = item.name;
      card.appendChild(name);
      if (item.blurb) {
        const blurb = document.createElement('span');
        blurb.className = 'choice-blurb';
        blurb.textContent = item.blurb;
        card.appendChild(blurb);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shop-btn';
      if (equipped) {
        btn.textContent = 'Equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
      } else {
        btn.textContent = `Buy · 🪙 ${fmt(item.price)}`;
        btn.disabled = coins < item.price;
        if (btn.disabled) btn.title = `You need ${fmt(item.price - coins)} more coins`;
      }
      btn.addEventListener('click', () => buyOrEquip(slot, item));
      card.appendChild(btn);
      list.appendChild(card);
    }
    wrap.append(h, list);
  }
}

function openShop() {
  renderShop();
  ui.menu.classList.add('hidden');
  $('#shop').classList.remove('hidden');
  $('#shop-close').focus();
}

function closeShop() {
  $('#shop').classList.add('hidden');
  ui.menu.classList.remove('hidden');
  refreshMenu();
}
