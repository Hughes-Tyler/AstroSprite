/**
 * AstroSprite — 8-bit Astronaut Chrome Extension
 * Bounces around the viewport. Periodically an asteroid spawns; the astronaut
 * seeks it, mines it, and resumes bouncing until the next one appears.
 * Left-click + drag  →  move the astronaut
 * Right-click        →  dismiss for this page
 */

// ── Sprite pixel art ──────────────────────────────────────────────────────────
const COLORS = {
  B: '#111111', W: '#EEEEFF', V: '#66BBEE',
  Y: '#FFD700', R: '#CC3333', G: '#999999',
};

const FRAMES = [
  [ // Frame 0 — legs together
    '....BBBBB....',
    '...BWWWWWB...',
    '..BWWWWWWWB..',
    '..BYYYYYYYB..',
    '..BWVVVVVWB..',
    '..BWVVVVVWB..',
    '..BYYYYYYYB..',
    '..BWWWWWWWB..',
    '.BWWWWWWWWWB.',
    '.BWWRRRRRWWB.',
    '.BWWWWWWWWWB.',
    '..BGWWWWWGB..',
    '..BBWWWWWBB..',
    '...BW...WB...',
    '...BW...WB...',
    '....B...B....',
  ],
  [ // Frame 1 — legs spread
    '....BBBBB....',
    '...BWWWWWB...',
    '..BWWWWWWWB..',
    '..BYYYYYYYB..',
    '..BWVVVVVWB..',
    '..BWVVVVVWB..',
    '..BYYYYYYYB..',
    '..BWWWWWWWB..',
    '.BWWWWWWWWWB.',
    '.BWWRRRRRWWB.',
    '.BWWWWWWWWWB.',
    '..BGWWWWWGB..',
    '..BBWWWWWBB..',
    '..BWW...WWB..',
    '.BBW.....WBB.',
    '..B.......B..',
  ],
];

// ── Asteroid pixel art ────────────────────────────────────────────────────────
const ASTEROID_COLORS = {
  B: '#111111',
  G: '#888888',
  D: '#555555',
  L: '#BBBBBB',
};

const ASTEROID_FRAME = [
  '....BBBB....',
  '...BLGGGBB..',
  '..BGGGDGGGB.',
  '.BGGGGGGGGBB',
  'BGGDGGGGGGGB',
  'BGGGGGDGGGGB',
  '.BGGGGGGDGB.',
  '..BGDGGGGB..',
  '...BGGGGB...',
  '....BBBB....',
];

// ── Rocket pixel art ──────────────────────────────────────────────────────────
const ROCKET_COLORS = {
  B: '#111111', W: '#EEEEFF', R: '#CC3333',
  V: '#66BBEE', G: '#888888', S: '#CCCCCC',
};

const ROCKET_FRAME = [
  '.....RR.....',
  '....BRRB....',
  '...BWWWWB...',
  '...BWVVWB...',
  '...BWVVWB...',
  '...BWWWWB...',
  '...BWWWWB...',
  '...BWWWWB...',
  '...BWWWWB...',
  '...BWWWWB...',
  '..BBBWWBBB..',
  '.BGGBWWBGGB.',
  'BGGGBWWBGGGB',
  'BGGGBWWBGGGB',
  '.BGGGWWGGGB.',
  '..BSSSSSSB..',
  '...BSSSSB...',
  '....BBBB....',
];

// ── Launch pad pixel art ───────────────────────────────────────────────────────
const LAUNCHPAD_COLORS = {
  B: '#111111', S: '#AAAAAA', Y: '#FFD700', G: '#666666',
};

const LAUNCHPAD_FRAME = [
  '..BBBBBBBBBBBBBBBB..',
  '.BSSSSSSSSSSSSSSSSB.',
  'BSSYYYYSSSSSSYYYYSSB',
  'BSSYYYYSSSSSSYYYYSSB',
  '.BGGGGGGGGGGGGGGGGB.',
  'BBBBBBBBBBBBBBBBBBBB',
];

// ── Config ────────────────────────────────────────────────────────────────────
const PIXEL_SIZE      = 5;
const ASTEROID_PIXEL  = 4;
const ROCKET_PIXEL    = 5;
const LAUNCHPAD_PIXEL = 5;
const FPS_DELAY       = 60;

const SPEED           = 2.5;   // px/tick while bouncing
const SEEK_SPEED      = 3.2;   // px/tick while seeking

