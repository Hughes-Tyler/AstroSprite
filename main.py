"""
Desktop Pet — 8-bit Astronaut
Wanders freely around your macOS desktop.

Controls:
  Left-click + drag  →  move the astronaut
  Right-click        →  quit
"""

import tkinter as tk
import random
import math

# ── Sprite pixel art ──────────────────────────────────────────────────────────
# Each row must be the same width. Character key:
#   .  transparent (chroma-key — matches CHROMA_KEY below)
#   B  dark outline  (#111111)
#   W  white spacesuit (#EEEEFF)
#   V  visor glass  (#66BBEE)
#   Y  gold visor ring (#FFD700)
#   R  red chest stripe (#CC3333)
#   G  gray suit detail (#999999)

COLORS = {
    'B': '#111111',
    'W': '#EEEEFF',
    'V': '#66BBEE',
    'Y': '#FFD700',
    'R': '#CC3333',
    'G': '#999999',
}

# Two walk frames — legs alternate between frames
FRAMES = [
    # Frame 0 — legs together
    [
        "....BBBBB....",   # 13 wide
        "...BWWWWWB...",
        "..BWWWWWWWB..",
        "..BYYYYYYYB..",   # gold visor ring (7 Y's)
        "..BWVVVVVWB..",   # visor glass
        "..BWVVVVVWB..",
        "..BYYYYYYYB..",   # gold visor ring bottom
        "..BWWWWWWWB..",
        ".BWWWWWWWWWB.",
        ".BWWRRRRRWWB.",   # red chest stripe
        ".BWWWWWWWWWB.",
        "..BGWWWWWGB..",   # shoulder detail
        "..BBWWWWWBB..",
        "...BW...WB...",
        "...BW...WB...",
        "....B...B....",
    ],
    # Frame 1 — legs spread
    [
        "....BBBBB....",
        "...BWWWWWB...",
        "..BWWWWWWWB..",
        "..BYYYYYYYB..",
        "..BWVVVVVWB..",
        "..BWVVVVVWB..",
        "..BYYYYYYYB..",
        "..BWWWWWWWB..",
        ".BWWWWWWWWWB.",
        ".BWWRRRRRWWB.",
        ".BWWWWWWWWWB.",
        "..BGWWWWWGB..",
        "..BBWWWWWBB..",
        "..BWW...WWB..",   # legs spread apart
        ".BBW.....WBB.",
        "..B.......B..",
    ],
]

# Validate all rows are the same width (sanity check)
for fi, frame in enumerate(FRAMES):
    widths = {len(row) for row in frame}
    if len(widths) > 1:
        raise ValueError(f"Frame {fi} has inconsistent row widths: {widths}")

SPRITE_COLS = len(FRAMES[0][0])
SPRITE_ROWS = len(FRAMES[0])

# ── Configuration ─────────────────────────────────────────────────────────────
PIXEL_SIZE  = 5          # screen pixels per sprite pixel
CHROMA_KEY  = '#010101'  # near-black used as the transparent color
FPS_DELAY   = 60         # ms between updates (~16 fps — smooth arc motion)
SPEED_MIN   = 0.9        # slow, floaty horizontal speed
SPEED_MAX   = 1.0
DRAG        = 0.994      # gentle space drag applied every tick
TURN_EVERY  = (180, 350) # frames between direction changes — long lazy drifts
BOB_FREQ    = 0.07       # radians per tick — drives leg animation / sway only

CANVAS_W = SPRITE_COLS * PIXEL_SIZE
CANVAS_H = SPRITE_ROWS * PIXEL_SIZE


# ── Helper ────────────────────────────────────────────────────────────────────
def _random_velocity():
    """Return a random (vx, vy) in any direction at a lazy drift speed."""
    angle = random.uniform(0, 2 * math.pi)
    speed = random.uniform(SPEED_MIN, SPEED_MAX)
    return math.cos(angle) * speed, math.sin(angle) * speed


