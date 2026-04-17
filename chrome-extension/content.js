/**
 * AstroSprite — 8-bit Astronaut Chrome Extension
 * Translated from main.py (tkinter desktop pet) to a browser content script.
 *
 * Controls:
 *   Left-click + drag  →  move the astronaut
 *   Right-click        →  dismiss for this page
 */

// ── Sprite pixel art ─────────────────────────────────────────────────────────
const COLORS = {
  B: '#111111',
  W: '#EEEEFF',
  V: '#66BBEE',
  Y: '#FFD700',
  R: '#CC3333',
  G: '#999999',
};

// Two walk frames — legs alternate between frames
const FRAMES = [
  // Frame 0 — legs together
  [
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
  // Frame 1 — legs spread
  [
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

// ── Configuration ─────────────────────────────────────────────────────────────
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

// ── Helper ────────────────────────────────────────────────────────────────────
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
    // Build the canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.width  = CANVAS_W;
    this.canvas.height = CANVAS_H;
    Object.assign(this.canvas.style, {
      position:  'fixed',
      zIndex:    '2147483647',
      left:      '0px',
      top:       '0px',
      cursor:    'grab',
      imageRendering: 'pixelated',
    });
    this.ctx = this.canvas.getContext('2d');
    document.body.appendChild(this.canvas);

    // Starting position — random spot in viewport
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.x = Math.random() * Math.max(0, vw - CANVAS_W);
    this.y = Math.random() * Math.max(0, vh - CANVAS_H);

    // Movement state
    [this.vx, this.vy] = randomVelocity();
    this.bobPhase  = Math.random() * 2 * Math.PI;
    this.tick      = 0;
    this.nextTurn  = randInt(TURN_MIN, TURN_MAX);
    this.frameIdx  = 0;

    // Cursor tracking
    this.cursorX = -999;
    this.cursorY = -999;
    this._cursorCd = 0;

    // Drag state
    this._dragging = false;
    this._dragOx   = 0;
    this._dragOy   = 0;

    this._bindEvents();
    this._updatePosition();
    this._step();
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────
  _draw() {
    const ctx   = this.ctx;
    const frame = FRAMES[this.frameIdx];
    const flip  = this.vx < 0;
    const sway  = Math.round(Math.sin(this.bobPhase) * 3);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    for (let rowI = 0; rowI < frame.length; rowI++) {
      const row = frame[rowI];
      for (let colI = 0; colI < row.length; colI++) {
        const ch    = row[colI];
        const color = COLORS[ch];
        if (!color) continue;
        const drawCol = flip ? (SPRITE_COLS - 1 - colI) : colI;
        const x1 = drawCol * PIXEL_SIZE + sway;
        const y1 = rowI * PIXEL_SIZE;
        ctx.fillStyle = color;
        ctx.fillRect(x1, y1, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }

  // ── Game loop ────────────────────────────────────────────────────────────────
  _step() {
    if (!document.body.contains(this.canvas)) return; // dismissed

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Advance bob phase
    this.bobPhase += BOB_FREQ;

    // Apply drag
    this.vx *= DRAG;
    this.vy *= DRAG;

    // Speed floor — keep him drifting, never fully stopped
    const speed = Math.hypot(this.vx, this.vy);
    if (speed < SPEED_MIN) {
      const scale = SPEED_MIN / (speed || 1);
      this.vx *= scale;
      this.vy *= scale;
    }

    // Move
    this.x += this.vx;
    this.y += this.vy;

    // Bounce off all four viewport edges
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

    // Occasionally drift in a new random direction
    this.tick++;
    if (this.tick >= this.nextTurn) {
      this.tick     = 0;
      this.nextTurn = randInt(TURN_MIN, TURN_MAX);
      [this.vx, this.vy] = randomVelocity();
    }

    // Cursor collision — bump him away from the cursor
    if (this._cursorCd > 0) {
      this._cursorCd--;
    } else {
      const cx = this.cursorX;
      const cy = this.cursorY;
      if (cx >= this.x && cx <= this.x + CANVAS_W &&
          cy >= this.y && cy <= this.y + CANVAS_H) {
        const dx   = (this.x + CANVAS_W / 2) - cx;
        const dy   = (this.y + CANVAS_H / 2) - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const kick = 2.5 + Math.random() * 1.5;
        this.vx        = (dx / dist) * kick;
        this.vy        = (dy / dist) * kick;
        this._cursorCd = 25;
        this.tick      = 0;
        this.nextTurn  = randInt(TURN_MIN, TURN_MAX);
      }
    }

    // Leg animation
    this.frameIdx = Math.cos(this.bobPhase) > 0 ? 0 : 1;

    this._updatePosition();
    this._draw();

    setTimeout(() => this._step(), FPS_DELAY);
  }

  _updatePosition() {
    this.canvas.style.left = `${Math.round(this.x)}px`;
    this.canvas.style.top  = `${Math.round(this.y)}px`;
  }

  // ── Interaction ──────────────────────────────────────────────────────────────
  _bindEvents() {
    // Track cursor position for collision detection
    document.addEventListener('mousemove', (e) => {
      this.cursorX = e.clientX;
      this.cursorY = e.clientY;
    });

    // Right-click to dismiss
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.canvas.remove();
    });

    // Left-click drag
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._dragging = true;
      this._dragOx   = e.offsetX;
      this._dragOy   = e.offsetY;
      this.canvas.style.cursor = 'grabbing';
      // Pause physics while dragging
      this.vx = 0;
      this.vy = 0;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      this.x = e.clientX - this._dragOx;
      this.y = e.clientY - this._dragOy;
      this._updatePosition();
    });

    document.addEventListener('mouseup', (e) => {
      if (!this._dragging) return;
      this._dragging = false;
      this.canvas.style.cursor = 'grab';
      // Give a gentle kick in a random direction on release
      [this.vx, this.vy] = randomVelocity();
    });
  }
}

// Only inject once per page (guard against duplicate script injection)
if (!window.__astroSpriteLoaded) {
  window.__astroSpriteLoaded = true;
  // Wait until body exists
  if (document.body) {
    new DesktopPet();
  } else {
    document.addEventListener('DOMContentLoaded', () => new DesktopPet());
  }
}
