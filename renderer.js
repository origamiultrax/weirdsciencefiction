/* =========================================================
   renderer.js — Software renderer for terrain + objects
   Draws terrain as shaded mesh, painter's algorithm
   ========================================================= */
(function (global) {
  const W = global.WSF;

  class Renderer {
    constructor(canvas, terrain, sky, materials, objects, camera) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.terrain = terrain;
      this.sky = sky;
      this.materials = materials;
      this.objects = objects;
      this.camera = camera;
      this.wireframe = false;
      this.meshRes = 64; // mesh subdivision
      this.quality = 'draft'; // 'draft' | 'final'
    }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(rect.height * dpr);
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      this.dpr = dpr;
    }

    render(dt) {
      const ctx = this.ctx;
      const W_ = this.canvas.width;
      const H_ = this.canvas.height;

      // 1. Sky
      this.sky.render(ctx, W_, H_, dt);

      // 2. Build triangles from heightmap
      const tris = this._buildTerrainTris(W_, H_);

      // 3. Add object sprites (trees, rocks, primitives)
      this._addObjectSprites(tris, W_, H_);

      // 4. Sort back-to-front (painter's)
      tris.sort((a, b) => b.z - a.z);

      // 5. Draw
      this._drawTris(ctx, tris);

      // 6. Fog overlay
      this._applyFog(ctx, W_, H_);
    }

    _buildTerrainTris(W_, H_) {
      const tris = [];
      const t = this.terrain;
      const cam = this.camera;
      const sun = this.sky.sunDir();
      const sunCol = this.sky.sunColor();
      const ambient = this.sky.ambient();
      const exposure = cam.exposure;
      const res = this.meshRes;
      const step = 1 / res;
      const heightScale = 0.35;

      // Precompute projected vertex grid
      const proj = new Array((res + 1) * (res + 1));
      const world = new Array(proj.length);
      const col = new Array(proj.length);
      const normals = new Array(proj.length);

      for (let j = 0; j <= res; j++) {
        for (let i = 0; i <= res; i++) {
          const u = i / res;
          const v = j / res;
          const h = t.sample(u, v);
          const wx = u;
          const wy = h * heightScale;
          const wz = v;
          const idx = j * (res + 1) + i;
          world[idx] = [wx, wy, wz];
          proj[idx] = cam.project([wx, wy, wz], W_, H_);

          // Compute normal by sampling nearby heights
          const eps = step * 0.5;
          const hL = t.sample(Math.max(0, u - eps), v);
          const hR = t.sample(Math.min(1, u + eps), v);
          const hD = t.sample(u, Math.max(0, v - eps));
          const hU = t.sample(u, Math.min(1, v + eps));
          const nx = (hL - hR) * heightScale;
          const nz = (hD - hU) * heightScale;
          const ny = 2 * eps;
          const nl = Math.hypot(nx, ny, nz) || 1;
          normals[idx] = [nx / nl, ny / nl, nz / nl];

          // Sample material color
          const matC = this.materials.sampleColor(t, u, v);

          // Lambert + ambient
          const N = normals[idx];
          const L = Math.max(0, N[0] * sun.x + N[1] * sun.y + N[2] * sun.z);
          const shadow = this._softShadow(t, u, v, sun, heightScale);
          const lit = L * shadow;
          const sunInt = 0.9;

          let r = matC[0] * (ambient[0] * 0.7 + lit * sunCol[0] / 255 * sunInt);
          let g = matC[1] * (ambient[1] * 0.7 + lit * sunCol[1] / 255 * sunInt);
          let b = matC[2] * (ambient[2] * 0.7 + lit * sunCol[2] / 255 * sunInt);

          // Water specular-ish highlight
          if (h < this.materials.params.waterLevel) {
            const spec = Math.pow(Math.max(0, N[1]), 8) * 0.3;
            r += spec; g += spec; b += spec * 1.2;
          }

          // Exposure
          r *= exposure; g *= exposure; b *= exposure;
          // Soft clamp
          r = Math.min(1, r); g = Math.min(1, g); b = Math.min(1, b);
          col[idx] = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }
      }

      // Emit triangles
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const i00 = j * (res + 1) + i;
          const i10 = i00 + 1;
          const i01 = i00 + (res + 1);
          const i11 = i01 + 1;
          const p00 = proj[i00], p10 = proj[i10], p01 = proj[i01], p11 = proj[i11];
          if (!p00 || !p10 || !p01 || !p11) continue;
          const c00 = col[i00], c10 = col[i10], c01 = col[i01], c11 = col[i11];
          // Average color for this quad (two tris, but keep it flat-shaded per-quad for speed)
          const cr = (c00[0] + c10[0] + c01[0] + c11[0]) >> 2;
          const cg = (c00[1] + c10[1] + c01[1] + c11[1]) >> 2;
          const cb = (c00[2] + c10[2] + c01[2] + c11[2]) >> 2;
          const avgZ = (p00.z + p10.z + p01.z + p11.z) * 0.25;

          tris.push({
            pts: [p00, p10, p11],
            color: [cr, cg, cb],
            z: avgZ,
            kind: 'terrain',
          });
          tris.push({
            pts: [p00, p11, p01],
            color: [cr, cg, cb],
            z: avgZ,
            kind: 'terrain',
          });
        }
      }

      return tris;
    }

    // Cheap soft shadow - step along sun dir and see if anything is higher
    _softShadow(t, u, v, sun, hs) {
      if (sun.y < 0.05) return 0.3;
      const steps = 8;
      const stepU = sun.x * 0.02;
      const stepV = sun.z * 0.02;
      const stepH = sun.y * 0.02 / hs;
      let curH = t.sample(u, v);
      let occluded = 0;
      for (let s = 1; s <= steps; s++) {
        const su = u + stepU * s;
        const sv = v + stepV * s;
        if (su < 0 || su > 1 || sv < 0 || sv > 1) break;
        const sh = t.sample(su, sv);
        const rayH = curH + stepH * s;
        if (sh > rayH + 0.01) occluded += 1 / steps;
      }
      return 1 - occluded * 0.7;
    }

    _addObjectSprites(tris, W_, H_) {
      const cam = this.camera;
      const t = this.terrain;
      const hs = 0.35;

      // Trees
      for (const tr of this.objects.trees) {
        const p = cam.project([tr.u, tr.h * hs, tr.v], W_, H_);
        if (!p) continue;
        tris.push({
          sprite: 'tree',
          x: p.x, y: p.y, z: p.z,
          size: tr.size / p.z * H_,
          hue: tr.hue,
          kind: 'tree',
        });
      }

      // Rocks
      for (const rk of this.objects.rocks) {
        const p = cam.project([rk.u, rk.h * hs, rk.v], W_, H_);
        if (!p) continue;
        tris.push({
          sprite: 'rock',
          x: p.x, y: p.y, z: p.z,
          size: rk.size / p.z * H_,
          tone: rk.tone,
          kind: 'rock',
        });
      }

      // Primitive objects
      for (const obj of this.objects.objects) {
        const [u, hy, v] = obj.pos;
        const groundH = t.sample(u, v);
        const p = cam.project([u, groundH * hs + obj.scale, v], W_, H_);
        if (!p) continue;
        tris.push({
          sprite: 'prim',
          x: p.x, y: p.y, z: p.z,
          size: obj.scale / p.z * H_ * 2,
          type: obj.type,
          color: obj.color,
          kind: 'prim',
        });
      }
    }

    _drawTris(ctx, tris) {
      for (const it of tris) {
        if (it.kind === 'terrain') {
          const [a, b, c] = it.pts;
          const [r, g, bl] = it.color;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fillStyle = `rgb(${r},${g},${bl})`;
          ctx.fill();
          if (this.wireframe) {
            ctx.strokeStyle = 'rgba(125,255,66,0.4)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        } else if (it.sprite === 'tree') {
          this._drawTree(ctx, it);
        } else if (it.sprite === 'rock') {
          this._drawRock(ctx, it);
        } else if (it.sprite === 'prim') {
          this._drawPrim(ctx, it);
        }
      }
    }

    _drawTree(ctx, it) {
      const s = Math.max(4, it.size);
      const x = it.x, y = it.y;
      // Trunk
      ctx.fillStyle = '#3a2818';
      ctx.fillRect(x - s * 0.08, y - s * 0.3, s * 0.16, s * 0.3);
      // Foliage - stacked triangles
      const fHue = it.hue;
      ctx.fillStyle = `hsl(${fHue},45%,22%)`;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.1);
      ctx.lineTo(x - s * 0.5, y - s * 0.3);
      ctx.lineTo(x + s * 0.5, y - s * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `hsl(${fHue},50%,28%)`;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.85);
      ctx.lineTo(x - s * 0.4, y - s * 0.15);
      ctx.lineTo(x + s * 0.4, y - s * 0.15);
      ctx.closePath();
      ctx.fill();
    }

    _drawRock(ctx, it) {
      const s = Math.max(3, it.size);
      const t = it.tone;
      ctx.fillStyle = `rgb(${t},${t - 10},${t - 20})`;
      ctx.beginPath();
      ctx.ellipse(it.x, it.y - s * 0.3, s * 0.7, s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Shadow highlight
      ctx.fillStyle = `rgba(255,255,255,0.15)`;
      ctx.beginPath();
      ctx.ellipse(it.x - s * 0.2, it.y - s * 0.45, s * 0.3, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    _drawPrim(ctx, it) {
      const s = Math.max(5, it.size);
      const [r, g, b] = it.color;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      switch (it.type) {
        case 'sphere':
          ctx.beginPath();
          ctx.arc(it.x, it.y, s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.arc(it.x - s * 0.3, it.y - s * 0.3, s * 0.3, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'cube':
          ctx.fillRect(it.x - s, it.y - s, s * 2, s * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(it.x - s, it.y - s, s * 2, s * 0.3);
          break;
        case 'cone':
          ctx.beginPath();
          ctx.moveTo(it.x, it.y - s * 1.2);
          ctx.lineTo(it.x - s, it.y + s * 0.5);
          ctx.lineTo(it.x + s, it.y + s * 0.5);
          ctx.closePath();
          ctx.fill();
          break;
        case 'cyl':
          ctx.fillRect(it.x - s * 0.7, it.y - s, s * 1.4, s * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(it.x - s * 0.7, it.y + s * 0.7, s * 1.4, s * 0.3);
          break;
        default:
          ctx.beginPath();
          ctx.arc(it.x, it.y, s, 0, Math.PI * 2);
          ctx.fill();
      }
    }

    _applyFog(ctx, W_, H_) {
      const fogAmt = this.sky.params.fog;
      if (fogAmt < 0.01) return;
      const hor = this.sky._hex(this.sky.params.horizon);
      const grad = ctx.createLinearGradient(0, H_ * 0.4, 0, H_);
      grad.addColorStop(0, `rgba(${hor[0]},${hor[1]},${hor[2]},0)`);
      grad.addColorStop(1, `rgba(${hor[0]},${hor[1]},${hor[2]},${fogAmt * 0.5})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W_, H_);

      // Distance haze at horizon line
      const hazeGrad = ctx.createLinearGradient(0, 0, 0, H_);
      hazeGrad.addColorStop(0, `rgba(${hor[0]},${hor[1]},${hor[2]},0)`);
      hazeGrad.addColorStop(0.55, `rgba(${hor[0]},${hor[1]},${hor[2]},${fogAmt * 0.25})`);
      hazeGrad.addColorStop(0.75, `rgba(${hor[0]},${hor[1]},${hor[2]},0)`);
      ctx.fillStyle = hazeGrad;
      ctx.fillRect(0, 0, W_, H_);
    }
  }

  W.Renderer = Renderer;
})(window);
