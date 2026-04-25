// scenes.js — Scene save/load + built-in presets
export class SceneStore {
  constructor(app) {
    this.app = app;
  }

  // Serialize entire app state to a plain JSON object
  serialize() {
    const { terrain, materials, sky, world, scene } = this.app;
    return {
      version: 3,
      timestamp: new Date().toISOString(),
      terrain: {
        size: terrain.size,
        params: { ...terrain.params },
        // We don't save the heightmap itself — we save params and regenerate.
        // Paint layers are saved as base64 Float32 arrays for reproducibility.
        paintBase64: this._floatArrayToB64(terrain.paint),
        snowBase64: this._floatArrayToB64(terrain.snow),
        vegBase64: this._floatArrayToB64(terrain.veg),
      },
      materials: {
        current: materials.current,
        params: { ...materials.params },
      },
      sky: sky.serialize(),
      world: world.serialize(),
      water: {
        enabled: scene.water ? scene.water.visible : true,
        level: materials.params.waterLevel,
        color: scene.water ? '#' + scene.water.material.uniforms.waterColor.value.getHexString() : '#0a4870',
      },
      objects: scene.objects.map(o => ({
        type: o.userData.type,
        position: [o.position.x, o.position.y, o.position.z],
        rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
        scale: o.scale.x,
      })),
      floatingCubes: { count: scene.floatingCubes.length, heightFactor: 0.5 },
      trees: scene.trees.length > 0 ? {
        density: scene.trees.length,
        positions: scene.trees.map(t => [t.u, t.v, t.scale, t.rot]),
      } : null,
      camera: {
        position: [scene.camera.position.x, scene.camera.position.y, scene.camera.position.z],
        target: [scene.controls.target.x, scene.controls.target.y, scene.controls.target.z],
        fov: scene.camera.fov,
      },
      post: {
        bloom: scene.bloomPass ? scene.bloomPass.enabled : false,
        bloomStrength: scene.bloomPass ? scene.bloomPass.strength : 0.5,
        exposure: scene.renderer.toneMappingExposure,
      },
    };
  }

  deserialize(data) {
    if (!data || data.version === undefined) {
      console.warn('Invalid scene data');
      return false;
    }
    const { terrain, materials, sky, world, scene } = this.app;

    // Terrain
    if (data.terrain) {
      if (data.terrain.size && data.terrain.size !== terrain.size) {
        terrain.resize(data.terrain.size);
        world.rebuildTerrainGeometry();
      }
      Object.assign(terrain.params, data.terrain.params || {});
      terrain.generate();
      if (data.terrain.paintBase64) terrain.paint = this._b64ToFloatArray(data.terrain.paintBase64, terrain.size * terrain.size);
      if (data.terrain.snowBase64) terrain.snow = this._b64ToFloatArray(data.terrain.snowBase64, terrain.size * terrain.size);
      if (data.terrain.vegBase64) terrain.veg = this._b64ToFloatArray(data.terrain.vegBase64, terrain.size * terrain.size);
    }

    // Materials
    if (data.materials) {
      materials.setPreset(data.materials.current);
      Object.assign(materials.params, data.materials.params || {});
    }

    // Sky
    if (data.sky) sky.deserialize(data.sky);

    // World
    if (data.world) world.deserialize(data.world);
    world.updateTerrain();

    // Water
    if (data.water) {
      scene.setWaterEnabled(data.water.enabled);
      scene.setWaterLevel(data.water.level);
      if (data.water.color) scene.setWaterColor(data.water.color);
    }

    // Objects
    scene.clearObjects();
    if (data.objects) {
      data.objects.forEach(o => {
        const mesh = scene.addPrimitive(o.type);
        if (mesh) {
          mesh.position.set(...o.position);
          mesh.rotation.set(...o.rotation);
          mesh.scale.setScalar(o.scale);
        }
      });
    }

    // Floating cubes
    if (data.floatingCubes && data.floatingCubes.count > 0) {
      scene.spawnFloatingCubes(data.floatingCubes.count, data.floatingCubes.heightFactor || 0.5);
    }

    // Trees (just regenerate from density — exact positions are noisy)
    if (data.trees && data.trees.density > 0) {
      scene.scatterTrees(data.trees.density, 0.5, 0.1, 0.65);
    }

    // Camera
    if (data.camera) {
      scene.camera.position.set(...data.camera.position);
      scene.controls.target.set(...data.camera.target);
      scene.camera.fov = data.camera.fov;
      scene.camera.updateProjectionMatrix();
      scene.controls.update();
    }

    // Post
    if (data.post) {
      scene.setBloom(data.post.bloom, data.post.bloomStrength);
      scene.setExposure(data.post.exposure);
    }

    return true;
  }

