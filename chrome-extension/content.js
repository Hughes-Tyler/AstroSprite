/**
 * AstroSprite — 8-bit Astronaut Chrome Extension
 * Controls:
 *   Left-click + drag  →  move the astronaut
 *   Right-click        →  dismiss for this page
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

// ── Config ────────────────────────────────────────────────────────────────────
const PIXEL_SIZE  = 5;
const FPS_DELAY   = 60;
const SPEED_MIN   = 0.3;
const SPEED_MAX   = 1.0;
const DRAG        = 0.994;
const TURN_MIN    = 180;
const TURN_MAX    = 350;
const BOB_FREQ    = 0.07;

const SPRITE_COLS = FRAMES[0][0].length;
const SPRITE_ROWS = FRAMES[0].length;
const CANVAS_W    = SPRITE_COLS * PIXEL_SIZE;
const CANVAS_H    = SPRITE_ROWS * PIXEL_SIZE;

// Behavior names
const B_NORMAL   = 'NORMAL';
const B_JETPACK  = 'JETPACK';
const B_TUMBLE   = 'TUMBLE';
const B_MOONWALK = 'MOONWALK';
const B_SCARED   = 'SCARED';
const B_FIDGET   = 'FIDGET';
const B_SLEEPING = 'SLEEPING';

const TIMED_BEHAVIORS = new Set([B_JETPACK, B_TUMBLE, B_MOONWALK, B_SCARED]);

const SCARED_RADIUS = 90;   // px from sprite center to trigger scare
const FIDGET_AFTER  = 450;  // idle ticks before fidgeting (~27 s)
const SLEEP_AFTER   = 900;  // idle ticks before sleeping (~54 s)

const QUIPS = [
  'Houston, we have\na problem 😬',
  'One small step...',
  '🚀',
  'The stars are\nbeautiful today ✨',
  'Floating in space...',
  'Beep boop 👾',
  'To infinity!',
  '*weightless noises*',
  'Should probably\ncall mission control',
  '🌍',
  'Space is pretty\nchill tbh',
  'Anyone got\nsnacks up here?',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomVelocity() {
  const angle = Math.random() * 2 * Math.PI;
  const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
  return [Math.cos(angle) * speed, Math.sin(angle) * speed];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Desktop Pet ───────────────────────────────────────────────────────────────
class DesktopPet {
  constructor() {
    // Build canvas
    this.canvas = document.createElement('canvas');
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

    // Position
    this.x = Math.random() * Math.max(0, window.innerWidth  - CANVAS_W);
    this.y = Math.random() * Math.max(0, window.innerHeight - CANVAS_H);

    // Movement
    [this.vx, this.vy] = randomVelocity();
    this.bobPhase = Math.random() * 2 * Math.PI;
    this.tick     = 0;
    this.nextTurn = randInt(TURN_MIN, TURN_MAX);
    this.frameIdx = 0;

    // Cursor tracking
    this.cursorX = -999;
    this.cursorY = -999;

    // Drag
    this._dragging = false;
    this._dragOx   = 0;
    this._dragOy   = 0;

    // Behavior state
    this.behavior      = B_NORMAL;
    this.behaviorTicks = 0;           // countdown; 0 = infinite (idle behaviors)
    this.nextRandom    = randInt(250, 450);
    this.idleTicks     = 0;
    this.rotation      = 0;           // degrees, for TUMBLE
    this.moonwalkFlip  = false;       // vertical flip active

    // Scared cooldown (prevents rapid re-triggering)
    this._scaredCd = 0;

    // Overlay elements
    this._speechEl   = null;
    this._nextSpeech = randInt(500, 900);

    // Sparkle / Zzz rate limiters
    this._sparkleCd = 0;
    this._zzzCd     = 0;

    this._bindEvents();
    this._updatePosition();
    this._step();
  }

  // ── Behavior management ───────────────────────────────────────────────────
  _startBehavior(name, minTicks, maxTicks) {
    // SCARED can always interrupt; nothing else interrupts SCARED mid-flight
    if (this.behavior === B_SCARED && name !== B_SCARED) return;
    this._cleanupBehavior();
    this.behavior      = name;
    this.behaviorTicks = (minTicks === 0 && maxTicks === 0) ? 0 : randInt(minTicks, maxTicks);
  }

  _cleanupBehavior() {
    if (this.behavior === B_TUMBLE) {
      this.rotation = 0;
      this.canvas.style.transform = '';
    }
    if (this.behavior === B_MOONWALK) {
      this.moonwalkFlip = false;
    }
    // SLEEPING / FIDGET / SCARED / JETPACK / NORMAL need no special teardown
  }

  _wakeUp() {
    if (this.behavior === B_SLEEPING || this.behavior === B_FIDGET) {
      this._cleanupBehavior();
      this.behavior      = B_NORMAL;
      this.behaviorTicks = 0;
    }
    this.idleTicks = 0;
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  _step() {
    if (!document.body.contains(this.canvas)) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // ── Idle counter ─────────────────────────────────────────────────────
    if (!this._dragging) this.idleTicks++;

    // ── Countdown timed behaviors ─────────────────────────────────────────
    if (TIMED_BEHAVIORS.has(this.behavior) && this.behaviorTicks > 0) {
      this.behaviorTicks--;
      if (this.behaviorTicks === 0) {
        this._cleanupBehavior();
        this.behavior = B_NORMAL;
      }
    }

    // ── Idle → FIDGET → SLEEPING ──────────────────────────────────────────
    if (this.behavior === B_NORMAL && this.idleTicks >= FIDGET_AFTER) {
      this.behavior = B_FIDGET;
    }
    if (this.behavior === B_FIDGET && this.idleTicks >= SLEEP_AFTER) {
      this._cleanupBehavior();
      this.behavior = B_SLEEPING;
    }

    // ── Random special behavior timer (skip while sleeping) ───────────────
    if (this.behavior === B_NORMAL || this.behavior === B_FIDGET) {
      this.nextRandom--;
      if (this.nextRandom <= 0) {
        this._triggerRandomBehavior();
        this.nextRandom = randInt(250, 450);
      }
    }

    // ── Cursor scare check (skip while sleeping or dragging) ──────────────
    if (this._scaredCd > 0) {
      this._scaredCd--;
    } else if (!this._dragging && this.behavior !== B_SLEEPING) {
      const mx   = this.x + CANVAS_W / 2;
      const my   = this.y + CANVAS_H / 2;
      const dist = Math.hypot(this.cursorX - mx, this.cursorY - my);
      if (dist < SCARED_RADIUS) {
        this._triggerScared(this.cursorX, this.cursorY, mx, my, dist);
      }
    }

    // ── Speech bubble timer ───────────────────────────────────────────────
    if (this.behavior !== B_SLEEPING) {
      this._nextSpeech--;
      if (this._nextSpeech <= 0) {
        this._showSpeechBubble(QUIPS[randInt(0, QUIPS.length - 1)]);
        this._nextSpeech = randInt(500, 900);
      }
    }

    // ── Behavior-specific physics ─────────────────────────────────────────
    this.bobPhase += BOB_FREQ;

    if (this.behavior === B_TUMBLE) {
      this.rotation = (this.rotation + 2.8) % 360;
      this.canvas.style.transform = `rotate(${this.rotation}deg)`;
      this._physicsNormal(vw, vh);

    } else if (this.behavior === B_MOONWALK) {
      this.moonwalkFlip = true;
      this.vy -= 0.015; // gentle, constant upward pull toward ceiling
      this._physicsNormal(vw, vh);

    } else if (this.behavior === B_JETPACK) {
      this._physicsNormal(vw, vh);
      if (this._sparkleCd <= 0) {
        this._spawnSparkle(
          this.x + CANVAS_W / 2 + (Math.random() - 0.5) * CANVAS_W * 0.4,
          this.y + CANVAS_H * 0.85
        );
        this._sparkleCd = 3;
      }
      this._sparkleCd--;

    } else if (this.behavior === B_SCARED) {
      this._physicsNormal(vw, vh);
      if (this._sparkleCd <= 0) {
        this._spawnSparkle(
          this.x + CANVAS_W * 0.5,
          this.y + CANVAS_H * 0.4,
          ['!', '!!', '?!'][randInt(0,2)],
          '#FF5555'
        );
        this._sparkleCd = 8;
      }
      this._sparkleCd--;

    } else if (this.behavior === B_FIDGET) {
      // Wiggle in place — heavy damping + tiny random nudges
      this.vx = this.vx * 0.82 + (Math.random() - 0.5) * 0.4;
      this.vy = this.vy * 0.82 + (Math.random() - 0.5) * 0.4;
      this._physicsBoundsOnly(vw, vh);

    } else if (this.behavior === B_SLEEPING) {
      // Barely drift
      this.vx *= 0.98;
      this.vy *= 0.98;
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > SPEED_MIN * 0.25) {
        this.vx *= (SPEED_MIN * 0.25) / spd;
        this.vy *= (SPEED_MIN * 0.25) / spd;
      }
      this._physicsBoundsOnly(vw, vh);
      if (this._zzzCd <= 0) {
        this._spawnZzz();
        this._zzzCd = 80;
      }
      this._zzzCd--;

    } else {
      // B_NORMAL
      this._physicsNormal(vw, vh);
    }

    // Leg animation frame
    this.frameIdx = Math.cos(this.bobPhase) > 0 ? 0 : 1;

    this._updatePosition();
    this._draw();
    setTimeout(() => this._step(), FPS_DELAY);
  }

  // ── Physics helpers ───────────────────────────────────────────────────────
  _physicsNormal(vw, vh) {
    this.vx *= DRAG;
    this.vy *= DRAG;

    const spd = Math.hypot(this.vx, this.vy);
    if (spd < SPEED_MIN) {
      const s = SPEED_MIN / (spd || 1);
      this.vx *= s;
      this.vy *= s;
    }

    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0) {
      this.x = 0;
      [this.vx, this.vy] = randomVelocity();
      this.vx = Math.abs(this.vx);
    } else if (this.x + CANVAS_W > vw) {
      this.x = vw - CANVAS_W;
      [this.vx, this.vy] = randomVelocity();
      this.vx = -Math.abs(this.vx);
    }

    if (this.y < 0) {
      this.y = 0;
      [this.vx, this.vy] = randomVelocity();
      this.vy = Math.abs(this.vy);
    } else if (this.y + CANVAS_H > vh) {
      this.y = vh - CANVAS_H;
      [this.vx, this.vy] = randomVelocity();
      this.vy = -Math.abs(this.vy);
    }

    this.tick++;
    if (this.tick >= this.nextTurn) {
      this.tick     = 0;
      this.nextTurn = randInt(TURN_MIN, TURN_MAX);
      [this.vx, this.vy] = randomVelocity();
    }
  }

  _physicsBoundsOnly(vw, vh) {
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < 0)              { this.x = 0;            this.vx =  Math.abs(this.vx); }
    if (this.x + CANVAS_W > vw)  { this.x = vw - CANVAS_W; this.vx = -Math.abs(this.vx); }
    if (this.y < 0)              { this.y = 0;            this.vy =  Math.abs(this.vy); }
    if (this.y + CANVAS_H > vh)  { this.y = vh - CANVAS_H; this.vy = -Math.abs(this.vy); }
  }

  // ── Behavior triggers ─────────────────────────────────────────────────────
  _triggerRandomBehavior() {
    const pick = [B_JETPACK, B_TUMBLE, B_MOONWALK][randInt(0, 2)];
    if (pick === B_JETPACK) {
      this._startBehavior(B_JETPACK, 55, 85);
      const [bvx, bvy] = randomVelocity();
      this.vx = bvx * 4.5;
      this.vy = bvy * 4.5;
    } else if (pick === B_TUMBLE) {
      this._startBehavior(B_TUMBLE, 100, 150);
    } else if (pick === B_MOONWALK) {
      this._startBehavior(B_MOONWALK, 130, 190);
      // Initial upward kick to get him moving toward the ceiling
      this.vy = -Math.abs(this.vy) - 1.2;
    }
    this.idleTicks = 0;
  }

  _triggerScared(cx, cy, mx, my, dist) {
    this._wakeUp();
    this._startBehavior(B_SCARED, 35, 55);
    const d    = dist || 1;
    const kick = 3.5 + Math.random() * 2.5;
    this.vx = ((mx - cx) / d) * kick;
    this.vy = ((my - cy) / d) * kick;
    this.tick      = 0;
    this.nextTurn  = randInt(TURN_MIN, TURN_MAX);
    this._scaredCd = 70;
    this._showExclamation();
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const ctx   = this.ctx;
    const frame = FRAMES[this.frameIdx];
    const flipX = this.vx < 0;
    const sway  = Math.round(Math.sin(this.bobPhase) * 3);

    ctx.save();
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    if (this.moonwalkFlip) {
      // Flip vertically — he walks on the ceiling
      ctx.translate(0, CANVAS_H);
      ctx.scale(1, -1);
    }

    for (let r = 0; r < frame.length; r++) {
      const row = frame[r];
      for (let c = 0; c < row.length; c++) {
        const color = COLORS[row[c]];
        if (!color) continue;
        const dc = flipX ? (SPRITE_COLS - 1 - c) : c;
        ctx.fillStyle = color;
        ctx.fillRect(dc * PIXEL_SIZE + sway, r * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
      }
    }

    ctx.restore();
  }

  // ── Overlay effects ───────────────────────────────────────────────────────
  _spawnSparkle(sx, sy, char, color) {
    const chars  = char  ? [char]      : ['✦', '✧', '⋆', '·', '*', '✨'];
    const tColor = color || '#FFD700';
    const el     = document.createElement('span');
    el.textContent = chars[randInt(0, chars.length - 1)];
    Object.assign(el.style, {
      position:      'fixed',
      left:          `${sx + (Math.random() - 0.5) * 16}px`,
      top:           `${sy + (Math.random() - 0.5) * 16}px`,
      color:         tColor,
      fontSize:      `${7 + Math.random() * 8}px`,
      pointerEvents: 'none',
      zIndex:        '2147483646',
      transition:    'opacity 0.85s ease-out, transform 0.85s ease-out',
      opacity:       '1',
      userSelect:    'none',
      fontFamily:    'sans-serif',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity   = '0';
      el.style.transform = `translate(${(Math.random() - 0.5) * 28}px, ${-12 - Math.random() * 22}px)`;
    });
    setTimeout(() => el.remove(), 900);
  }

  _spawnZzz() {
    const el = document.createElement('span');
    el.textContent = ['z', 'z', 'Z', 'Z', 'Zz'][randInt(0, 4)];
    const size = randInt(11, 17);
    Object.assign(el.style, {
      position:      'fixed',
      left:          `${this.x + CANVAS_W * 0.72 + Math.random() * 8}px`,
      top:           `${this.y + 2}px`,
      color:         '#AADDFF',
      fontSize:      `${size}px`,
      fontWeight:    'bold',
      pointerEvents: 'none',
      zIndex:        '2147483646',
      transition:    'opacity 2s ease-out, transform 2s ease-out',
      opacity:       '0.85',
      userSelect:    'none',
      fontFamily:    'sans-serif',
      textShadow:    '0 0 5px #66BBEE',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity   = '0';
      el.style.transform = `translate(${6 + Math.random() * 10}px, ${-18 - Math.random() * 18}px) scale(1.3)`;
    });
    setTimeout(() => el.remove(), 2100);
  }

  _showExclamation() {
    const el = document.createElement('div');
    el.textContent = '!';
    Object.assign(el.style, {
      position:      'fixed',
      left:          `${this.x + CANVAS_W + 3}px`,
      top:           `${this.y - 2}px`,
      background:    '#FFD700',
      color:         '#111',
      fontWeight:    'bold',
      fontSize:      '13px',
      borderRadius:  '50%',
      width:         '17px',
      height:        '17px',
      lineHeight:    '17px',
      textAlign:     'center',
      pointerEvents: 'none',
      zIndex:        '2147483646',
      boxShadow:     '0 0 4px rgba(0,0,0,0.45)',
      transition:    'opacity 0.4s',
      opacity:       '1',
      userSelect:    'none',
      fontFamily:    'sans-serif',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; }, 500);
    setTimeout(() => el.remove(), 950);
  }

  _showSpeechBubble(text) {
    // Remove previous bubble if still showing
    if (this._speechEl) {
      this._speechEl.remove();
      this._speechEl = null;
    }
    const el = document.createElement('div');
    el.textContent = text;
    // Position right of sprite, but clamp to viewport
    const bubbleLeft = Math.min(this.x + CANVAS_W + 8, window.innerWidth - 155);
    const bubbleTop  = Math.max(4, this.y - 8);
    Object.assign(el.style, {
      position:      'fixed',
      left:          `${bubbleLeft}px`,
      top:           `${bubbleTop}px`,
      background:    '#FFFFFF',
      color:         '#111111',
      fontSize:      '11px',
      lineHeight:    '1.45',
      padding:       '5px 8px',
      borderRadius:  '10px',
      border:        '2px solid #111',
      pointerEvents: 'none',
      zIndex:        '2147483646',
      maxWidth:      '145px',
      whiteSpace:    'pre-wrap',
      boxShadow:     '2px 2px 0px #111',
      opacity:       '1',
      transition:    'opacity 0.4s',
      userSelect:    'none',
      fontFamily:    'sans-serif',
    });
    document.body.appendChild(el);
    this._speechEl = el;

    setTimeout(() => {
      if (!el.parentNode) return;
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        if (this._speechEl === el) this._speechEl = null;
      }, 450);
    }, 4000);
  }

  // ── Position ──────────────────────────────────────────────────────────────
  _updatePosition() {
    this.canvas.style.left = `${Math.round(this.x)}px`;
    this.canvas.style.top  = `${Math.round(this.y)}px`;
  }

  // ── Input events ──────────────────────────────────────────────────────────
  _bindEvents() {
    document.addEventListener('mousemove', (e) => {
      this.cursorX = e.clientX;
      this.cursorY = e.clientY;
    });

    // Right-click to dismiss
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._speechEl) this._speechEl.remove();
      this.canvas.remove();
    });

    // Left-click drag start
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._dragOx   = e.offsetX;
      this._dragOy   = e.offsetY;
      this.canvas.style.cursor = 'grabbing';
      this.vx = 0;
      this.vy = 0;
      this._wakeUp();
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
      [this.vx, this.vy] = randomVelocity();
      this.idleTicks = 0;
    });
  }
}

// Guard against duplicate injection
if (!window.__astroSpriteLoaded) {
  window.__astroSpriteLoaded = true;
  if (document.body) {
    new DesktopPet();
  } else {
    document.addEventListener('DOMContentLoaded', () => new DesktopPet());
  }
}
