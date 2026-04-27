// scene.js — Three.js orchestrator. Delegates world to WorldManager, sky to SkyManager.
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WorldManager } from './world.js';
import { SkyManager } from './sky.js';

export class SceneManager {
  constructor(canvas, terrain, materials) {
    this.canvas = canvas;
    this.terrain = terrain;
    this.materials = materials;
    this.objects = [];
    this.floatingCubes = [];
    this.trees = [];
    this.treeInstancedMesh = null;

    this.worldSize = 200;
    this.worldHeight = 70;

    this._initThree();
    this._initLights();

    this.sky = new SkyManager(this.scene);
    this.world = new WorldManager(this.scene, terrain, materials, this.worldSize, this.worldHeight);

    this._initWater();
    this._initPost();
    this._initControls();

    this.fogParams = { density: 0.15, color: 0xc8b8a0 };
    this._updateSunLight();
    this._updateFog();
  }

  _initThree() {
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
    this.camera.position.set(this.worldSize * 0.6, this.worldHeight * 1.2, this.worldSize * 0.6);
    this.camera.lookAt(0, this.worldHeight * 0.3, 0);
  }

  _initLights() {
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sunLight.position.set(100, 100, 50);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    const d = 200;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);
    this.ambient = new THREE.HemisphereLight(0xbfd5ff, 0x3a2a1a, 0.6);
    this.scene.add(this.ambient);
  }

  _initWater() {
    const waterGeom = new THREE.PlaneGeometry(this.worldSize * 4, this.worldSize * 4);
    const tex = this._generateWaterNormals(256);
    this.water = new Water(waterGeom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: tex,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor: 0x0a4870,
      distortionScale: 3.5,
      fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.18 * this.worldHeight;
    this.scene.add(this.water);
  }

  _generateWaterNormals(size) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = (Math.sin(x * 0.1) + Math.cos(y * 0.1) + Math.sin((x + y) * 0.07)) * 0.3;
        data[i] = 128 + n * 50;
        data[i + 1] = 128 + Math.cos(y * 0.08) * 40;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.needsUpdate = true;
    return tex;
  }

  setWaterLevel(level) { this.water.position.y = level * this.worldHeight; }
  setWaterEnabled(enabled) { this.water.visible = enabled; }
  setWaterColor(hex) {
    const c = typeof hex === 'string' ? hex : '#' + hex.toString(16).padStart(6, '0');
    this.water.material.uniforms.waterColor.value.set(c);
  }
  setWaterOpacity(opac) { /* hook */ }

  _initPost() {
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  _initControls() {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 1000;
    this.controls.maxPolarAngle = Math.PI - 0.05;
    this.controls.target.set(0, this.worldHeight * 0.25, 0);
  }

  // Sky delegation
  setSkyParam(key, val) { this.sky.setParam(key, val); this._updateSunLight(); this._updateWaterSun(); }
  setSkyMode(mode) { this.sky.setMode(mode); this._updateSunLight(); this._updateWaterSun(); }
  skyPreset(name) {
    const p = this.sky.preset(name);
    if (p) { this._updateSunLight(); this._updateWaterSun(); }
    return p;
  }
  setPlanetPos(idx, x, y) { this.sky.setPlanetPos(idx, x, y); }

  // World delegation
  setWorldMode(mode) { this.world.setMode(mode); }
  setCheckerParam(key, val) { this.world.setCheckerParam(key, val); }
  setMirrorParam(key, val) { this.world.setMirrorParam(key, val); }

  // Terrain delegation
  rebuildTerrainGeometry() { this.world.rebuildTerrainGeometry(); }
  updateTerrain() { this.world.updateTerrain(); }

  // Light + fog
  _updateSunLight() {
    const sun = this.sky.getSunDir();
    this.sunLight.position.copy(sun).multiplyScalar(300);
    const elevFactor = Math.max(0.05, Math.sin(THREE.MathUtils.degToRad(this.sky.params.elev)));
    const warmth = 1 - elevFactor;
    this.sunLight.color.setRGB(1.0, 1.0 - warmth * 0.3, 1.0 - warmth * 0.55);
    this.sunLight.intensity = 1.5 + elevFactor * 1.5;
  }

  _updateWaterSun() {
    if (this.water) {
      this.water.material.uniforms.sunDirection.value.copy(this.sky.getSunDir()).normalize();
    }
  }

  setFog(density, color) {
    this.fogParams.density = density;
    if (color !== undefined) this.fogParams.color = color;
    this._updateFog();
  }

  _updateFog() {
    if (this.fogParams.density > 0.001) {
      this.scene.fog = new THREE.FogExp2(this.fogParams.color, this.fogParams.density * 0.008);
    } else {
      this.scene.fog = null;
    }
  }

  setExposure(v) { this.renderer.toneMappingExposure = v; }
  setBloom(enabled, strength = 0.5) {
    this.bloomPass.enabled = enabled;
    this.bloomPass.strength = strength;
  }
  setWireframe(on) {
    this.wireframe = on;
    if (this.world.terrainMat) this.world.terrainMat.wireframe = on;
  }
  setFov(fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }

  cameraPreset(name) {
    const w = this.worldSize, h = this.worldHeight;
    switch (name) {
      case 'wide': this.camera.position.set(w * 0.7, h * 0.6, w * 0.7); this.camera.fov = 70; break;
      case 'tele': this.camera.position.set(w * 1.5, h * 0.8, w * 1.5); this.camera.fov = 30; break;
      case 'aerial': this.camera.position.set(w * 0.3, h * 2.5, w * 0.3); this.camera.fov = 55; break;
    }
    this.controls.target.set(0, h * 0.25, 0);
    this.camera.updateProjectionMatrix();
  }

  viewPreset(name) {
    const w = this.worldSize, h = this.worldHeight;
    switch (name) {
      case 'persp': this.camera.position.set(w * 0.6, h * 1.2, w * 0.6); break;
      case 'top': this.camera.position.set(0, h * 3, 0.01); break;
      case 'front': this.camera.position.set(0, h * 0.3, w * 1.1); break;
      case 'side': this.camera.position.set(w * 1.1, h * 0.3, 0); break;
    }
    this.controls.target.set(0, h * 0.25, 0);
  }

  resetCamera() {
    this.viewPreset('persp');
    this.camera.fov = 55;
    this.camera.updateProjectionMatrix();
  }

  // Objects
  addPrimitive(type) {
    let geom, mat;
    const scale = 8;
    switch (type) {
      case 'sphere':
        geom = new THREE.SphereGeometry(1, 32, 24);
        mat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.3, metalness: 0.2 });
        break;
      case 'cube':
        geom = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        mat = new THREE.MeshStandardMaterial({ color: 0xa09080, roughness: 0.5 });
        break;
      case 'cone':
        geom = new THREE.ConeGeometry(1, 2, 24);
        mat = new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.6 });
        break;
      case 'cyl':
        geom = new THREE.CylinderGeometry(1, 1, 2, 32);
        mat = new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.4 });
        break;
      case 'torus':
        geom = new THREE.TorusGeometry(1, 0.35, 16, 32);
        mat = new THREE.MeshStandardMaterial({ color: 0xff8040, roughness: 0.4, metalness: 0.3 });
        break;
      case 'chrome':
        geom = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.95, envMapIntensity: 1.5 });
        break;
      case 'pyramid':
        geom = new THREE.ConeGeometry(1.2, 2, 4);
        mat = new THREE.MeshStandardMaterial({ color: 0xc8a870, roughness: 0.5 });
        break;
      case 'arch': {
        // Tall narrow torus, half visible
        geom = new THREE.TorusGeometry(2, 0.15, 8, 32, Math.PI);
        mat = new THREE.MeshStandardMaterial({ color: 0xa0c0e0, roughness: 0.2, metalness: 0.5, envMapIntensity: 1.2 });
        break;
      }
      case 'monolith':
        geom = new THREE.BoxGeometry(0.4, 4, 1.2);
        mat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.15, metalness: 0.4 });
        break;
    }
    if (!geom) return null;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.setScalar(scale);
    const u = 0.3 + Math.random() * 0.4;
    const v = 0.3 + Math.random() * 0.4;
    const yOnGround = this.world.sampleHeight(u, v);
    mesh.position.set(
      (u - 0.5) * this.worldSize,
      yOnGround + scale,
      (v - 0.5) * this.worldSize
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { type, id: Date.now() + Math.random() };
    this.scene.add(mesh);
    this.objects.push(mesh);
    return mesh;
  }

  removeObject(id) {
    const idx = this.objects.findIndex(o => o.userData.id === id);
    if (idx >= 0) {
      const o = this.objects[idx];
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
      this.objects.splice(idx, 1);
    }
  }

  clearObjects() {
    for (const o of this.objects) {
      this.scene.remove(o);
      o.geometry.dispose();
      o.material.dispose();
    }
    this.objects = [];
    this.clearFloatingCubes();
    this.clearTrees();
  }

  spawnFloatingCubes(count, heightFactor) {
    this.clearFloatingCubes();
    for (let i = 0; i < count; i++) {
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.03, metalness: 1.0, envMapIntensity: 2.0,
      });
      const size = 4 + Math.random() * 8;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.scale.setScalar(size);
      const u = Math.random();
      const v = Math.random();
      const yOnGround = this.world.sampleHeight(u, v);
      mesh.position.set(
        (u - 0.5) * this.worldSize,
        yOnGround + this.worldHeight * heightFactor + Math.random() * 20,
        (v - 0.5) * this.worldSize
      );
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        type: 'floatCube',
        id: Date.now() + Math.random(),
        rotSpeed: [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3],
        bobSpeed: 0.3 + Math.random() * 0.6,
        bobAmp: 2 + Math.random() * 4,
        baseY: mesh.position.y,
        phase: Math.random() * Math.PI * 2,
      };
      this.scene.add(mesh);
      this.floatingCubes.push(mesh);
    }
  }

  clearFloatingCubes() {
    for (const c of this.floatingCubes) {
      this.scene.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
    this.floatingCubes = [];
  }

  scatterTrees(density, maxSlope, hMin, hMax) {
    this.clearTrees();
    if (this.world.mode !== 'terrain') return 0;
    const positions = [];
    const attempts = Math.min(2000, density * 8);
    for (let i = 0; i < attempts; i++) {
      if (positions.length >= density) break;
      const u = Math.random();
      const v = Math.random();
      const h = this.terrain.sample(u, v);
      const s = this.terrain.slope(u, v);
      const veg = this.terrain.samplePaint(this.terrain.veg, u, v);
      if (h < hMin || h > hMax) continue;
      if (s > maxSlope) continue;
      if (veg < -0.1) continue;
      positions.push({ u, v, h, scale: 0.7 + Math.random() * 0.8, rot: Math.random() * Math.PI * 2 });
    }
    const trunkGeom = new THREE.CylinderGeometry(0.15, 0.25, 1.6, 6);
    const foliageGeom = new THREE.ConeGeometry(0.8, 2.0, 8);
    foliageGeom.translate(0, 1.6, 0);
    const merged = mergeGeometries([trunkGeom, foliageGeom]);
    const trunkColors = new Float32Array(merged.attributes.position.count * 3);
    const trunkVertCount = trunkGeom.attributes.position.count;
    for (let i = 0; i < merged.attributes.position.count; i++) {
      if (i < trunkVertCount) {
        trunkColors[i * 3] = 0.25; trunkColors[i * 3 + 1] = 0.15; trunkColors[i * 3 + 2] = 0.08;
      } else {
        trunkColors[i * 3] = 0.15; trunkColors[i * 3 + 1] = 0.38; trunkColors[i * 3 + 2] = 0.15;
      }
    }
    merged.setAttribute('color', new THREE.BufferAttribute(trunkColors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.treeInstancedMesh = new THREE.InstancedMesh(merged, mat, positions.length);
    this.treeInstancedMesh.castShadow = true;
    this.treeInstancedMesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    positions.forEach((p, i) => {
      dummy.position.set(
        (p.u - 0.5) * this.worldSize,
        p.h * this.worldHeight,
        (p.v - 0.5) * this.worldSize
      );
      dummy.rotation.y = p.rot;
      dummy.scale.setScalar(p.scale * 3.5);
      dummy.updateMatrix();
      this.treeInstancedMesh.setMatrixAt(i, dummy.matrix);
    });
    this.treeInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.treeInstancedMesh);
    this.trees = positions;
    return positions.length;
  }

  clearTrees() {
    if (this.treeInstancedMesh) {
      this.scene.remove(this.treeInstancedMesh);
      this.treeInstancedMesh.geometry.dispose();
      this.treeInstancedMesh.material.dispose();
      this.treeInstancedMesh = null;
    }
    this.trees = [];
  }

  // Get the active raycast target (for paint/place)
  getRaycastMesh() { return this.world.getRaycastMesh(); }
  get terrainMesh() { return this.world.terrainMesh; } // backwards compat

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.composer.setSize(rect.width, rect.height);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    this.controls.update();
    this.sky.tick(dt);

    if (this.water && this.water.visible) {
      this.water.material.uniforms.time.value += dt * 0.8;
    }

    const now = performance.now() * 0.001;
    for (const c of this.floatingCubes) {
      const u = c.userData;
      c.rotation.x += u.rotSpeed[0] * dt;
      c.rotation.y += u.rotSpeed[1] * dt;
      c.rotation.z += u.rotSpeed[2] * dt;
      c.position.y = u.baseY + Math.sin(now * u.bobSpeed + u.phase) * u.bobAmp;
    }

    // Update env probe occasionally for chrome reflections (not every frame to save perf)
    if (!this._probeFrame) this._probeFrame = 0;
    this._probeFrame++;
    if (this._probeFrame % 60 === 0) {
      this.world.updateEnvProbe(this.renderer);
    }

    this.composer.render();
  }

  triangleCount() {
    let n = 0;
    this.scene.traverse(o => {
      if (o.isMesh && o.geometry && o.geometry.index) {
        n += o.geometry.index.count / 3;
      } else if (o.isMesh && o.geometry) {
        n += o.geometry.attributes.position.count / 3;
      }
    });
    return Math.floor(n);
  }
}

function mergeGeometries(geoms) {
  let vertCount = 0, idxCount = 0;
  for (const g of geoms) {
    vertCount += g.attributes.position.count;
    if (g.index) idxCount += g.index.count;
    else idxCount += g.attributes.position.count;
  }
  const posArr = new Float32Array(vertCount * 3);
  const normArr = new Float32Array(vertCount * 3);
  const idxArr = new Uint32Array(idxCount);
  let vOff = 0, iOff = 0;
  for (const g of geoms) {
    const p = g.attributes.position.array;
    posArr.set(p, vOff * 3);
    if (g.attributes.normal) normArr.set(g.attributes.normal.array, vOff * 3);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idxArr[iOff + i] = g.index.array[i] + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < g.attributes.position.count; i++) idxArr[iOff + i] = i + vOff;
      iOff += g.attributes.position.count;
    }
    vOff += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  merged.setIndex(new THREE.BufferAttribute(idxArr, 1));
  merged.computeVertexNormals();
  return merged;
}