  exportToFile() {
    const data = this.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `wsf_scene_${stamp}.wsf.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          const ok = this.deserialize(data);
          resolve(ok);
        } catch (e) { reject(e); }
      };
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  loadPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return false;
    return this.deserialize(preset());
  }

  listPresets() {
    return Object.keys(PRESETS);
  }

  _floatArrayToB64(arr) {
    const u8 = new Uint8Array(arr.buffer);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }

  _b64ToFloatArray(b64, expectedLen) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Float32Array(u8.buffer, 0, expectedLen);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Built-in scene presets — each returns a full scene JSON object
// ──────────────────────────────────────────────────────────────────────
const PRESETS = {
  bryceClassic: () => ({
    version: 3,
    terrain: { size: 192, params: { freq: 0.5, amp: 1.6, oct: 6, seed: 1337, ridge: 0.7, peak: 0.6, erode: 0.2, plateau: 0, smooth: 0.05 } },
    materials: { current: 'alpine', params: { snowLine: 0.7, moss: 0.4, waterLevel: 0.18, slopeBlend: 0.6 } },
    sky: { mode: 'atmosphere', elev: 30, azim: 140, turb: 3, rayl: 1.5, mie: 0.01, mieG: 0.8, clouds: 0.45, cloudSpeed: 0.04, cloudHeight: 0.5, cloudColor: 0xffffff, planet1Enabled: false, planet2Enabled: false, stars: 0, gradientStops: 0.45, topColor: 0x1a1040, midColor: 0xff4080, horizonColor: 0xffd060 },
    world: { mode: 'terrain', checker: { tile: 1, colorA: 0xffffff, colorB: 0x0a0a18, glossy: 0.3 }, mirror: { tint: 0x0a4870, reflectivity: 1 } },
    water: { enabled: true, level: 0.18, color: '#0a4870' },
    objects: [],
    floatingCubes: { count: 0 },
    trees: { density: 80, positions: [] },
    camera: { position: [120, 84, 120], target: [0, 17, 0], fov: 55 },
    post: { bloom: true, bloomStrength: 0.45, exposure: 1.0 },
  }),

  bryceAlienPlanet: () => ({
    version: 3,
    terrain: { size: 192, params: { freq: 0.6, amp: 1.6, oct: 6, seed: 4242, ridge: 0.85, peak: 0.7, erode: 0.15, plateau: 0, smooth: 0.03 } },
    materials: { current: 'desert', params: { snowLine: 0.85, moss: 0.0, waterLevel: 0.15, slopeBlend: 0.7 } },
    sky: { mode: 'atmosphere', elev: 22, azim: 90, turb: 8, rayl: 2.5, mie: 0.02, mieG: 0.8, clouds: 0.4, cloudSpeed: 0.03, cloudHeight: 0.55, cloudColor: 0xc8d4ff, planet1Enabled: true, planet1Size: 0.45, planet1Color: 0xffb088, planet1Pos: { x: -0.5, y: 0.55 }, planet2Enabled: true, planet2Size: 0.08, planet2Color: 0xa0a0c0, planet2Pos: { x: 0.2, y: 0.7 }, stars: 0.15, gradientStops: 0.45, topColor: 0x1a1040, midColor: 0xff4080, horizonColor: 0xffd060 },
    world: { mode: 'terrain', checker: { tile: 1, colorA: 0xffffff, colorB: 0x0a0a18, glossy: 0.3 }, mirror: { tint: 0x0a4870, reflectivity: 1 } },
    water: { enabled: true, level: 0.15, color: '#3a6080' },
    objects: [],
    floatingCubes: { count: 0 },
    trees: null,
    camera: { position: [110, 60, 110], target: [0, 14, 0], fov: 60 },
    post: { bloom: true, bloomStrength: 0.5, exposure: 1.05 },
  }),

  vaporwavePlaza: () => ({
    version: 3,
    terrain: { size: 128, params: { freq: 0.5, amp: 0, oct: 1, seed: 0, ridge: 0, peak: 0, erode: 0, plateau: 0, smooth: 0 } },
    materials: { current: 'arctic', params: { snowLine: 0.95, moss: 0, waterLevel: 0, slopeBlend: 0 } },
    sky: { mode: 'gradient', elev: 8, azim: 260, turb: 5, rayl: 2, mie: 0.01, mieG: 0.8, topColor: 0x1a0840, midColor: 0xff4080, horizonColor: 0xffd060, gradientStops: 0.45, clouds: 0.2, cloudSpeed: 0.02, cloudHeight: 0.55, cloudColor: 0xff80c0, planet1Enabled: false, planet2Enabled: false, stars: 0.3 },
    world: { mode: 'checkered', checker: { tile: 1, colorA: 0xffffff, colorB: 0x000020, glossy: 0.5 }, mirror: { tint: 0x0a4870, reflectivity: 1 } },
    water: { enabled: false, level: 0, color: '#0a4870' },
    objects: [
      { type: 'cyl', position: [0, 8, 0], rotation: [0, 0, 0], scale: 8 },
      { type: 'sphere', position: [-30, 12, 10], rotation: [0, 0, 0], scale: 6 },
      { type: 'torus', position: [25, 18, -20], rotation: [0.5, 0, 0], scale: 8 },
    ],
    floatingCubes: { count: 0 },
    trees: null,
    camera: { position: [80, 45, 80], target: [0, 10, 0], fov: 55 },
    post: { bloom: true, bloomStrength: 0.7, exposure: 1.1 },
  }),

  chromeSunset: () => ({
    version: 3,
    terrain: { size: 128, params: { freq: 0.3, amp: 0.4, oct: 4, seed: 500, ridge: 0.3, peak: 0.2, erode: 0.1, plateau: 0, smooth: 0.2 } },
    materials: { current: 'volcanic', params: { snowLine: 0.95, moss: 0, waterLevel: 0.2, slopeBlend: 0.5 } },
    sky: { mode: 'gradient', elev: 5, azim: 180, turb: 12, rayl: 3, mie: 0.02, mieG: 0.8, topColor: 0x100828, midColor: 0xc04080, horizonColor: 0xffa040, gradientStops: 0.4, clouds: 0.3, cloudSpeed: 0.03, cloudHeight: 0.45, cloudColor: 0xffc8a0, planet1Enabled: true, planet1Size: 0.3, planet1Color: 0xff8050, planet1Pos: { x: 0, y: 0.25 }, planet2Enabled: false, stars: 0.2 },
    world: { mode: 'mirror', checker: { tile: 1, colorA: 0xffffff, colorB: 0x0a0a18, glossy: 0.3 }, mirror: { tint: 0x100020, reflectivity: 1 } },
    water: { enabled: false, level: 0.2, color: '#0a4870' },
    objects: [
      { type: 'chrome', position: [0, 30, 0], rotation: [0.3, 0.5, 0.2], scale: 12 },
      { type: 'chrome', position: [-30, 25, -15], rotation: [0.1, 0.3, 0.4], scale: 8 },
      { type: 'chrome', position: [35, 20, 20], rotation: [0.5, 0.1, 0.3], scale: 10 },
      { type: 'chrome', position: [10, 45, -30], rotation: [0.2, 0.6, 0.1], scale: 6 },
    ],
    floatingCubes: { count: 8, heightFactor: 0.6 },
    trees: null,
    camera: { position: [70, 35, 80], target: [0, 25, 0], fov: 50 },
    post: { bloom: true, bloomStrength: 0.85, exposure: 1.2 },
  }),

  midnightVoid: () => ({
    version: 3,
    terrain: { size: 128, params: { freq: 0.5, amp: 0, oct: 1, seed: 0, ridge: 0, peak: 0, erode: 0, plateau: 0, smooth: 0 } },
    materials: { current: 'arctic', params: { snowLine: 0.95, moss: 0, waterLevel: 0, slopeBlend: 0 } },
    sky: { mode: 'gradient', elev: -5, azim: 0, turb: 1, rayl: 0.5, mie: 0.001, mieG: 0.8, topColor: 0x000010, midColor: 0x101030, horizonColor: 0x202060, gradientStops: 0.3, clouds: 0.1, cloudSpeed: 0.005, cloudHeight: 0.5, cloudColor: 0x404060, planet1Enabled: true, planet1Size: 0.18, planet1Color: 0xc8c8d0, planet1Pos: { x: 0.4, y: 0.55 }, planet2Enabled: false, stars: 1.0 },
    world: { mode: 'void', checker: { tile: 1, colorA: 0xffffff, colorB: 0x0a0a18, glossy: 0.3 }, mirror: { tint: 0x0a4870, reflectivity: 1 } },
    water: { enabled: false, level: 0, color: '#0a4870' },
    objects: [
      { type: 'sphere', position: [0, 0, 0], rotation: [0, 0, 0], scale: 18 },
      { type: 'torus', position: [0, 0, 0], rotation: [0, 0, 0], scale: 22 },
    ],
    floatingCubes: { count: 12, heightFactor: 0.5 },
    trees: null,
    camera: { position: [60, 25, 60], target: [0, 0, 0], fov: 55 },
    post: { bloom: true, bloomStrength: 1.2, exposure: 1.3 },
  }),

  mossyRidge: () => ({
    version: 3,
    terrain: { size: 192, params: { freq: 0.55, amp: 1.5, oct: 6, seed: 7777, ridge: 0.75, peak: 0.65, erode: 0.3, plateau: 0, smooth: 0.05 } },
    materials: { current: 'mossy', params: { snowLine: 0.85, moss: 0.7, waterLevel: 0.2, slopeBlend: 0.6 } },
    sky: { mode: 'atmosphere', elev: 18, azim: 200, turb: 5, rayl: 2.2, mie: 0.012, mieG: 0.8, clouds: 0.55, cloudSpeed: 0.04, cloudHeight: 0.5, cloudColor: 0xfff0d8, planet1Enabled: false, planet2Enabled: false, stars: 0, gradientStops: 0.45, topColor: 0x1a1040, midColor: 0xff4080, horizonColor: 0xffd060 },
    world: { mode: 'terrain', checker: { tile: 1, colorA: 0xffffff, colorB: 0x0a0a18, glossy: 0.3 }, mirror: { tint: 0x0a4870, reflectivity: 1 } },
    water: { enabled: true, level: 0.2, color: '#1a4838' },
    objects: [],
    floatingCubes: { count: 0 },
    trees: { density: 200, positions: [] },
    camera: { position: [100, 55, 100], target: [0, 16, 0], fov: 55 },
    post: { bloom: true, bloomStrength: 0.5, exposure: 1.0 },
  }),
};
