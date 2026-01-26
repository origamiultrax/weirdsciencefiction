import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class MaterialSystem {
  constructor(){
    this.params = {
      preset: 'grass',
      variation: 0.25,
      roughness: 0.85,
      scale: 2.2,
      blendSlope: 0.55,
      blendHeight: 0.48,
    };

    // Base palette per preset
    this.presets = {
      grass: { low:'#2e7a3b', mid:'#3e9a45', high:'#b9d7a2' },
      rock:  { low:'#4c4c4c', mid:'#6b6b6b', high:'#9a9a9a' },
      snow:  { low:'#cfd6de', mid:'#eef3f8', high:'#ffffff' },
      water: { low:'#153a66', mid:'#1c5a8f', high:'#6fb1d6' },
      metal: { low:'#3b3b45', mid:'#6e6f79', high:'#c8c9d1' },
    };
  }

  // Terrain shader: slope/height blend + paint masks (snow/veg/mood)
  createTerrainMaterial({ heightTex, maskTex, size=256, heightRange=30 }){
    const uniforms = {
      uHeight: { value: heightTex },
      uMask: { value: maskTex },
      uSize: { value: size },
      uHeightRange: { value: heightRange },
      uPresetLow: { value: new THREE.Color(this.presets[this.params.preset].low) },
      uPresetMid: { value: new THREE.Color(this.presets[this.params.preset].mid) },
      uPresetHigh:{ value: new THREE.Color(this.presets[this.params.preset].high) },
      uVar: { value: this.params.variation },
      uRough: { value: this.params.roughness },
      uScale: { value: this.params.scale },
      uBlendSlope: { value: this.params.blendSlope },
      uBlendHeight:{ value: this.params.blendHeight },
      uSunDir: { value: new THREE.Vector3(0.6, 1.0, 0.3).normalize() },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        varying vec3 vNormalW;
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D uHeight;
        uniform sampler2D uMask; // rgba: snow, veg, erosion, mood
        uniform float uSize;
        uniform float uHeightRange;
        uniform vec3 uPresetLow;
        uniform vec3 uPresetMid;
        uniform vec3 uPresetHigh;
        uniform float uVar;
        uniform float uRough;
        uniform float uScale;
        uniform float uBlendSlope;
        uniform float uBlendHeight;
        uniform vec3 uSunDir;
        varying vec3 vPos;
        varying vec3 vNormalW;
        varying vec2 vUv;

        // tiny hash
        float hash(vec2 p){
          p = fract(p*vec2(123.34, 456.21));
          p += dot(p, p+45.32);
          return fract(p.x*p.y);
        }

        void main(){
          float h = texture2D(uHeight, vUv).r; // 0..1
          vec4 m = texture2D(uMask, vUv);
          float snow = m.r;
          float veg = m.g;
          float erosion = m.b;
          float mood = m.a;

          // slope factor: 0 flat, 1 steep
          float slope = 1.0 - clamp(dot(normalize(vNormalW), vec3(0.0,1.0,0.0)), 0.0, 1.0);

          // height factor: 0 low, 1 high
          float hf = clamp((h - (uBlendHeight*0.5)) / max(0.0001, (1.0 - uBlendHeight*0.5)), 0.0, 1.0);

          // base tri-blend by height
          vec3 base = mix(uPresetLow, uPresetMid, smoothstep(0.15, 0.55, h));
          base = mix(base, uPresetHigh, smoothstep(0.55, 0.95, h));

          // rock-on-steep slopes
          float rockMix = smoothstep(uBlendSlope*0.35, uBlendSlope, slope);
          vec3 rock = vec3(0.30,0.30,0.32) + 0.25*vec3(hash(vUv*uScale*7.0));
          base = mix(base, rock, rockMix);

          // add variation noise
          float n = hash(vUv*uScale*40.0);
          base *= (1.0 + (n-0.5)*uVar*0.6);

          // paint overlays
          // snow paint pushes to white
          base = mix(base, vec3(0.95,0.97,1.0), snow);

          // veg paint pushes greener
          base = mix(base, base*vec3(0.85,1.08,0.85), veg*0.75);

          // fake erosion darkens creases slightly
          base *= (1.0 - erosion*0.18);

          // simple lambert + ambient
          float ndl = max(0.0, dot(normalize(vNormalW), normalize(uSunDir)));
          vec3 lit = base * (0.35 + 0.95*ndl);

          // mood zones: desaturate + haze tint
          float l = dot(lit, vec3(0.299,0.587,0.114));
          vec3 gray = vec3(l);
          lit = mix(lit, gray, mood*0.35);
          lit = mix(lit, vec3(0.78,0.84,0.92), mood*0.12);

          gl_FragColor = vec4(lit, 1.0);
        }
      `,
      fog: false,
    });

    mat.userData._uniforms = uniforms;
    return mat;
  }

  applyParamsToTerrainMaterial(mat){
    const u = mat.userData._uniforms;
    const p = this.params;
    const pal = this.presets[p.preset];

    u.uPresetLow.value.set(pal.low);
    u.uPresetMid.value.set(pal.mid);
    u.uPresetHigh.value.set(pal.high);

    u.uVar.value = p.variation;
    u.uRough.value = p.roughness;
    u.uScale.value = p.scale;
    u.uBlendSlope.value = p.blendSlope;
    u.uBlendHeight.value = p.blendHeight;
  }

  createObjectMaterial(kind='default'){
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd7d7d7,
      roughness: 0.7,
      metalness: 0.1
    });
    if (kind === 'rock'){
      mat.color.set(0x6a6a6a);
      mat.roughness = 0.95;
      mat.metalness = 0.0;
    }
    if (kind === 'tree'){
      mat.color.set(0x3a2c1d);
      mat.roughness = 0.9;
    }
    return mat;
  }
}
