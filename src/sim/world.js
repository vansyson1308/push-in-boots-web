// Terrain: solid boxes (ground columns, walls, gates) and thin one-way platforms.
export function buildWorld(stage) {
  const solids = [], plats = [];
  for (const g of stage.ground || []) solids.push({ x0: g[0], x1: g[1], y0: -60, y1: g[2], kind: 'ground' });
  (stage.blocks || []).forEach((b, i) => solids.push({
    x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, kind: b.art || 'wall', hp: b.hp || 0, maxHp: b.hp || 0, id: i, flash: 0,
  }));
  (stage.platforms || []).forEach((p, i) => plats.push({
    id: i, x0: p.x0, x1: p.x1, y: p.y, bx: p.x0, by: p.y, w: p.x1 - p.x0, kind: p.kind || 'static',
    dx: p.dx || 0, dy: p.dy || 0, period: p.period || 4, vx: 0, vy: 0, t: 0, shake: 0, fallen: false, respawn: 0, helper: !!p.helper,
  }));
  return { solids, plats };
}

export function stepPlatforms(w, time, dt) {
  for (const p of w.plats) {
    if (p.kind === 'moving') {
      const k = 0.5 - 0.5 * Math.cos((time / p.period) * Math.PI * 2);
      const nx = p.bx + p.dx * k, ny = p.by + p.dy * k;
      p.vx = (nx - p.x0) / dt; p.vy = (ny - p.y) / dt;
      p.x0 = nx; p.x1 = nx + p.w; p.y = ny;
    } else if (p.kind === 'collapse') {
      if (p.fallen) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.fallen = false; p.shake = 0; p.y = p.by; p.vy = 0; }
        else if (p.respawn > 2.2) { p.vy -= 30 * dt; p.y += p.vy * dt; }
      } else if (p.shake > 0) {
        p.shake += dt;
        if (p.shake > 0.55) { p.fallen = true; p.respawn = 3.2; p.vy = 0; }
      }
    }
  }
}

// Moves a body {x,y (feet centre),vx,vy,hw,h} and resolves it against the world.
export function moveBody(w, b, dt) {
  if (b.onPlat && !b.onPlat.fallen) { b.x += b.onPlat.vx * dt; b.y += b.onPlat.vy * dt; }
  b.hitWall = 0; b.hitCeil = false;
  b.x += b.vx * dt;
  for (const s of w.solids) {
    if (s.dead) continue;
    if (b.x + b.hw > s.x0 && b.x - b.hw < s.x1 && b.y + 0.02 < s.y1 && b.y + b.h > s.y0) {
      const mid = (s.x0 + s.x1) / 2;
      if (b.vx > 0 || (b.vx === 0 && b.x < mid)) { b.x = s.x0 - b.hw; b.hitWall = 1; }
      else { b.x = s.x1 + b.hw; b.hitWall = -1; }
      b.wallSolid = s;
    }
  }
  const prevY = b.y;
  b.y += b.vy * dt;
  const wasPlat = b.onPlat;
  b.grounded = false; b.onPlat = null;
  for (const s of w.solids) {
    if (s.dead) continue;
    if (b.x + b.hw > s.x0 + 0.001 && b.x - b.hw < s.x1 - 0.001 && b.y < s.y1 && b.y + b.h > s.y0) {
      if (b.vy <= 0 && prevY >= s.y1 - 0.25) { b.y = s.y1; b.vy = 0; b.grounded = true; }
      else if (b.vy > 0 && prevY + b.h <= s.y0 + 0.25) { b.y = s.y0 - b.h; b.vy = 0; b.hitCeil = true; }
    }
  }
  if (b.vy <= 0 && !b.noPlat && !(b.dropT > 0)) {
    for (const p of w.plats) {
      if (p.fallen) continue;
      if (b.x + b.hw * 0.8 > p.x0 && b.x - b.hw * 0.8 < p.x1) {
        const top = p.y, lift = Math.max(0, p.vy * dt) + 0.02;
        if (prevY >= top - lift - (wasPlat === p ? 0.3 : 0) && b.y <= top) {
          b.y = top; b.vy = 0; b.grounded = true; b.onPlat = p;
        }
      }
    }
  }
}

export function groundY(w, x, fromY = 1e9) {
  let best = -Infinity;
  for (const s of w.solids) if (!s.dead && x >= s.x0 && x <= s.x1 && s.y1 <= fromY + 0.01 && s.y1 > best) best = s.y1;
  return best;
}
export function floorBelow(w, x, y) {
  let best = groundY(w, x, y);
  for (const p of w.plats) if (!p.fallen && x >= p.x0 && x <= p.x1 && p.y <= y + 0.01 && p.y > best) best = p.y;
  return best;
}
export function solidAt(w, x, y) {
  for (const s of w.solids) if (!s.dead && x > s.x0 && x < s.x1 && y > s.y0 && y < s.y1) return s;
  return null;
}
