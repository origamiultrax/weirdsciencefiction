// world.js — World ground modes: terrain, checkered, mirror, void
import * as THREE from 'three';

export class WorldManager {
  constructor(scene, terrain, materials, worldSize, worldHeight) {
    this.scene = scene;
    this.terrain = terrain;
    this.materials = materials;
    this.worldSize = worldSize;
    this.worldHeight = worldHeight;
    this.mode = 'terrain';

    this.terrainMesh = null;
    this.terrainGeom = null;
    this.terrainMat = null;
    this.checkerMesh = null;
    this.mirrorMesh = null;
    this.cubeRenderTarget = null; // for chrome reflections
    this.cubeCamera = null;

    this.checkerParams = {
      tile: 1.0,
      colorA: 0xffffff,
      colorB: 0x0a0a18,
      glossy: 0.3,
    };
    this.mirrorParams = {
      tint: 0x0a4870,
      reflectivity: 1.0,
    };

    this._buildTerrain();
    // Reflection probe for chrome objects (always present)
    this._buildEnvProbe();
  }

  _buildTerrain() {
    const s = this.terrain.size;
    this.terrainGeom = new THREE.PlaneGeometry(this.worldSize, this.worldSize, s - 1, s - 1);
    this.terrainGeom.rotateX(-Math.PI / 2);
    const colors = new Float32Array(s * s * 3);
    this.terrainGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: false,
    });
    this.terrainMesh = new THREE.Mesh(this.terrainGeom, this.terrainMat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    this.scene.add(this.terrainMesh);
    this.updateTerrain();
  }

  _buildEnvProbe() {
    // Cube render target for environment reflections (used by chrome objects)
    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(0.5, 2000, this.cubeRenderTarget);
    this.cubeCamera.position.set(0, this.worldHeight * 0.4, 0);
    this.scene.add(this.cubeCamera);
    this.scene.environment = this.cubeRenderTarget.texture;
  }

  updateEnvProbe(renderer) {
    if (!this.cubeCamera) return;
    const wasVisible = {};
    // Hide reflective objects from the probe so they don't reflect themselves
    this.scene.traverse(o => {
      if (o.isMesh && o.material && o.material.metalness > 0.7) {
        wasVisible[o.id] = o.visible;
        o.visible = false;
      }
    });
    this.cubeCamera.update(renderer, this.scene);
    this.scene.traverse(o => {
      if (wasVisible[o.id] !== undefined) o.visible = wasVisible[o.id];
    });
  }

  rebuildTerrainGeometry() {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainGeom.dispose();
    }
    const s = this.terrain.size;
    this.terrainGeom = new THREE.PlaneGeometry(this.worldSize, this.worldSize, s - 1, s - 1);
    this.terrainGeom.rotateX(-Math.PI / 2);
    const colors = new Float32Array(s * s * 3);
    this.terrainGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainMesh = new THREE.Mesh(this.terrainGeom, this.terrainMat);
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.castShadow = true;
    if (this.mode === 'terrain') this.scene.add(this.terrainMesh);
    this.updateTerrain();
  }

  updateTerrain() {
    const s = this.terrain.size;
    const pos = this.terrainGeom.attributes.position;
    const col = this.terrainGeom.attributes.color;
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const idx = j * s + i;
        const u = i / (s - 1);
        const v = j / (s - 1);
        const h = this.terrain.sample(u, v);
        pos.setY(idx, h * this.worldHeight);
        const slope = this.terrain.slope(u, v);
        const c = this.materials.sampleColor(this.terrain, u, v, h, slope);
        col.setXYZ(idx, c[0], c[1], c[2]);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.terrainGeom.computeVertexNormals();
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this._removeCurrent();
    this.mode = mode;
    this._buildCurrent();
  }

  _removeCurrent() {
    if (this.terrainMesh && this.terrainMesh.parent) this.scene.remove(this.terrainMesh);
    if (this.checkerMesh) {
      this.scene.remove(this.checkerMesh);
      this.checkerMesh.geometry.dispose();
      this.checkerMesh.material.dispose();
      this.checkerMesh = null;
    }
    if (this.mirrorMesh) {
      this.scene.remove(this.mirrorMesh);
      this.mirrorMesh.geometry.dispose();
      this.mirrorMesh.material.dispose();
      this.mirrorMesh = null;
    }
  }

  _buildCurrent() {
    switch (this.mode) {
      case 'terrain':
        this.scene.add(this.terrainMesh);
        break;
      case 'checkered':
        this._buildCheckered();
        break;
      case 'mirror':
        this._buildMirror();
        break;
      case 'void':
        // Nothing — pure empty void
        break;
    }
  }

  _buildCheckered() {
    const size = this.worldSize * 6;
    const geom = new THREE.PlaneGeometry(size, size);
    geom.rotateX(-Math.PI / 2);
    const tex = this._makeCheckerTexture();
    const tileRepeat = size / (50 * this.checkerParams.tile);
    tex.repeat.set(tileRepeat, tileRepeat);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 1 - this.checkerParams.glossy,
      metalness: this.checkerParams.glossy * 0.5,
    });
    this.checkerMesh = new THREE.Mesh(geom, mat);
    this.checkerMesh.receiveShadow = true;
    this.scene.add(this.checkerMesh);
  }

  _makeCheckerTexture() {
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    const a = this._hexToRgb(this.checkerParams.colorA);
    const b = this._hexToRgb(this.checkerParams.colorB);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const isA = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
        const c = isA ? a : b;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _hexToRgb(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }

  _buildMirror() {
    // Use chrome material on a plane — uses the env probe texture
    const size = this.worldSize * 4;
    const geom = new THREE.PlaneGeometry(size, size);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: this.mirrorParams.tint,
      roughness: 0.05,
      metalness: 1.0,
      envMapIntensity: this.mirrorParams.reflectivity * 2.0,
    });
    this.mirrorMesh = new THREE.Mesh(geom, mat);
    this.mirrorMesh.receiveShadow = true;
    this.scene.add(this.mirrorMesh);
  }

  setCheckerParam(key, val) {
    this.checkerParams[key] = val;
    if (this.mode === 'checkered') {
      this._removeCurrent();
      this._buildCheckered();
    }
  }

  setMirrorParam(key, val) {
    this.mirrorParams[key] = val;
    if (this.mode === 'mirror') {
      this.mirrorMesh.material.color.set(this.mirrorParams.tint);
      this.mirrorMesh.material.envMapIntensity = this.mirrorParams.reflectivity * 2.0;
    }
  }

  // Sample world height at a UV coord — for placing objects on the world
  sampleHeight(u, v) {
    if (this.mode === 'terrain') {
      return this.terrain.sample(u, v) * this.worldHeight;
    }
    return 0;
  }

  // Get the active raycast target for paint/place operations
  getRaycastMesh() {
    switch (this.mode) {
      case 'terrain': return this.terrainMesh;
      case 'checkered': return this.checkerMesh;
      case 'mirror': return this.mirrorMesh;
      case 'void': return null;
    }
  }

  serialize() {
    return {
      mode: this.mode,
      checker: { ...this.checkerParams },
      mirror: { ...this.mirrorParams },
    };
  }

  deserialize(data) {
    if (!data) return;
    if (data.checker) Object.assign(this.checkerParams, data.checker);
    if (data.mirror) Object.assign(this.mirrorParams, data.mirror);
    if (data.mode) this.setMode(data.mode);
  }
}
