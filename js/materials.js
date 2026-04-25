// materials.js — Terrain material presets & vertex color generation
import { PerlinNoise } from './noise.js';

const PRESETS = {
  alpine: {
    low:  [0x4a, 0x6b, 0x2a], // grass
    mid:  [0x8a, 0x7a, 0x68], // rock
    high: [0xec, 0xf2, 0xf7], // snow
    water: [0x1e, 0x4a, 0x6e],
  },
  mossy: {
    low:  [0x3a, 0x5a, 0x20], // deep moss
    mid:  [0x6a, 0x8a, 0x40], // bright moss
    high: [0x5a, 0x5a, 0x50], // stone caps
    water: [0x20, 0x4a, 0x40],
  },
  desert: {
    low:  [0xc9, 0xa8, 0x75], // sand
    mid:  [0xa8, 0x80, 0x50], // ochre
    high: [0x60, 0x38, 0x20], // dark rock
    water: [0x3a, 0x6a, 0x80],
  },
  volcanic: {
    low:  [0x3a, 0x15, 0x10], // black rock
    mid:  [0x60, 0x20, 0x18], // dark red
    high: [0xff, 0x60, 0x20], // lava highlight
    water: [0x30, 0x08, 0x04], // lava dark
  },
  alien: {
    low:  [0x20, 0xff, 0xa0], // acid green
    mid:  [0x6a, 0x2a, 0x8a], // purple
    high: [0xff, 0x40, 0xc0], // magenta
    water: [0x40, 0x00, 0x60],
  },
  arctic: {
    low:  [0x60, 0x80, 0xa0], // cold stone
    mid:  [0xa8, 0xc8, 0xe8], // ice blue
    high: [0xff, 0xff, 0xff], // white
    water: [0x10, 0x30, 0x50],
  },
};

export class MaterialSystem {
  constructor() {
    this.current = 'alpine';
    this.noise = new PerlinNoise(2024);
    this.params = {
      snowLine: 0.70,
      moss: 0.40,
      waterLevel: 0.18,
      slopeBlend: 0.60,
    };
  }

  setPreset(name) { if (PRESETS[name]) this.current = name; }
  setParam(key, val) { this.params[key] = val; }

  getPreset() { return PRESETS[this.current]; }

  // Compute color for a single vertex (returns [r,g,b] in 0..1)
  sampleColor(terrain, u, v, height, slope) {
    const p = PRESETS[this.current];
    const { snowLine, moss, waterLevel, slopeBlend } = this.params;

    const snowPaint = Math.max(0, terrain.samplePaint(terrain.snow, u, v));
    const vegPaint = terrain.samplePaint(terrain.veg, u, v);

    // Noise for color variation
    const n = (this.noise.fbm(u * 16, v * 16, 3) + 1) * 0.5;

    // Start with low color
    let r = p.low[0], g = p.low[1], b = p.low[2];

    // Blend to mid based on height
    const midT = Math.min(1, Math.max(0, (height - 0.1) / 0.5));
    r = r * (1 - midT) + p.mid[0] * midT;
    g = g * (1 - midT) + p.mid[1] * midT;
    b = b * (1 - midT) + p.mid[2] * midT;

    // Slope pushes toward mid (rock)
    if (slope > 0.3) {
      const sT = Math.min(1, (slope - 0.3) * 2 * slopeBlend);
      r = r * (1 - sT) + p.mid[0] * sT;
      g = g * (1 - sT) + p.mid[1] * sT;
      b = b * (1 - sT) + p.mid[2] * sT;
    }

    // Moss in low flat areas (for any preset — creates those green streaks)
    if (moss > 0.01 && height < 0.5 && slope < 0.5) {
      const mossT = moss * (1 - slope) * (1 - height * 1.5) * 0.8;
      const mossR = 40, mossG = 100, mossB = 30;
      r = r * (1 - mossT) + mossR * mossT;
      g = g * (1 - mossT) + mossG * mossT;
      b = b * (1 - mossT) + mossB * mossT;
    }

    // Snow on high areas + where not too steep
    const snowMask = Math.max(0, height - snowLine) * (1 - slope * 0.7) * 3;
    const totalSnow = Math.min(1, snowMask + snowPaint);
    if (totalSnow > 0.01) {
      r = r * (1 - totalSnow) + p.high[0] * totalSnow;
      g = g * (1 - totalSnow) + p.high[1] * totalSnow;
      b = b * (1 - totalSnow) + p.high[2] * totalSnow;
    }

    // Vegetation painted
    if (vegPaint > 0.05) {
      const vT = Math.min(0.7, vegPaint);
      r = r * (1 - vT * 0.6) + 50 * vT * 0.6;
      g = g * (1 - vT * 0.3) + 110 * vT * 0.3;
      b = b * (1 - vT * 0.6) + 30 * vT * 0.6;
    }

    // Underwater — darken
    if (height < waterLevel) {
      const depth = (waterLevel - height) / waterLevel;
      const darken = 1 - depth * 0.5;
      r *= darken; g *= darken; b *= darken;
    }

    // Color variation
    const varF = 0.85 + n * 0.3;
    r *= varF; g *= varF; b *= varF;

    return [
      Math.max(0, Math.min(1, r / 255)),
      Math.max(0, Math.min(1, g / 255)),
      Math.max(0, Math.min(1, b / 255)),
    ];
  }
}

export { PRESETS };
