/* =========================================================
   sky.js — Sky gradient, sun, fog, clouds
   ========================================================= */
(function (global) {
  const W = global.WSF;

  class Sky {
    constructor() {
      this.params = {
        time: 120,        // 0..240 where 120 = noon
        azim: 140,        // sun azimuth in degrees
        zenith: '#1a3a6e',
        horizon: '#d68a5c',
        fog: 0.25,
        clouds: 0.50,
        cloudSpd: 0.20,
      };
      this.noise = new W.PerlinNoise(42);
      this.cloudOffset = 0;
    }

    setParam(key, val) { this.params[key] = val; }

    // Sun direction as unit vector (x=east, y=up, z=north)
    sunDir() {
      const t = this.params.time / 240; // 0..1
      const elevation = Math.sin(t * Math.PI) * 0.9 + 0.1; // always a little above horizon at extremes
      const azimRad = this.params.azim * Math.PI / 180;
      const horiz = Math.cos(Math.asin(elevation));
      return {
        x: Math.cos(azimRad) * horiz,
        y: elevation,
        z: Math.sin(azimRad) * horiz,
      };
    }

    // Sun color based on time of day
    sunColor() {
      const t = this.params.time / 240;
      // Warm at sunrise/sunset, white at noon
      const warmth = 1 - Math.sin(t * Math.PI);
      const r = 255;
      const g = Math.round(255 - warmth * 90);
      const b = Math.round(220 - warmth * 190);
      return [r, g, b];
    }

    // Paint sky gradient + sun disk onto canvas context
    render(ctx, w, h, dt) {
      this.cloudOffset += dt * this.params.cloudSpd * 0.02;

      // Base gradient
      const zen = this._hex(this.params.zenith);
      const hor = this._hex(this.params.horizon);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgb(${zen[0]},${zen[1]},${zen[2]})`);
      grad.addColorStop(1, `rgb(${hor[0]},${hor[1]},${hor[2]})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Sun disk
      const dir = this.sunDir();
      const sx = w * 0.5 + dir.x * w * 0.45;
      const sy = h * (1.0 - dir.y * 0.9);
      const sr = Math.max(18, h * 0.06);
      const sc = this.sunColor();
      const sunGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 3);
      sunGrad.addColorStop(0, `rgba(${sc[0]},${sc[1]},${sc[2]},1)`);
      sunGrad.addColorStop(0.3, `rgba(${sc[0]},${sc[1]},${sc[2]},0.6)`);
      sunGrad.addColorStop(1, `rgba(${sc[0]},${sc[1]},${sc[2]},0)`);
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, w, h);

      // Procedural clouds (cheap 2D dome)
      if (this.params.clouds > 0.01) {
        this._renderClouds(ctx, w, h);
      }
    }

    _renderClouds(ctx, w, h) {
      const cloudAmt = this.params.clouds;
      const off = this.cloudOffset;
      // Low-res cloud map
      const cw = 64, ch = 32;
      const img = ctx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const nx = x / cw * 4 + off;
          const ny = y / ch * 2;
          let n = this.noise.fbm(nx, ny, 4);
          n = Math.max(0, (n + 0.2) * 1.4); // brighten
          // Fade toward horizon (bottom of sky)
          const yFade = 1 - y / ch * 0.7;
          let alpha = Math.max(0, n - (1 - cloudAmt) * 0.6) * yFade;
          alpha = Math.min(1, alpha * 1.5);
          const i = (y * cw + x) * 4;
          img.data[i] = 240;
          img.data[i + 1] = 235;
          img.data[i + 2] = 230;
          img.data[i + 3] = alpha * 220;
        }
      }
      // Scale up via offscreen canvas
      const tmp = document.createElement('canvas');
      tmp.width = cw; tmp.height = ch;
      tmp.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(tmp, 0, 0, w, h * 0.65);
    }

    _hex(str) {
      const n = parseInt(str.slice(1), 16);
      return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
    }

    // Ambient sky tint for terrain lighting
    ambient() {
      const zen = this._hex(this.params.zenith);
      const hor = this._hex(this.params.horizon);
      return [
        (zen[0] + hor[0]) * 0.5 / 255,
        (zen[1] + hor[1]) * 0.5 / 255,
        (zen[2] + hor[2]) * 0.5 / 255,
      ];
    }
  }

  W.Sky = Sky;
})(window);
