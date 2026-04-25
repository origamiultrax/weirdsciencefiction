// sky.js — Custom sky with: atmospheric scattering, volumetric clouds, gradient bands, planets
import * as THREE from 'three';
import { Sky as ThreeSky } from 'three/addons/objects/Sky.js';

export class SkyManager {
  constructor(scene) {
    this.scene = scene;
    this.mode = 'atmosphere'; // 'atmosphere' | 'gradient'
    this.sun = new THREE.Vector3();

    this.params = {
      // Atmosphere
      elev: 30, azim: 140, turb: 3.0, rayl: 1.5, mie: 0.010, mieG: 0.8,
      // Gradient (vaporwave-style multi-band)
      topColor: 0x1a1040,
      midColor: 0xff4080,
      horizonColor: 0xffd060,
      gradientStops: 0.45,
      // Clouds
      clouds: 0.4,
      cloudSpeed: 0.04,
      cloudHeight: 0.55,
      cloudColor: 0xffffff,
      // Planets
      planet1Enabled: false,
      planet1Size: 0.18,
      planet1Color: 0xff8060,
      planet1Pos: { x: -0.4, y: 0.5 },
      planet2Enabled: false,
      planet2Size: 0.06,
      planet2Color: 0xc0c0d0,
      planet2Pos: { x: 0.3, y: 0.7 },
      // Stars
      stars: 0.0,
    };

    this._buildAtmosphere();
    this._buildGradientDome();
    this._buildClouds();
    this._buildPlanets();
    this._buildStars();
    this._setMode('atmosphere');
    this._update();
  }

  _buildAtmosphere() {
    this.atmosphere = new ThreeSky();
    this.atmosphere.scale.setScalar(10000);
    this.scene.add(this.atmosphere);
  }

