import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { fbm2D } from './noise.js';
import { clamp01 } from './utils.js';

export class TerrainSystem {
  constructor({ scene, materials }){
    this.scene = scene;
    this.materials = materials;

    this.size = 256;     // heightmap resolution
    this.worldSize = 140; // plane size
    this.heightRange = 30;

    this.params = {
      frequency: 2.0,
      amplitude: 14.0,
      octaves: 5,
      erosion: 0.25,
      smooth: 0.15,
      plateau: 0.12,
      seed: 1337,
    };

    // Height data 0..1
    this.height = new Float32Array(this.size*this.size);
    // Mask RGBA (snow, veg, erosion, mood) 0..1
    this.mask = new Float32Array(this.size*this.size*4);

    this.heightTex = new THREE.DataTexture(this._heightToUint8(), this.size, this.size, THREE.RedFormat);
    this.heightTex.needsUpdate = true;
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.minFilter = THREE.LinearMipMapLinearFilter;

    this.maskTex = new THREE.DataTexture(this._maskToUint8RGBA(), this.size, this.size, THREE.RGBAFormat);
    this.maskTex.needsUpdate = true;
    this.maskTex.magFilter = THREE.LinearFilter;
    this.maskTex.minFilter = THREE.LinearMipMapLinearFilter;

    this.mesh = null;
    this.material = null;

    this._buildMesh();
    this.regenerate(true);
  }

  _buildMesh(){
    const geo = new THREE.PlaneGeometry(this.worldSize, this.worldSize, this.size-1, this.size-1);
    geo.rotateX(-Math.PI/2);

    this.material = this.materials.createTerrainMaterial({
      heightTex: this.heightTex,
      maskTex: this.maskTex,
      size: this.size,
      heightRange: this.heightRange
    });

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.position.y = 0;

    this.mesh = mesh;
    this.scene.add(mesh);

    // invisible collider uses same geom (raycast works)
  }

  resetMasks(){
    this.mask.fill(0);
    this._updateMaskTex();
  }

