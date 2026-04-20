/* =========================================================
   objects.js — Primitives, rocks, trees, scatter system
   ========================================================= */
(function (global) {
  const W = global.WSF;

  let NEXT_ID = 1;

  function makePrimitive(type, opts = {}) {
    return {
      id: NEXT_ID++,
      type,
      pos: opts.pos || [0.5, 0.2, 0.5], // u, height, v
      scale: opts.scale || 0.08,
      color: opts.color || [200, 200, 200],
      boolOp: opts.boolOp || null, // 'union' | 'subtract'
      seed: opts.seed || Math.random() * 9999,
    };
  }

  class ObjectSystem {
    constructor() {
      this.objects = [];
      this.trees = [];
      this.rocks = [];
    }

    add(type) {
      const defaults = {
        sphere: { scale: 0.06, color: [180, 180, 180] },
        cube:   { scale: 0.07, color: [160, 140, 120] },
        cone:   { scale: 0.08, color: [200, 180, 140] },
        cyl:    { scale: 0.06, color: [140, 150, 160] },
        rock:   { scale: 0.05, color: [110, 100, 90] },
        tree:   { scale: 0.04, color: [60, 100, 40] },
      };
      const opts = defaults[type] || {};
      // Random placement on terrain
      opts.pos = [
        0.3 + Math.random() * 0.4,
        0.3,
        0.3 + Math.random() * 0.4,
      ];
      const obj = makePrimitive(type, opts);
      this.objects.push(obj);
      return obj;
    }

    remove(id) {
      this.objects = this.objects.filter(o => o.id !== id);
    }

    clear() { this.objects = []; this.trees = []; this.rocks = []; }

    // Scatter trees on terrain based on slope and height
    scatter(terrain, density, maxSlope, minHeight, maxHeight) {
      this.trees = [];
      const count = Math.floor(density * 4);
      for (let i = 0; i < count; i++) {
        const u = Math.random();
        const v = Math.random();
        const h = terrain.sample(u, v);
        const s = terrain.slope(u, v);
        const vegPaint = terrain.samplePaint(terrain.veg, u, v);
        // Conditions: within height range, below slope threshold
        if (h < minHeight || h > maxHeight) continue;
        if (s > maxSlope) continue;
        if (vegPaint < -0.1) continue; // user painted away
        this.trees.push({
          u, v, h,
          size: 0.015 + Math.random() * 0.025,
          lean: (Math.random() - 0.5) * 0.3,
          hue: 60 + Math.random() * 60, // green variance
        });
      }
      return this.trees.length;
    }

    // Build rock cluster (like parametric rocks)
    addRock(u, v, terrain) {
      const h = terrain.sample(u, v);
      const clusters = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < clusters; i++) {
        this.rocks.push({
          u: u + (Math.random() - 0.5) * 0.05,
          v: v + (Math.random() - 0.5) * 0.05,
          h: h,
          size: 0.02 + Math.random() * 0.03,
          tone: 80 + Math.random() * 60,
        });
      }
    }
  }

  W.ObjectSystem = ObjectSystem;
})(window);