  _buildGradientDome() {
    // Inverted sphere with custom 3-band gradient shader
    const geom = new THREE.SphereGeometry(8000, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(this.params.topColor) },
        midColor: { value: new THREE.Color(this.params.midColor) },
        horizonColor: { value: new THREE.Color(this.params.horizonColor) },
        stops: { value: this.params.gradientStops },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 horizonColor;
        uniform float stops;
        varying vec3 vWorldPos;
        void main() {
          // Use normalized Y to drive the gradient
          float t = normalize(vWorldPos).y * 0.5 + 0.5; // 0 (down) -> 1 (up)
          vec3 col;
          if (t < stops) {
            // horizon -> mid
            float k = smoothstep(0.0, stops, t);
            col = mix(horizonColor, midColor, k);
          } else {
            // mid -> top
            float k = smoothstep(stops, 1.0, t);
            col = mix(midColor, topColor, k);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.gradientDome = new THREE.Mesh(geom, mat);
    this.gradientDome.visible = false;
    this.scene.add(this.gradientDome);
  }

  _buildClouds() {
    // Cloud dome — a hemisphere just inside the sky with a procedural cloud shader
    const geom = new THREE.SphereGeometry(7500, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      uniforms: {
        time: { value: 0 },
        density: { value: this.params.clouds },
        speed: { value: this.params.cloudSpeed },
        height: { value: this.params.cloudHeight },
        cloudColor: { value: new THREE.Color(this.params.cloudColor) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float density;
        uniform float speed;
        uniform float height;
        uniform vec3 cloudColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vWorldPos;

        // Hash & noise functions
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * noise(p);
            p *= 2.1;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          // Skip below horizon
          if (dir.y < 0.05) discard;

          // Project sphere direction onto a 2D plane for cloud sampling
          vec2 uv = dir.xz / max(dir.y, 0.05);
          uv = uv * 0.5 + vec2(time * speed, time * speed * 0.6);

          // Layered fbm clouds
          float c1 = fbm(uv * 1.0);
          float c2 = fbm(uv * 2.5 + vec2(2.3, -1.7));
          float clouds = c1 * 0.6 + c2 * 0.4;

          // Threshold based on density (lower density = sparser clouds)
          float thresh = mix(0.7, 0.3, density);
          float a = smoothstep(thresh, thresh + 0.2, clouds);

          // Vertical falloff — clouds fade near horizon and overhead based on height param
          float vBand = 1.0 - abs(dir.y - height) * 1.5;
          vBand = clamp(vBand, 0.0, 1.0);
          a *= vBand;

          // Sun illumination — clouds catch sun color when sun is near
          float sunAlign = max(0.0, dot(dir, normalize(sunDir)));
          vec3 lit = mix(cloudColor * 0.6, cloudColor, sunAlign);
          lit += sunColor * pow(sunAlign, 8.0) * 0.5;

          gl_FragColor = vec4(lit, a * density * 1.4);
        }
      `,
    });
    this.cloudDome = new THREE.Mesh(geom, mat);
    this.cloudDome.position.y = 0;
    this.scene.add(this.cloudDome);
  }

  _buildPlanets() {
    this.planets = [];
    for (let i = 0; i < 2; i++) {
      const geom = new THREE.SphereGeometry(1, 32, 24);
      const mat = new THREE.ShaderMaterial({
        depthWrite: false,
        depthTest: true,
        uniforms: {
          baseColor: { value: new THREE.Color(0xff8060) },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          rim: { value: 0.4 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 baseColor;
          uniform vec3 sunDir;
          uniform float rim;
          varying vec3 vNormal;
          varying vec3 vWorldPos;
          void main() {
            vec3 N = normalize(vNormal);
            vec3 L = normalize(sunDir);
            float lambert = max(0.0, dot(N, L));
            // Soft terminator
            float lit = lambert * 0.85 + 0.15;
            // Procedural surface variation
            float h = sin(vWorldPos.x * 0.05) * cos(vWorldPos.y * 0.04) * sin(vWorldPos.z * 0.06);
            vec3 col = baseColor * lit;
            col *= 0.85 + h * 0.15;
            // Rim light
            float r = pow(1.0 - max(0.0, dot(N, vec3(0,0,1))), 2.0);
            col += baseColor * r * rim * 0.3;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.planets.push(mesh);
    }
  }

  _buildStars() {
    // Simple star field — points scattered on a sphere
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Random point on upper hemisphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.95);
      const r = 7000;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const tone = 0.6 + Math.random() * 0.4;
      const tint = Math.random();
      colors[i * 3] = tone;
      colors[i * 3 + 1] = tone * (0.9 + tint * 0.1);
      colors[i * 3 + 2] = tone * (0.85 + (1 - tint) * 0.15);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geom, mat);
    this.scene.add(this.stars);
  }

  _setMode(mode) {
    this.mode = mode;
    this.atmosphere.visible = (mode === 'atmosphere');
    this.gradientDome.visible = (mode === 'gradient');
  }

  setMode(mode) {
    this._setMode(mode);
    this._update();
  }

  setParam(key, val) {
    if (key in this.params) this.params[key] = val;
    this._update();
  }

  setPlanetPos(idx, x, y) {
    const k = idx === 0 ? 'planet1Pos' : 'planet2Pos';
    this.params[k] = { x, y };
    this._update();
  }

  _update() {
    // Sun position from elevation/azimuth
    const phi = THREE.MathUtils.degToRad(90 - this.params.elev);
    const theta = THREE.MathUtils.degToRad(this.params.azim);
    this.sun.setFromSphericalCoords(1, phi, theta);

    // Atmosphere uniforms
    if (this.atmosphere && this.atmosphere.material) {
      const u = this.atmosphere.material.uniforms;
      u.turbidity.value = this.params.turb;
      u.rayleigh.value = this.params.rayl;
      u.mieCoefficient.value = this.params.mie;
      u.mieDirectionalG.value = this.params.mieG;
      u.sunPosition.value.copy(this.sun);
    }

    // Gradient uniforms
    if (this.gradientDome) {
      const u = this.gradientDome.material.uniforms;
      u.topColor.value.set(this.params.topColor);
      u.midColor.value.set(this.params.midColor);
      u.horizonColor.value.set(this.params.horizonColor);
      u.stops.value = this.params.gradientStops;
    }

    // Cloud uniforms
    if (this.cloudDome) {
      const u = this.cloudDome.material.uniforms;
      u.density.value = this.params.clouds;
      u.speed.value = this.params.cloudSpeed;
      u.height.value = this.params.cloudHeight;
      u.cloudColor.value.set(this.params.cloudColor);
      u.sunDir.value.copy(this.sun);
      // Sun warmth
      const elevFactor = Math.max(0.05, Math.sin(THREE.MathUtils.degToRad(this.params.elev)));
      const warmth = 1 - elevFactor;
      u.sunColor.value.setRGB(1.0, 1.0 - warmth * 0.4, 1.0 - warmth * 0.7);
    }

    // Planets
    [
      { idx: 0, enabled: this.params.planet1Enabled, size: this.params.planet1Size, color: this.params.planet1Color, pos: this.params.planet1Pos },
      { idx: 1, enabled: this.params.planet2Enabled, size: this.params.planet2Size, color: this.params.planet2Color, pos: this.params.planet2Pos },
    ].forEach(({ idx, enabled, size, color, pos }) => {
      const mesh = this.planets[idx];
      mesh.visible = enabled;
      if (!enabled) return;
      // Place on sky dome — convert UV (-1..1, 0..1) to a dome direction
      const az = pos.x * Math.PI;
      const el = THREE.MathUtils.degToRad(pos.y * 89);
      const dist = 6000;
      const r = size * 600;
      mesh.scale.setScalar(r);
      mesh.position.set(
        Math.sin(az) * Math.cos(el) * dist,
        Math.sin(el) * dist,
        Math.cos(az) * Math.cos(el) * dist
      );
      mesh.material.uniforms.baseColor.value.set(color);
      mesh.material.uniforms.sunDir.value.copy(this.sun).normalize();
    });

    // Stars opacity ramps up at low elevation
    if (this.stars) {
      const elev = this.params.elev;
      let starAlpha = this.params.stars;
      if (elev < 5) starAlpha = Math.max(starAlpha, 0.7);
      else if (elev < 15) starAlpha = Math.max(starAlpha, (15 - elev) / 10 * 0.7);
      this.stars.material.opacity = starAlpha;
    }
  }

  tick(dt) {
    if (this.cloudDome) {
      this.cloudDome.material.uniforms.time.value += dt;
    }
  }

  // Sun direction for lights/water
  getSunDir() {
    return this.sun;
  }

  preset(name) {
    const presets = {
      noon: {
        mode: 'atmosphere',
        elev: 60, azim: 140, turb: 3, rayl: 1.2, mie: 0.005,
        clouds: 0.35, cloudColor: 0xffffff, cloudSpeed: 0.04, cloudHeight: 0.5,
        stars: 0,
      },
      sunset: {
        mode: 'atmosphere',
        elev: 6, azim: 220, turb: 8, rayl: 3.5, mie: 0.015,
        clouds: 0.45, cloudColor: 0xffc888, cloudSpeed: 0.04, cloudHeight: 0.45,
        stars: 0,
      },
      dusk: {
        mode: 'atmosphere',
        elev: 2, azim: 250, turb: 15, rayl: 4.0, mie: 0.025,
        clouds: 0.35, cloudColor: 0x9078a0, cloudSpeed: 0.03, cloudHeight: 0.4,
        stars: 0.3,
      },
      alien: {
        mode: 'atmosphere',
        elev: 20, azim: 90, turb: 20, rayl: 0.5, mie: 0.05,
        clouds: 0.5, cloudColor: 0x80ffc0, cloudSpeed: 0.05, cloudHeight: 0.55,
        stars: 0.2,
      },
      vapor: {
        mode: 'gradient',
        elev: 8, azim: 260, turb: 5, rayl: 2, mie: 0.01,
        topColor: 0x1a0840, midColor: 0xff4080, horizonColor: 0xffd060,
        gradientStops: 0.45,
        clouds: 0.25, cloudColor: 0xff80c0, cloudSpeed: 0.02, cloudHeight: 0.55,
        stars: 0.4,
      },
      midnight: {
        mode: 'gradient',
        elev: -5, azim: 0, turb: 1, rayl: 0.5, mie: 0.001,
        topColor: 0x000010, midColor: 0x101030, horizonColor: 0x202060,
        gradientStops: 0.3,
        clouds: 0.15, cloudColor: 0x404060, cloudSpeed: 0.01, cloudHeight: 0.5,
        stars: 1.0,
      },
    };
    const p = presets[name];
    if (!p) return null;
    Object.assign(this.params, p);
    this._setMode(p.mode);
    this._update();
    return p;
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.params));
  }

  deserialize(data) {
    if (!data) return;
    Object.assign(this.params, data);
    this._setMode(this.params.mode || 'atmosphere');
    this._update();
  }
}