# ── Main class ────────────────────────────────────────────────────────────────
class DesktopPet:
    def __init__(self):
        self.root = tk.Tk()
        self._setup_window()
        self._setup_canvas()

        # Position — start somewhere random on screen
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.x = float(random.randint(50, max(50, sw - CANVAS_W - 50)))
        self.y = float(random.randint(50, max(50, sh - CANVAS_H - 50)))

        # Movement state — true zero-g, equal in all directions
        self.vx, self.vy = _random_velocity()
        self.bob_phase   = random.uniform(0, 2 * math.pi)  # drives leg anim / sway only
        self.tick      = 0
        self.next_turn = random.randint(*TURN_EVERY)
        self.frame_idx = 0

        # Cursor bounce cooldown — prevents repeated triggers on one pass-through
        self._cursor_cd = 0

        # Drag state
        self._drag_ox = 0
        self._drag_oy = 0

        self._bind_events()
        self._move_window()
        self._draw()

    # ── Window & canvas setup ─────────────────────────────────────────────────
    def _setup_window(self):
        r = self.root
        r.title("Desktop Pet")
        r.overrideredirect(True)           # no title bar / window chrome
        r.wm_attributes('-topmost', True)  # always on top
        r.wm_attributes('-transparent', True)  # macOS chroma-key transparency
        r.configure(bg=CHROMA_KEY)
        r.geometry(f'{CANVAS_W}x{CANVAS_H}+0+0')

    def _setup_canvas(self):
        self.canvas = tk.Canvas(
            self.root,
            width=CANVAS_W,
            height=CANVAS_H,
            bg=CHROMA_KEY,
            highlightthickness=0,
            bd=0,
        )
        self.canvas.pack()

    # ── Drawing ───────────────────────────────────────────────────────────────
    def _draw(self):
        c = self.canvas
        c.delete('all')

        frame = FRAMES[self.frame_idx]
        flip  = self.vx < 0   # mirror sprite when moving left
        sway  = round(math.sin(self.bob_phase) * 3)  # ±3px side-to-side sway

        for row_i, row in enumerate(frame):
            for col_i, ch in enumerate(row):
                color = COLORS.get(ch)
                if color is None:
                    continue  # transparent pixel — skip
                draw_col = (SPRITE_COLS - 1 - col_i) if flip else col_i
                x1 = draw_col * PIXEL_SIZE + sway
                y1 = row_i * PIXEL_SIZE
                c.create_rectangle(
                    x1, y1,
                    x1 + PIXEL_SIZE, y1 + PIXEL_SIZE,
                    fill=color, outline='',
                )

    # ── Game loop ─────────────────────────────────────────────────────────────
    def _step(self):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()

        # Advance bob phase — leg animation and sway only, no longer drives position
        self.bob_phase += BOB_FREQ

        # Apply drag equally on both axes
        self.vx *= DRAG
        self.vy *= DRAG

        # Speed floor — keep him drifting, never fully stopped
        speed = math.hypot(self.vx, self.vy)
        if speed < SPEED_MIN:
            scale = SPEED_MIN / (speed or 1)
            self.vx *= scale
            self.vy *= scale

        # Move
        self.x += self.vx
        self.y += self.vy

        # Bounce off all four edges with a fresh random kick angle
        if self.x < 0:
            self.x  = 0.0
            self.vx, self.vy = _random_velocity()
            self.vx = abs(self.vx)   # ensure heading right
        elif self.x + CANVAS_W > sw:
            self.x  = float(sw - CANVAS_W)
            self.vx, self.vy = _random_velocity()
            self.vx = -abs(self.vx)  # ensure heading left

        if self.y < 0:
            self.y  = 0.0
            self.vx, self.vy = _random_velocity()
            self.vy = abs(self.vy)   # ensure heading down
        elif self.y + CANVAS_H > sh:
            self.y  = float(sh - CANVAS_H)
            self.vx, self.vy = _random_velocity()
            self.vy = -abs(self.vy)  # ensure heading up

        # Occasionally drift off in a new random direction
        self.tick += 1
        if self.tick >= self.next_turn:
            self.tick      = 0
            self.next_turn = random.randint(*TURN_EVERY)
            self.vx, self.vy = _random_velocity()

        # Cursor collision — bump him away from wherever the cursor is
        if self._cursor_cd > 0:
            self._cursor_cd -= 1
        else:
            px = self.root.winfo_pointerx()
            py = self.root.winfo_pointery()
            if self.x <= px <= self.x + CANVAS_W and self.y <= py <= self.y + CANVAS_H:
                dx = (self.x + CANVAS_W / 2) - px
                dy = (self.y + CANVAS_H / 2) - py
                dist = math.hypot(dx, dy) or 1
                kick = random.uniform(2.5, 4.0)
                self.vx         = (dx / dist) * kick
                self.vy         = (dy / dist) * kick
                self._cursor_cd = 25  # ~1.5 s cooldown at 60 ms/tick
                self.tick       = 0   # reset turn timer so kick direction sticks
                self.next_turn  = random.randint(*TURN_EVERY)

        # Leg animation — frame alternates with bob phase
        self.frame_idx = 0 if math.cos(self.bob_phase) > 0 else 1

        self._move_window()
        self._draw()
        self.root.after(FPS_DELAY, self._step)

    def _move_window(self):
        self.root.geometry(f'{CANVAS_W}x{CANVAS_H}+{int(self.x)}+{int(self.y)}')

    # ── Interaction ───────────────────────────────────────────────────────────
    def _bind_events(self):
        # Right-click or middle-click to quit
        self.canvas.bind('<Button-2>', lambda _e: self.root.destroy())
        self.canvas.bind('<Button-3>', lambda _e: self.root.destroy())
        # Left-click drag to reposition
        self.canvas.bind('<ButtonPress-1>',  self._drag_start)
        self.canvas.bind('<B1-Motion>',      self._drag_motion)

    def _drag_start(self, event):
        self._drag_ox = event.x
        self._drag_oy = event.y

    def _drag_motion(self, event):
        self.x = float(self.root.winfo_x() + event.x - self._drag_ox)
        self.y = float(self.root.winfo_y() + event.y - self._drag_oy)
        self._move_window()

    # ── Entry point ───────────────────────────────────────────────────────────
    def run(self):
        self.root.after(FPS_DELAY, self._step)
        self.root.mainloop()


if __name__ == '__main__':
    DesktopPet().run()