const SPAWN_MIN       = 400;   // ticks before first / next asteroid (~24 s)
const SPAWN_MAX       = 800;   // ticks (~48 s)
const MINING_DURATION = 100;   // ticks spent mining (~6 s)
const MINE_RADIUS     = 55;    // px center-to-center to trigger mining

const SPRITE_COLS  = FRAMES[0][0].length;
const SPRITE_ROWS  = FRAMES[0].length;
const CANVAS_W     = SPRITE_COLS * PIXEL_SIZE;
const CANVAS_H     = SPRITE_ROWS * PIXEL_SIZE;

const ASTEROID_COLS = ASTEROID_FRAME[0].length;
const ASTEROID_ROWS = ASTEROID_FRAME.length;
const ASTEROID_W    = ASTEROID_COLS * ASTEROID_PIXEL;
const ASTEROID_H    = ASTEROID_ROWS * ASTEROID_PIXEL;

const ROCKET_COLS    = ROCKET_FRAME[0].length;
const ROCKET_ROWS    = ROCKET_FRAME.length;
const ROCKET_W       = ROCKET_COLS * ROCKET_PIXEL;
const ROCKET_H       = ROCKET_ROWS * ROCKET_PIXEL;

const LAUNCHPAD_COLS = LAUNCHPAD_FRAME[0].length;
const LAUNCHPAD_ROWS = LAUNCHPAD_FRAME.length;
const LAUNCHPAD_W    = LAUNCHPAD_COLS * LAUNCHPAD_PIXEL;
const LAUNCHPAD_H    = LAUNCHPAD_ROWS * LAUNCHPAD_PIXEL;

const WALL_ANGLE = { bottom: 0, right: 90, top: 180, left: 270 };

const S_BOUNCING = 'BOUNCING';
const S_SEEKING  = 'SEEKING';
const S_MINING   = 'MINING';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
class Asteroid {
  constructor(avoidX, avoidY) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Pick a position away from screen edges and the astronaut
    let x, y, attempts = 0;
    do {
      x = randInt(100, vw - ASTEROID_W - 100);
      y = randInt(100, vh - ASTEROID_H - 100);
      attempts++;
    } while (
      attempts < 20 &&
      Math.hypot(x + ASTEROID_W / 2 - avoidX, y + ASTEROID_H / 2 - avoidY) < 200
    );

    this.x = x;
    this.y = y;

    this.el = document.createElement('canvas');
    this.el.width  = ASTEROID_W;
    this.el.height = ASTEROID_H;
    Object.assign(this.el.style, {
      position:       'fixed',
      left:           `${x}px`,
      top:            `${y}px`,
      zIndex:         '2147483646',
      imageRendering: 'pixelated',
      pointerEvents:  'none',
    });
    document.body.appendChild(this.el);
    this._draw();
  }

  _draw() {
    const ctx = this.el.getContext('2d');
    for (let r = 0; r < ASTEROID_ROWS; r++) {
      const row = ASTEROID_FRAME[r];
      for (let c = 0; c < ASTEROID_COLS; c++) {
        const color = ASTEROID_COLORS[row[c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * ASTEROID_PIXEL, r * ASTEROID_PIXEL, ASTEROID_PIXEL, ASTEROID_PIXEL);
      }
    }
  }

  // Explode and remove — rock chunks fly outward
  burst() {
    const cx = this.x + ASTEROID_W / 2;
    const cy = this.y + ASTEROID_H / 2;
    const chipColors = ['#888888', '#666666', '#AAAAAA', '#555555', '#999999'];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 2 * Math.PI + Math.random() * 0.4;
      const dist  = 25 + Math.random() * 35;
      const el    = document.createElement('span');
      el.textContent = ['·', '•', '▪', '▫'][randInt(0, 3)];
      Object.assign(el.style, {
        position:      'fixed',
        left:          `${cx}px`,
        top:           `${cy}px`,
        color:         chipColors[randInt(0, chipColors.length - 1)],
        fontSize:      `${6 + Math.random() * 7}px`,
        pointerEvents: 'none',
        zIndex:        '2147483646',
        transition:    'opacity 0.7s ease-out, transform 0.7s ease-out',
        opacity:       '1',
        userSelect:    'none',
        fontFamily:    'sans-serif',
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity   = '0';
        el.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
      });
      setTimeout(() => el.remove(), 750);
    }
    this.el.remove();
  }
}

// ── Rocket + Launch Pad ───────────────────────────────────────────────────────
class Rocket {
  constructor() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    this.x      = Math.round((vw - ROCKET_W) / 2);
    this.y      = vh - LAUNCHPAD_H - ROCKET_H;
    this.width  = ROCKET_W;
    this.height = ROCKET_H;

