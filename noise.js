/* =========================================================
   noise.js — Seeded Perlin noise & fBM
   ========================================================= */
(function (global) {

  // Mulberry32 seeded PRNG
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Classic Perlin with permutation table
  class PerlinNoise {
    constructor(seed = 1337) {
      this.reseed(seed);
    }
    reseed(seed) {
      const rng = mulberry32(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      // Fisher-Yates shuffle
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }
    grad(hash, x, y) {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    }
    noise2D(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = this.fade(x);
      const v = this.fade(y);
      const p = this.perm;
      const A = p[X] + Y, AA = p[A], AB = p[A + 1];
      const B = p[X + 1] + Y, BA = p[B], BB = p[B + 1];
      return this.lerp(
        this.lerp(this.grad(p[AA], x, y), this.grad(p[BA], x - 1, y), u),
        this.lerp(this.grad(p[AB], x, y - 1), this.grad(p[BB], x - 1, y - 1), u),
        v
      );
    }
    // Fractional Brownian Motion
    fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += amp * this.noise2D(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
      }
      return sum / norm;
    }
    // Ridged noise (inverted abs - good for sharp ridges)
    ridged(x, y, octaves = 5) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < octaves; i++) {
        let n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
        n *= n;
        sum += amp * n;
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
      }
      return (sum / norm) * 2 - 1;
    }
  }

  global.WSF = global.WSF || {};
  global.WSF.PerlinNoise = PerlinNoise;
  global.WSF.mulberry32 = mulberry32;

})(window);
