/* =========================================================
   terrain.js — Heightmap terrain system
   ========================================================= */
(function (global) {

  const W = global.WSF;

  class Terrain {
    constructor(size = 128) {
      this.size = size;
      this.heights = new Float32Array(size * size);
      this.paint = new Float32Array(size * size); // extra painted displacement
      this.snow  = new Float32Array(size * size);
      this.veg   = new Float32Array(size * size);
      this.fog   = new Float32Array(size * size);
      this.sun   = new Float32Array(size * size);
      this.noise = new W.PerlinNoise(1337);

      this.params = {
        freq: 0.40,
        amp: 0.80,
        oct: 5,
        seed: 1337,
        erode: 0.20,
        plateau: 0.00,
        smooth: 0.10,
      };
    }

    setParam(key, val) {
      this.params[key] = val;
      if (key === 'seed') this.noise.reseed(val);
    }

    // Generate full heightmap from params
    generate() {
      const { freq, amp, oct } = this.params;
      const s = this.size;
      const h = this.heights;
      // Base fBM + ridged mix
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const nx = x / s;
          const ny = y / s;
          const f = freq * 4;
          const base = this.noise.fbm(nx * f, ny * f, oct) * 0.6;
          const ridge = this.noise.ridged(nx * f * 0.7, ny * f * 0.7, Math.max(2, oct - 1)) * 0.5;
          let v = (base + ridge * 0.5) * amp;
          // Normalize into [0,1]-ish, clamp later
          h[y * s + x] = v;
        }
      }
      this._normalize();
      if (this.params.plateau > 0) this._applyPlateau(this.params.plateau);
      if (this.params.erode > 0)  this._applyErosion(this.params.erode);
      if (this.params.smooth > 0) this._applySmooth(this.params.smooth);
      this._normalize();
    }

    _normalize() {
      const h = this.heights;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < h.length; i++) {
        if (h[i] < min) min = h[i];
        if (h[i] > max) max = h[i];
      }
      const range = max - min || 1;
      for (let i = 0; i < h.length; i++) {
        h[i] = (h[i] - min) / range;
      }
    }

    // Plateau - squash high peaks toward a level
    _applyPlateau(amount) {
      const h = this.heights;
      const threshold = 1 - amount * 0.5;
      for (let i = 0; i < h.length; i++) {
        if (h[i] > threshold) {
          h[i] = threshold + (h[i] - threshold) * (1 - amount);
        }
      }
    }

    // Fake thermal erosion — multiple passes of redistributing height to neighbors
    _applyErosion(amount) {
      const s = this.size;
      const h = this.heights;
      const iterations = Math.floor(amount * 10) + 2;
      const talus = 0.01;
      for (let it = 0; it < iterations; it++) {
        for (let y = 1; y < s - 1; y++) {
          for (let x = 1; x < s - 1; x++) {
            const i = y * s + x;
            const here = h[i];
            // Find steepest lower neighbor
            let maxDiff = 0, maxIdx = -1;
            const neighbors = [
              (y - 1) * s + x,
              (y + 1) * s + x,
              y * s + (x - 1),
              y * s + (x + 1),
            ];
            for (const ni of neighbors) {
              const diff = here - h[ni];
              if (diff > maxDiff) { maxDiff = diff; maxIdx = ni; }
            }
            if (maxIdx >= 0 && maxDiff > talus) {
              const move = (maxDiff - talus) * 0.5 * amount;
              h[i] -= move;
              h[maxIdx] += move;
            }
          }
        }
      }
    }

    // Box blur smooth
    _applySmooth(amount) {
      const s = this.size;
      const h = this.heights;
      const tmp = new Float32Array(h.length);
      const passes = Math.floor(amount * 3) + 1;
      for (let p = 0; p < passes; p++) {
        for (let y = 1; y < s - 1; y++) {
          for (let x = 1; x < s - 1; x++) {
            const i = y * s + x;
            tmp[i] = (
              h[i] +
              h[i - 1] + h[i + 1] +
              h[i - s] + h[i + s] +
              h[i - s - 1] + h[i - s + 1] +
              h[i + s - 1] + h[i + s + 1]
            ) / 9;
          }
        }
        for (let i = 0; i < h.length; i++) h[i] = h[i] || tmp[i] || h[i];
        // Copy blurred interior back
        for (let y = 1; y < s - 1; y++) {
          for (let x = 1; x < s - 1; x++) {
            const i = y * s + x;
            h[i] = h[i] * (1 - amount) + tmp[i] * amount;
          }
        }
      }
    }

    // Get interpolated height at normalized (u,v) — u,v in [0,1]
    sample(u, v) {
      const s = this.size;
      const px = Math.max(0, Math.min(s - 1.001, u * (s - 1)));
      const py = Math.max(0, Math.min(s - 1.001, v * (s - 1)));
      const x0 = Math.floor(px), y0 = Math.floor(py);
      const fx = px - x0, fy = py - y0;
      const h = this.heights, p = this.paint;
      const i00 = y0 * s + x0;
      const i10 = i00 + 1;
      const i01 = i00 + s;
      const i11 = i01 + 1;
      const a = (h[i00] + p[i00]) * (1 - fx) + (h[i10] + p[i10]) * fx;
      const b = (h[i01] + p[i01]) * (1 - fx) + (h[i11] + p[i11]) * fx;
      return a * (1 - fy) + b * fy;
    }

    // Get slope (0..1) at normalized coords
    slope(u, v) {
      const eps = 1 / this.size;
      const hL = this.sample(u - eps, v);
      const hR = this.sample(u + eps, v);
      const hD = this.sample(u, v - eps);
      const hU = this.sample(u, v + eps);
      const dx = (hR - hL);
      const dy = (hU - hD);
      return Math.min(1, Math.sqrt(dx * dx + dy * dy) * 6);
    }

    // Painted layer sample
    samplePaint(layer, u, v) {
      const s = this.size;
      const px = Math.max(0, Math.min(s - 1.001, u * (s - 1)));
      const py = Math.max(0, Math.min(s - 1.001, v * (s - 1)));
      const x0 = Math.floor(px), y0 = Math.floor(py);
      const fx = px - x0, fy = py - y0;
      const i00 = y0 * s + x0;
      const i10 = i00 + 1;
      const i01 = i00 + s;
      const i11 = i01 + 1;
      const a = layer[i00] * (1 - fx) + layer[i10] * fx;
      const b = layer[i01] * (1 - fx) + layer[i11] * fx;
      return a * (1 - fy) + b * fy;
    }
  }

  W.Terrain = Terrain;
})(window);
