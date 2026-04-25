// paint.js — Brush-based terrain painting
export class PaintSystem {
  constructor(terrain) {
    this.terrain = terrain;
    this.mode = 'height-up';
    this.size = 10;
    this.strength = 0.3;
    this.falloff = 0.5;
    this.active = false;
  }

  setMode(m) { this.mode = m; }
  setSize(s) { this.size = s; }
  setStrength(s) { this.strength = s; }
  setFalloff(f) { this.falloff = f; }

  apply(u, v) {
    const t = this.terrain;
    const s = t.size;
    const cx = u * s;
    const cy = v * s;
    const r = this.size;
    const r2 = r * r;
    const str = this.strength;
    const fall = this.falloff;

    const xMin = Math.max(0, Math.floor(cx - r));
    const xMax = Math.min(s - 1, Math.ceil(cx + r));
    const yMin = Math.max(0, Math.floor(cy - r));
    const yMax = Math.min(s - 1, Math.ceil(cy + r));

    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2);
        const t01 = d / r;
        const e0 = 1 - fall;
        const k = t01 < e0 ? 1 : 1 - (t01 - e0) / (1 - e0);
        const weight = Math.max(0, Math.min(1, k));
        const i = y * s + x;

        switch (this.mode) {
          case 'height-up': t.paint[i] += weight * str * 0.05; break;
          case 'height-dn': t.paint[i] -= weight * str * 0.05; break;
          case 'smooth': {
            if (x > 0 && x < s - 1 && y > 0 && y < s - 1) {
              const avg = (
                t.heights[i - 1] + t.heights[i + 1] +
                t.heights[i - s] + t.heights[i + s] +
                t.heights[i]
              ) / 5;
              t.heights[i] = t.heights[i] * (1 - weight * str) + avg * weight * str;
            }
            break;
          }
          case 'erode': t.paint[i] -= weight * str * 0.02 * (Math.random() - 0.3); break;
          case 'snow': t.snow[i] = Math.min(1, t.snow[i] + weight * str * 0.1); break;
          case 'veg': t.veg[i] = Math.min(1, t.veg[i] + weight * str * 0.1); break;
        }
      }
    }
  }

  clear() {
    this.terrain.paint.fill(0);
    this.terrain.snow.fill(0);
    this.terrain.veg.fill(0);
  }
}
