/* =========================================================
   materials.js — Material presets & slope/height blending
   ========================================================= */
(function (global) {
  const W = global.WSF;

  const PRESETS = {
    rock:  { c1: [107, 99, 88],   c2: [61, 55, 47],   rough: 0.85 },
    snow:  { c1: [236, 242, 247], c2: [184, 196, 208], rough: 0.15 },
    grass: { c1: [74, 107, 42],   c2: [42, 64, 21],   rough: 0.75 },
    water: { c1: [30, 74, 110],   c2: [10, 34, 56],   rough: 0.10 },
    metal: { c1: [139, 133, 128], c2: [58, 53, 48],   rough: 0.30 },
    sand:  { c1: [201, 168, 117], c2: [138, 109, 64], rough: 0.70 },
  };

  class MaterialSystem {
    constructor() {
      this.current = 'rock';
      this.params = {
        variation: 0.30,
        roughness: 0.60,
        scale: 0.50,
        slopeBlend: 0.50,
        snowLine: 0.75,
        waterLevel: 0.20,
      };
      this.noise = new W.PerlinNoise(2024);
    }

    setPreset(name) { if (PRESETS[name]) this.current = name; }
    setParam(key, val) { this.params[key] = val; }

    // Get final blended color for a terrain point
    // Returns [r, g, b] in [0,1]
    sampleColor(terrain, u, v) {
      const h = terrain.sample(u, v);
      const slope = terrain.slope(u, v);
      const { snowLine, waterLevel, slopeBlend, scale, variation } = this.params;

      // Extra painted channels
      const snowPaint = Math.max(0, terrain.samplePaint(terrain.snow, u, v));
      const vegPaint  = terrain.samplePaint(terrain.veg, u, v);

      // Base preset (user selection - acts as the "dominant" coat)
      const base = PRESETS[this.current];

      // Noise for color variation
      const n = (this.noise.fbm(u * 20 / Math.max(0.1, scale), v * 20 / Math.max(0.1, scale), 3) + 1) * 0.5;
      const mixT = n;
      let r = base.c1[0] * (1 - mixT) + base.c2[0] * mixT;
      let g = base.c1[1] * (1 - mixT) + base.c2[1] * mixT;
      let b = base.c1[2] * (1 - mixT) + base.c2[2] * mixT;

      // Apply variation (randomness)
      const rand = (this.noise.noise2D(u * 50, v * 50) + 1) * 0.5;
      const varFactor = 1 + (rand - 0.5) * variation * 0.4;
      r *= varFactor; g *= varFactor; b *= varFactor;

      // --- Height/slope based blending (the Bryce magic) ---

      // Water below waterLevel
      if (h < waterLevel) {
        const wt = Math.min(1, (waterLevel - h) * 4);
        const w = PRESETS.water;
        r = r * (1 - wt) + w.c1[0] * wt;
        g = g * (1 - wt) + w.c1[1] * wt;
        b = b * (1 - wt) + w.c1[2] * wt;
      }

      // Grass on low flat areas (if preset isn't already grass/snow)
      if (this.current !== 'snow' && this.current !== 'water') {
        const lowFlat = Math.max(0, (0.55 - h)) * Math.max(0, (1 - slope * (1 + slopeBlend)));
        if (lowFlat > 0.05) {
          const gt = Math.min(1, lowFlat * 2);
          const gr = PRESETS.grass;
          r = r * (1 - gt) + gr.c1[0] * gt;
          g = g * (1 - gt) + gr.c1[1] * gt;
          b = b * (1 - gt) + gr.c1[2] * gt;
        }
      }

      // Rock on steep slopes (if above water)
      if (h > waterLevel && slope > 0.3) {
        const rt = Math.min(1, (slope - 0.3) * 2 * slopeBlend);
        const rk = PRESETS.rock;
        r = r * (1 - rt) + rk.c1[0] * rt;
        g = g * (1 - rt) + rk.c1[1] * rt;
        b = b * (1 - rt) + rk.c1[2] * rt;
      }

      // Snow on high flat areas + painted snow
      const snowMask = Math.max(0, h - snowLine) * (1 - slope * 0.8) * 4;
      const totalSnow = Math.min(1, snowMask + snowPaint);
      if (totalSnow > 0.01) {
        const sn = PRESETS.snow;
        r = r * (1 - totalSnow) + sn.c1[0] * totalSnow;
        g = g * (1 - totalSnow) + sn.c1[1] * totalSnow;
        b = b * (1 - totalSnow) + sn.c1[2] * totalSnow;
      }

      // Vegetation density painted pushes green
      if (vegPaint > 0.05) {
        const vt = Math.min(0.7, vegPaint);
        r = r * (1 - vt * 0.5) + 60 * vt * 0.5;
        g = g * (1 - vt * 0.3) + 110 * vt * 0.3;
        b = b * (1 - vt * 0.5) + 30 * vt * 0.5;
      }

      return [
        Math.max(0, Math.min(255, r)) / 255,
        Math.max(0, Math.min(255, g)) / 255,
        Math.max(0, Math.min(255, b)) / 255,
      ];
    }
  }

  W.MaterialSystem = MaterialSystem;
  W.MAT_PRESETS = PRESETS;
})(window);
