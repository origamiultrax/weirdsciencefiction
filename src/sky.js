import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { hexToRgb01, lerp, clamp01 } from './utils.js';

export class SkySystem {
  constructor({ scene, renderer, pmrem }){
    this.scene = scene;
    this.renderer = renderer;

    this.params = {
      timeOfDay: 0.62,
      fogDensity: 0.018,
      cloudAmount: 0.55,
      zenith: '#2b4a8f',
      horizon:'#d7b58a'
    };

    this.sunDir = new THREE.Vector3(0.6, 1.0, 0.3).normalize();

    this._skyMesh = this._createSkyDome();
    this.scene.add(this._skyMesh);

    this._cloudMesh = this._createCloudDome();
    this.scene.add(this._cloudMesh);

    // fog (depth-style)
    this.scene.fog = new THREE.FogExp2(0xcfd7e2, this.params.fogDensity);
  }

  _createSkyDome(){
    const geo = new THREE.SphereGeometry(600, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms:{
        uZen:{ value: new THREE.Color(this.params.zenith) },
        uHor:{ value: new THREE.Color(this.params.horizon) },
        uSun:{ value: new THREE.Vector3(0.6,1.0,0.3).normalize() },
        uSunPow:{ value: 120.0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        varying vec3 vPos;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPos = wp.xyz;
          vDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 uZen;
        uniform vec3 uHor;
        uniform vec3 uSun;
        uniform float uSunPow;
        varying vec3 vDir;

        void main(){
          float t = clamp(vDir.y*0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHor, uZen, smoothstep(0.0, 1.0, t));

          // sun glow
          float s = max(0.0, dot(normalize(vDir), normalize(uSun)));
          float glow = pow(s, uSunPow) * 2.0 + pow(s, 20.0)*0.25;
          col += vec3(1.0, 0.95, 0.85) * glow;

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  _createCloudDome(){
    const geo = new THREE.SphereGeometry(580, 48, 32, 0, Math.PI*2, 0, Math.PI*0.52);
    const tex = this._makeCloudTexture(512);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 20;
    mesh.rotation.x = Math.PI; // flip
    return mesh;
  }

  _makeCloudTexture(size){
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');

    // simple layered noise blobs
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,size,size);

    for (let layer=0; layer<5; layer++){
      const count = 220 - layer*30;
      const rad = 22 + layer*10;
      for (let i=0;i<count;i++){
        const x = Math.random()*size;
        const y = Math.random()*size;
        const g = ctx.createRadialGradient(x,y,0,x,y,rad);
        g.addColorStop(0, `rgba(255,255,255,${0.08+layer*0.03})`);
        g.addColorStop(1, `rgba(255,255,255,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x,y,rad,0,Math.PI*2);
        ctx.fill();
      }
    }

    // contrast
    const img = ctx.getImageData(0,0,size,size);
    for (let i=0;i<img.data.length;i+=4){
      let v = img.data[i]/255;
      v = Math.pow(v, 0.75);
      img.data[i] = img.data[i+1] = img.data[i+2] = Math.floor(v*255);
      img.data[i+3] = Math.floor(v*255);
    }
    ctx.putImageData(img,0,0);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  setSunFromTime(t01){
    // t=0 sunrise east, t=0.5 noon, t=1 sunset west
    const ang = lerp(-Math.PI*0.15, Math.PI*1.15, t01);
    const elev = Math.sin(t01*Math.PI) * 0.9 + 0.05;
    const x = Math.cos(ang);
    const z = Math.sin(ang);
    this.sunDir.set(x, elev, z).normalize();

    // update sky uniforms
    this._skyMesh.material.uniforms.uSun.value.copy(this.sunDir);

    // match scene key light if found
    const sun = this.scene.children
      .flatMap(o => (o.isGroup ? o.children : [o]))
      .find(o => o.isDirectionalLight);
    if (sun){
      sun.position.set(this.sunDir.x*120, this.sunDir.y*150 + 30, this.sunDir.z*120);
      sun.intensity = 0.85 + elev*0.75;
      sun.color.setHSL(0.1, 0.15, clamp01(0.6 + elev*0.35));
    }
  }

  update(t){
    // subtle scroll
    const m = this._cloudMesh.material;
    if (m.map){
      m.map.offset.x = (t*0.002) % 1;
      m.map.offset.y = (t*0.001) % 1;
    }
    m.opacity = 0.08 + this.params.cloudAmount*0.72;
  }

  applyParams(){
    const skyU = this._skyMesh.material.uniforms;
    skyU.uZen.value.set(this.params.zenith);
    skyU.uHor.value.set(this.params.horizon);

    this.setSunFromTime(this.params.timeOfDay);

    if (this.scene.fog){
      this.scene.fog.density = this.params.fogDensity;
      this.scene.fog.color.set('#cfd7e2');
    }
  }
}