  regenerate(resetMasks=false){
    if (resetMasks) this.resetMasks();

    // Generate
    const N = this.size;
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        const u = x/(N-1);
        const v = y/(N-1);

        // Centered coords for nicer landmass
        const cx = u - 0.5, cy = v - 0.5;
        const r = Math.sqrt(cx*cx + cy*cy);
        const island = clamp01(1.0 - r*1.55);

        const h = fbm2D(cx, cy, {
          seed: this.params.seed,
          frequency: this.params.frequency,
          amplitude: this.params.amplitude,
          octaves: this.params.octaves
        });

        // Normalize-ish to 0..1
        let val = (h / (this.heightRange*1.15)) * 0.5 + 0.5;

        // plateau: quantize slightly
        if (this.params.plateau > 0){
          const steps = 2 + Math.floor(this.params.plateau * 18);
          val = Math.round(val * steps) / steps;
        }

        // island shaping
        val = clamp01(val * island + 0.02);

        this.height[y*N + x] = val;
      }
    }

    // fake erosion: blur + downhill smear
    this._applyErosion(this.params.erosion);

    // smoothing
    if (this.params.smooth > 0) this._blur(this.params.smooth);

    this._applyToGeometry();
    this._updateHeightTex();
  }

  _applyErosion(k){
    if (k <= 0) return;
    const N = this.size;
    const tmp = new Float32Array(this.height.length);

    // 1) blur a bit
    tmp.set(this.height);
    for (let pass=0; pass<2; pass++){
      for (let y=1;y<N-1;y++){
        for (let x=1;x<N-1;x++){
          const i = y*N+x;
          const c = tmp[i];
          const n = tmp[i-N], s = tmp[i+N], w = tmp[i-1], e = tmp[i+1];
          const avg = (c+n+s+w+e)/5;
          this.height[i] = c*(1-k*0.6) + avg*(k*0.6);
        }
      }
      tmp.set(this.height);
    }

    // 2) cheap downhill smear (push height slightly along local gradient)
    tmp.set(this.height);
    for (let y=1;y<N-1;y++){
      for (let x=1;x<N-1;x++){
        const i = y*N+x;
        const c = tmp[i];
        const gx = (tmp[i+1]-tmp[i-1])*0.5;
        const gy = (tmp[i+N]-tmp[i-N])*0.5;
        const d = Math.sqrt(gx*gx+gy*gy);

        const smear = clamp01(d*3.0) * k*0.12;
        this.height[i] = clamp01(c - smear);
        // store some erosion mask
        const mi = i*4;
        this.mask[mi+2] = clamp01(this.mask[mi+2] + smear*2.2);
      }
    }
    this._updateMaskTex();
  }

  _blur(amount){
    const N = this.size;
    const tmp = new Float32Array(this.height.length);
    tmp.set(this.height);

    const a = clamp01(amount);
    for (let y=1;y<N-1;y++){
      for (let x=1;x<N-1;x++){
        const i = y*N+x;
        const c = tmp[i];
        const n = tmp[i-N], s = tmp[i+N], w = tmp[i-1], e = tmp[i+1];
        const avg = (c+n+s+w+e)/5;
        this.height[i] = c*(1-a) + avg*a;
      }
    }
  }

  _applyToGeometry(){
    const pos = this.mesh.geometry.attributes.position;
    const N = this.size;
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        const i = y*N + x;
        const h = this.height[i] * this.heightRange;
        const idx = i*3;
        pos.array[idx+1] = h;
      }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
  }

  _heightToUint8(){
    const out = new Uint8Array(this.size*this.size);
    for (let i=0;i<this.height.length;i++){
      out[i] = Math.max(0, Math.min(255, Math.floor(this.height[i]*255)));
    }
    return out;
  }

  _maskToUint8RGBA(){
    const out = new Uint8Array(this.size*this.size*4);
    for (let i=0;i<this.size*this.size;i++){
      const mi = i*4;
      out[mi+0] = Math.floor(clamp01(this.mask[mi+0])*255);
      out[mi+1] = Math.floor(clamp01(this.mask[mi+1])*255);
      out[mi+2] = Math.floor(clamp01(this.mask[mi+2])*255);
      out[mi+3] = Math.floor(clamp01(this.mask[mi+3])*255);
    }
    return out;
  }

  _updateHeightTex(){
    this.heightTex.image.data = this._heightToUint8();
    this.heightTex.needsUpdate = true;
  }
  _updateMaskTex(){
    this.maskTex.image.data = this._maskToUint8RGBA();
    this.maskTex.needsUpdate = true;
  }

  // Painting hooks
  paintAtUV(uv, mode, radiusWorld, strength, sign=+1){
    const N = this.size;
    const x = Math.floor(uv.x*(N-1));
    const y = Math.floor((1-uv.y)*(N-1)); // because plane UV vs texture UV
    const r = Math.max(1, Math.floor((radiusWorld/this.worldSize) * N));

    const falloff = (d, r) => {
      const t = Math.max(0, 1 - d/r);
      return t*t*(3-2*t);
    };

    for (let yy=y-r; yy<=y+r; yy++){
      if (yy<0||yy>=N) continue;
      for (let xx=x-r; xx<=x+r; xx++){
        if (xx<0||xx>=N) continue;
        const dx = xx-x, dy = yy-y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d>r) continue;

        const w = falloff(d,r) * strength;
        const i = yy*N + xx;

        if (mode === 'height'){
          this.height[i] = clamp01(this.height[i] + sign*w*0.012);
        } else {
          const mi = i*4;
          if (mode === 'snow') this.mask[mi+0] = clamp01(this.mask[mi+0] + sign*w*0.06);
          if (mode === 'veg')  this.mask[mi+1] = clamp01(this.mask[mi+1] + sign*w*0.06);
          if (mode === 'erosion') this.mask[mi+2] = clamp01(this.mask[mi+2] + sign*w*0.06);
          if (mode === 'mood') this.mask[mi+3] = clamp01(this.mask[mi+3] + sign*w*0.06);
        }
      }
    }

    if (mode === 'height'){
      this._applyToGeometry();
      this._updateHeightTex();
    } else {
      this._updateMaskTex();
    }
  }
}
