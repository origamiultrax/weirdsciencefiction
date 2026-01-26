import { lerp } from './utils.js';

// Value noise 2D (fast, decent for terrain)
function hash2(ix, iy, seed) {
  let h = ix * 374761393 + iy * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smoothstep(t){ return t*t*(3-2*t); }

export function valueNoise2D(x, y, seed=1) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = smoothstep(fx), v = smoothstep(fy);

  const a = hash2(ix, iy, seed);
  const b = hash2(ix+1, iy, seed);
  const c = hash2(ix, iy+1, seed);
  const d = hash2(ix+1, iy+1, seed);

  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v) * 2 - 1; // -1..1
}

export function fbm2D(x, y, {
  seed=1, frequency=2, amplitude=14, octaves=5
} = {}) {
  let sum = 0;
  let amp = 1;
  let freq = frequency;
  let norm = 0;

  for (let i=0;i<octaves;i++){
    sum += valueNoise2D(x*freq, y*freq, seed+i*17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  sum /= (norm || 1);
  return sum * amplitude; // world height delta
}
