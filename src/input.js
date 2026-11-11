// Keyboard, gamepad and touch, folded into one input frame the simulation understands.
const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyK', 'KeyZ'], fire: ['KeyJ', 'KeyX'], special: ['KeyL', 'KeyC', 'KeyE'],
  pause: ['Escape', 'KeyP'],
};
const CODE = {};
for (const [a, list] of Object.entries(KEYS)) for (const c of list) CODE[c] = a;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.k = {}; this.mouse = false;
    this.touch = { stick: null, sx: 0, sy: 0, dx: 0, dy: 0, jump: false, fire: false, special: false };
    this.ptr = new Map();
    this.device = 'keys';          // keys | touch | pad
    this.specialEdge = false; this.pauseEdge = false; this.anyEdge = false;
    this.layout = null;            // set by the HUD each frame: button circles in device px
    this.enabled = false;
    addEventListener('keydown', (e) => {
      const a = CODE[e.code];
      if (!a || !this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;   // menus have the keyboard while the game is paused
      e.preventDefault();
      if (!this.k[a]) { if (a === 'special') this.specialEdge = true; if (a === 'pause') this.pauseEdge = true; this.anyEdge = true; }
      this.k[a] = true; this.device = 'keys';
    });
    addEventListener('keyup', (e) => { const a = CODE[e.code]; if (a) this.k[a] = false; });
    addEventListener('blur', () => { this.k = {}; this.mouse = false; this.releaseAll(); });
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    const up = (e) => this.up(e);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  releaseAll() {
    this.ptr.clear(); const t = this.touch; t.stick = null; t.dx = t.dy = 0; t.jump = t.fire = t.special = false;
    this.k = {}; this.mouse = false; this.specialEdge = this.pauseEdge = this.anyEdge = false;
  }
  pos(e) { const r = this.canvas.getBoundingClientRect(), s = this.canvas.width / r.width; return [(e.clientX - r.left) * s, (e.clientY - r.top) * s]; }
  hit(x, y) {
    const L = this.layout; if (!L) return null;
    for (const n of ['special', 'jump', 'fire']) { const b = L[n]; if (b && Math.hypot(x - b.x, y - b.y) < b.r * 1.25) return n; }
    return null;
  }
  down(e) {
    if (!this.enabled) return;
    this.anyEdge = true;
    if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse = true; if (e.button === 2) this.specialEdge = true; return; }
    e.preventDefault();
    this.device = 'touch';
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    const [x, y] = this.pos(e), t = this.touch, L = this.layout;
    let role = this.hit(x, y);
    if (!role) {
      const leftSide = L ? x < L.split : x < this.canvas.width * 0.45;
      if (leftSide && t.stick == null) { role = 'stick'; t.stick = e.pointerId; t.sx = x; t.sy = y; t.dx = t.dy = 0; }
      else if (!leftSide) role = 'fire';
    }
    if (!role) return;
    this.ptr.set(e.pointerId, role);
    if (role === 'special') { t.special = true; this.specialEdge = true; } else if (role !== 'stick') t[role] = true;
  }
  move(e) {
    const role = this.ptr.get(e.pointerId);
    if (role !== 'stick') return;
    const [x, y] = this.pos(e), t = this.touch, R = (this.layout ? this.layout.stickR : 60);
    let dx = (x - t.sx) / R, dy = (y - t.sy) / R; const d = Math.hypot(dx, dy);
    if (d > 1) { // the base follows the thumb so it never runs out of travel
      t.sx += (dx - dx / d) * R; t.sy += (dy - dy / d) * R; dx /= d; dy /= d;
    }
    t.dx = dx; t.dy = dy;
  }
  up(e) {
    if (e.pointerType === 'mouse') { this.mouse = false; return; }
    const role = this.ptr.get(e.pointerId); if (!role) return;
    this.ptr.delete(e.pointerId);
    const t = this.touch;
    if (role === 'stick') { t.stick = null; t.dx = t.dy = 0; }
    else { let still = false; for (const r of this.ptr.values()) if (r === role) still = true; if (!still) t[role] = false; }
  }
  // one frame of intent
  read() {
    const k = this.k, t = this.touch;
    let mx = (k.right ? 1 : 0) - (k.left ? 1 : 0), my = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    let jump = !!k.jump, fire = !!k.fire || this.mouse;
    if (t.stick != null) { mx = t.dx; my = -t.dy; }
    jump = jump || t.jump; fire = fire || t.fire;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const px = Math.abs(ax) > 0.3 ? ax : (b(15) ? 1 : 0) - (b(14) ? 1 : 0), py = Math.abs(ay) > 0.4 ? -ay : (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
      if (px || py || b(0) || b(2) || b(7)) this.device = 'pad';
      if (px) mx = px; if (py) my = py;
      jump = jump || b(0); fire = fire || b(2) || b(7) || b(5);
      const sp = b(3) || b(1) || b(6), st = b(9);
      if (sp && !this.padSp) this.specialEdge = true; this.padSp = sp;
      if (st && !this.padSt) this.pauseEdge = true; this.padSt = st;
      if ((b(0) || b(9)) && !this.padAny) this.anyEdge = true; this.padAny = b(0) || b(9);
    }
    const f = { mx, my, jump, fire, special: this.specialEdge, pause: this.pauseEdge, any: this.anyEdge };
    this.specialEdge = false; this.pauseEdge = false; this.anyEdge = false;
    return f;
  }
}
export function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* unsupported */ } }
