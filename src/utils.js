export function clamp01(x){ return Math.max(0, Math.min(1, x)); }
export function lerp(a,b,t){ return a + (b-a)*t; }

export function hexToRgb01(hex){
  const c = hex.replace('#','');
  const n = parseInt(c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = (n) & 255;
  return [r/255, g/255, b/255];
}

// Simple seeded RNG
export function mulberry32(seed=1){
  let a = seed >>> 0;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