    this._rocketEl = document.createElement('canvas');
    this._rocketEl.width  = ROCKET_W;
    this._rocketEl.height = ROCKET_H;
    Object.assign(this._rocketEl.style, {
      position:       'fixed',
      left:           `${this.x}px`,
      top:            `${this.y}px`,
      zIndex:         '2147483645',
      imageRendering: 'pixelated',
      pointerEvents:  'none',
    });
    document.body.appendChild(this._rocketEl);
    this._drawRocket();

    const padX = Math.round((vw - LAUNCHPAD_W) / 2);
    const padY = vh - LAUNCHPAD_H;
    this._padEl = document.createElement('canvas');
    this._padEl.width  = LAUNCHPAD_W;
    this._padEl.height = LAUNCHPAD_H;
    Object.assign(this._padEl.style, {
      position:       'fixed',
      left:           `${padX}px`,
      top:            `${padY}px`,
      zIndex:         '2147483645',
      imageRendering: 'pixelated',
      pointerEvents:  'none',
    });
    document.body.appendChild(this._padEl);
    this._drawPad();
  }

  // Center of rocket body — for astronaut targeting later
  get cx() { return this.x + ROCKET_W / 2; }
  get cy() { return this.y + ROCKET_H / 2; }

  _drawRocket() {
    const ctx = this._rocketEl.getContext('2d');
    for (let r = 0; r < ROCKET_ROWS; r++) {
      const row = ROCKET_FRAME[r];
      for (let c = 0; c < ROCKET_COLS; c++) {
        const color = ROCKET_COLORS[row[c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * ROCKET_PIXEL, r * ROCKET_PIXEL, ROCKET_PIXEL, ROCKET_PIXEL);
      }
    }
  }

  _drawPad() {
    const ctx = this._padEl.getContext('2d');
    for (let r = 0; r < LAUNCHPAD_ROWS; r++) {
      const row = LAUNCHPAD_FRAME[r];
      for (let c = 0; c < LAUNCHPAD_COLS; c++) {
        const color = LAUNCHPAD_COLORS[row[c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * LAUNCHPAD_PIXEL, r * LAUNCHPAD_PIXEL, LAUNCHPAD_PIXEL, LAUNCHPAD_PIXEL);
      }
    }
  }

  remove() {
    this._rocketEl.remove();
    this._padEl.remove();
  }
}

// ── Desktop Pet ───────────────────────────────────────────────────────────────
class DesktopPet {
  constructor(rocket) {
    this.rocket = rocket;
    this.canvas        = document.createElement('canvas');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    Object.assign(this.canvas.style, {
      position:        'fixed',
      zIndex:          '2147483647',
      left:            '0px',
      top:             '0px',
      cursor:          'grab',
      imageRendering:  'pixelated',
      transformOrigin: 'center center',
    });
    this.ctx = this.canvas.getContext('2d');
    document.body.appendChild(this.canvas);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Start at bottom wall, center of screen
    this.x = (vw - CANVAS_W) / 2;
    this.y = vh - CANVAS_H;

    const angle = (Math.random() * 50 + 20) * Math.PI / 180;
    this.vx = SPEED * Math.cos(angle) * (Math.random() < 0.5 ? 1 : -1);
    this.vy = -SPEED * Math.sin(angle);

    this.spriteAngle = 0;
    this.bobPhase    = 0;
    this.frameIdx    = 0;

    this.state          = S_BOUNCING;
    this.asteroid       = null;
    this.miningTicks    = 0;
    this.nextAsteroidIn = randInt(SPAWN_MIN, SPAWN_MAX);
    this._chipCd        = 0;
    this.mineCount      = 0;

    this._dragging = false;
    this._dragOx   = 0;
    this._dragOy   = 0;

    this._tally = document.createElement('div');
    Object.assign(this._tally.style, {
      position:   'fixed',
      bottom:     '12px',
      right:      '14px',
      zIndex:     '2147483647',
      fontFamily: '"Courier New", monospace',
      fontSize:   '13px',
      color:      '#FFD700',
      textShadow: '0 0 4px #000, 1px 1px 0 #000',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    this._tally.textContent = '☄ 0 mined';
    document.body.appendChild(this._tally);

    this._bindEvents();
    this._updatePosition();
    this._step();
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _step() {
    if (!document.body.contains(this.canvas)) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!this._dragging) {
      if (this.state === S_BOUNCING) {
        this._physicsBounce(vw, vh);
        this.nextAsteroidIn--;
        if (this.nextAsteroidIn <= 0) this._spawnAsteroid();

      } else if (this.state === S_SEEKING) {
        this._physicsSeek(vw, vh);
        const ax   = this.asteroid.x + ASTEROID_W / 2;
        const ay   = this.asteroid.y + ASTEROID_H / 2;
        const dist = Math.hypot((this.x + CANVAS_W / 2) - ax, (this.y + CANVAS_H / 2) - ay);
        if (dist < MINE_RADIUS) this._startMining();

      } else if (this.state === S_MINING) {
        this._physicsMining();
      }
    }

    // Legs animate faster during mining
    this.bobPhase += this.state === S_MINING ? 0.14 : 0.07;
    this.frameIdx  = Math.cos(this.bobPhase) > 0 ? 0 : 1;

    this._updatePosition();
    this._draw();
    setTimeout(() => this._step(), FPS_DELAY);
  }

  // ── Physics modes ─────────────────────────────────────────────────────────
  _physicsBounce(vw, vh) {
    this.x += this.vx;
    this.y += this.vy;
    this._wallBounce(vw, vh);
  }

  _physicsSeek(vw, vh) {
    // Gradually steer toward asteroid center
    const ax = this.asteroid.x + ASTEROID_W / 2;
    const ay = this.asteroid.y + ASTEROID_H / 2;
    const dx = ax - (this.x + CANVAS_W / 2);
    const dy = ay - (this.y + CANVAS_H / 2);
    const d  = Math.hypot(dx, dy) || 1;

    this.vx += (dx / d) * 0.25;
    this.vy += (dy / d) * 0.25;
    const spd = Math.hypot(this.vx, this.vy) || 1;
    this.vx   = (this.vx / spd) * SEEK_SPEED;
    this.vy   = (this.vy / spd) * SEEK_SPEED;

    this.x += this.vx;
    this.y += this.vy;
    this._wallBounce(vw, vh);
  }

  _physicsMining() {
    this.miningTicks--;

    // Wobble toward/away from asteroid (drilling motion)
    const ax     = this.asteroid.x + ASTEROID_W / 2;
    const ay     = this.asteroid.y + ASTEROID_H / 2;
    const dx     = ax - (this.x + CANVAS_W / 2);
    const dy     = ay - (this.y + CANVAS_H / 2);
    const d      = Math.hypot(dx, dy) || 1;
    const wobble = Math.sin(this.miningTicks * 0.4) * 1.2;
    this.x += (dx / d) * wobble;
    this.y += (dy / d) * wobble;

    // Spawn rock chips periodically
    if (this._chipCd <= 0) { this._spawnChip(); this._chipCd = 8; }
    this._chipCd--;

    if (this.miningTicks <= 0) this._finishMining();
  }

  // Reflect off viewport edges; update spriteAngle so feet face the wall hit
  _wallBounce(vw, vh) {
    if (this.y + CANVAS_H >= vh) {
      this.y = vh - CANVAS_H; this.vy = -Math.abs(this.vy);
      this.spriteAngle = WALL_ANGLE.bottom;
    } else if (this.y <= 0) {
      this.y = 0; this.vy = Math.abs(this.vy);
      this.spriteAngle = WALL_ANGLE.top;
    }
    if (this.x + CANVAS_W >= vw) {
      this.x = vw - CANVAS_W; this.vx = -Math.abs(this.vx);
    } else if (this.x <= 0) {
      this.x = 0; this.vx = Math.abs(this.vx);
    }
  }

  // ── Asteroid lifecycle ────────────────────────────────────────────────────
  _spawnAsteroid() {
    const cx      = this.x + CANVAS_W / 2;
    const cy      = this.y + CANVAS_H / 2;
    this.asteroid = new Asteroid(cx, cy);
    this.state    = S_SEEKING;
  }

  _startMining() {
    this.state       = S_MINING;
    this.miningTicks = MINING_DURATION;
    this.vx          = 0;
    this.vy          = 0;

    // Orient feet toward the asteroid so he looks like he's standing on it
    const ax       = this.asteroid.x + ASTEROID_W / 2;
    const ay       = this.asteroid.y + ASTEROID_H / 2;
    const dx       = ax - (this.x + CANVAS_W / 2);
    const dy       = ay - (this.y + CANVAS_H / 2);
    const atan2Deg = Math.atan2(dy, dx) * 180 / Math.PI;
    this.spriteAngle = ((90 - atan2Deg) % 360 + 360) % 360;
  }

  _finishMining() {
    this.asteroid.burst();
    this.asteroid       = null;
    this.state          = S_BOUNCING;
    this.nextAsteroidIn = randInt(SPAWN_MIN, SPAWN_MAX);
    this.mineCount++;
    this._tally.textContent = `☄ ${this.mineCount} mined`;

    // Kick off in a random direction
    const a  = Math.random() * 2 * Math.PI;
    this.vx  = Math.cos(a) * SPEED;
    this.vy  = Math.sin(a) * SPEED;
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  _spawnChip() {
    if (!this.asteroid) return;
    const cx     = this.asteroid.x + ASTEROID_W / 2;
    const cy     = this.asteroid.y + ASTEROID_H / 2;
    const colors = ['#888888', '#666666', '#AAAAAA', '#555555'];
    const angle  = Math.random() * 2 * Math.PI;
    const dist   = 12 + Math.random() * 18;
    const el     = document.createElement('span');
    el.textContent = ['·', '•', '▪'][randInt(0, 2)];
    Object.assign(el.style, {
      position:      'fixed',
      left:          `${cx}px`,
      top:           `${cy}px`,
      color:         colors[randInt(0, colors.length - 1)],
      fontSize:      `${5 + Math.random() * 5}px`,
      pointerEvents: 'none',
      zIndex:        '2147483646',
      transition:    'opacity 0.5s ease-out, transform 0.5s ease-out',
      opacity:       '1',
      userSelect:    'none',
      fontFamily:    'sans-serif',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity   = '0';
      el.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px)`;
    });
    setTimeout(() => el.remove(), 550);
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const ctx   = this.ctx;
    const frame = FRAMES[this.frameIdx];
    const flipX = this.vx < 0;

    ctx.save();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.translate(CANVAS_W / 2, CANVAS_H / 2);
    ctx.rotate((this.spriteAngle * Math.PI) / 180);
    if (flipX) ctx.scale(-1, 1);
    ctx.translate(-CANVAS_W / 2, -CANVAS_H / 2);

    for (let r = 0; r < frame.length; r++) {
      const row = frame[r];
      for (let c = 0; c < row.length; c++) {
        const color = COLORS[row[c]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(c * PIXEL_SIZE, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
    ctx.restore();
  }

  // ── Position ──────────────────────────────────────────────────────────────
  _updatePosition() {
    this.canvas.style.left = `${Math.round(this.x)}px`;
    this.canvas.style.top  = `${Math.round(this.y)}px`;
  }

  // After drag, snap to nearest wall and abandon any active mission
  _snapToNearestWall() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = this.x + CANVAS_W / 2;
    const cy = this.y + CANVAS_H / 2;

    const dB = vh - cy, dT = cy, dR = vw - cx, dL = cx;
    const m  = Math.min(dB, dT, dR, dL);

    if (m === dB) {
      this.y = vh - CANVAS_H; this.spriteAngle = WALL_ANGLE.bottom;
      if (this.vy > 0) this.vy = -this.vy;
    } else if (m === dT) {
      this.y = 0; this.spriteAngle = WALL_ANGLE.top;
      if (this.vy < 0) this.vy = -this.vy;
    } else if (m === dR) {
      this.x = vw - CANVAS_W; this.spriteAngle = WALL_ANGLE.right;
      if (this.vx > 0) this.vx = -this.vx;
    } else {
      this.x = 0; this.spriteAngle = WALL_ANGLE.left;
      if (this.vx < 0) this.vx = -this.vx;
    }

    // Abandon seek/mine mission on drag
    if (this.state !== S_BOUNCING) {
      if (this.asteroid) { this.asteroid.el.remove(); this.asteroid = null; }
      this.state          = S_BOUNCING;
      this.nextAsteroidIn = randInt(SPAWN_MIN, SPAWN_MAX);
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _bindEvents() {
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.asteroid) this.asteroid.el.remove();
      if (this.rocket)   this.rocket.remove();
      this._tally.remove();
      this.canvas.remove();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._dragOx   = e.offsetX;
      this._dragOy   = e.offsetY;
      this.canvas.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      this.x = e.clientX - this._dragOx;
      this.y = e.clientY - this._dragOy;
      this._updatePosition();
    });

    document.addEventListener('mouseup', () => {
      if (!this._dragging) return;
      this._dragging = false;
      this.canvas.style.cursor = 'grab';
      this._snapToNearestWall();
    });
  }
}

// Guard against duplicate injection
if (!window.__astroSpriteLoaded) {
  window.__astroSpriteLoaded = true;
  const init = () => {
    const rocket = new Rocket();
    const pet    = new DesktopPet(rocket);
    window.__astroSprite = { rocket, pet };
  };
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
}
