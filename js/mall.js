// mall.js — Procedural mall interior
// Multi-level: ground corridor + atrium + upper balcony + escalator
// Storefronts with lit interiors and mannequin silhouettes
import * as THREE from 'three';

const FLOOR_LEN = 240;     // total length of corridor (z axis)
const FLOOR_WIDTH = 50;    // width of corridor (x axis)
const FLOOR_HEIGHT = 14;   // ceiling height per level
const ATRIUM_RADIUS = 22;  // open atrium opening on upper floor
const ATRIUM_Z = 0;        // center of atrium
const STORE_DEPTH = 12;    // how deep stores recede into walls
const STORE_WIDTH = 16;    // storefront width
const STOREFRONT_HEIGHT = 11;

export class Mall {
  constructor(scene, worldSize, worldHeight) {
    this.scene = scene;
    this.worldSize = worldSize;
    this.worldHeight = worldHeight;

    this.group = new THREE.Group();
    this.group.name = 'MallGroup';

    // Reusable disposables
    this._geoms = [];
    this._mats = [];
    this._textures = [];

    this.params = {
      preset: 'deadMall',
      floorPattern: 'diamond',     // 'diamond' | 'checker' | 'grid'
      floorColorA: 0xf5e8d8,
      floorColorB: 0xe8a8b8,
      floorColorC: 0x8090b0,       // accent for diamond
      ceilingColor: 0xffe8d4,
      neonColor: 0xff4080,
      ambientTint: 0xff80a0,
      storeDensity: 0.85,          // chance per slot
      mannequinDensity: 0.7,
      palmCount: 6,
      columnsEnabled: true,
      escalatorEnabled: true,
      neonStrips: true,
      flickerEnabled: true,
    };

    // Lights specific to the mall (ambient pink wash, fluorescent ceilings)
    this.lights = [];
    this.flickerLights = [];

    // Interactive ground plane for raycasting (paint/place clicks)
    this.groundPlane = null;
    this._build();
  }

  _track(o) {
    if (o.geometry) this._geoms.push(o.geometry);
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => this._mats.push(m));
    }
    return o;
  }

  attach() {
    this.scene.add(this.group);
  }

  detach() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.lights.forEach(l => { if (l.parent) l.parent.remove(l); });
  }

  dispose() {
    this.detach();
    this._geoms.forEach(g => g.dispose());
    this._mats.forEach(m => m.dispose());
    this._textures.forEach(t => t.dispose());
    this._geoms.length = 0;
    this._mats.length = 0;
    this._textures.length = 0;
    this.group.clear();
  }

  rebuild() {
    this.dispose();
    this.group = new THREE.Group();
    this.group.name = 'MallGroup';
    this._build();
    this.attach();
  }

  setPreset(name) {
    this.params.preset = name;
    const presets = MALL_PRESETS[name];
    if (presets) Object.assign(this.params, presets);
    this.rebuild();
  }

  setParam(key, val) {
    this.params[key] = val;
    // Some params need full rebuild, others can be hot-swapped
    const hotSwap = ['ambientTint', 'neonColor', 'flickerEnabled'];
    if (hotSwap.includes(key)) {
      this._updateLighting();
    } else {
      this.rebuild();
    }
  }

  _build() {
    this._buildFloors();
    this._buildAtriumOpening();
    this._buildCeilings();
    this._buildWalls();
    this._buildStorefronts();
    this._buildBalconyRailing();
    if (this.params.escalatorEnabled) this._buildEscalator();
    if (this.params.columnsEnabled) this._buildColumns();
    if (this.params.neonStrips) this._buildNeonStrips();
    this._buildPalms();
    this._buildBenches();
    this._buildLighting();
    this._buildSkylight();
  }

  // ────── Floors ──────
  _buildFloors() {
    // Ground floor (continuous)
    const groundTex = this._makeFloorTexture();
    const groundGeom = new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_LEN);
    groundGeom.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.4,
      metalness: 0.15,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.y = 0;
    ground.receiveShadow = true;
    ground.userData.mallGround = true;
    this.groundPlane = ground;
    this.group.add(this._track(ground));

    // Upper floor (with hole for atrium)
    const upper = this._buildUpperFloorWithHole();
    upper.position.y = FLOOR_HEIGHT;
    upper.receiveShadow = true;
    this.group.add(upper);
  }

  _buildUpperFloorWithHole() {
    // Build the upper floor as a Shape with a circular hole (atrium opening)
    const shape = new THREE.Shape();
    const halfW = FLOOR_WIDTH / 2;
    const halfL = FLOOR_LEN / 2;
    shape.moveTo(-halfW, -halfL);
    shape.lineTo(halfW, -halfL);
    shape.lineTo(halfW, halfL);
    shape.lineTo(-halfW, halfL);
    shape.lineTo(-halfW, -halfL);

    const hole = new THREE.Path();
    const segs = 32;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * ATRIUM_RADIUS;
      const z = Math.sin(a) * ATRIUM_RADIUS + ATRIUM_Z;
      if (i === 0) hole.moveTo(x, z);
      else hole.lineTo(x, z);
    }
    shape.holes.push(hole);

    const geom = new THREE.ShapeGeometry(shape, 64);
    geom.rotateX(-Math.PI / 2);
    // The shape geometry's UV is in shape-space; remap so floor texture tiles correctly
    const uv = geom.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = uv.getX(i);
      const y = uv.getY(i);
      uv.setXY(i, x / FLOOR_WIDTH, y / FLOOR_LEN);
    }
    uv.needsUpdate = true;

    const tex = this._makeFloorTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });
    return this._track(new THREE.Mesh(geom, mat));
  }

  _makeFloorTexture() {
    // Procedural ceramic-tile texture — supports diamond, checker, grid
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');

    const colA = '#' + this.params.floorColorA.toString(16).padStart(6, '0');
    const colB = '#' + this.params.floorColorB.toString(16).padStart(6, '0');
    const colC = '#' + this.params.floorColorC.toString(16).padStart(6, '0');

    ctx.fillStyle = colA;
    ctx.fillRect(0, 0, size, size);

    if (this.params.floorPattern === 'checker') {
      const tile = 32;
      for (let y = 0; y < size; y += tile) {
        for (let x = 0; x < size; x += tile) {
          const isA = ((x / tile + y / tile) | 0) % 2 === 0;
          ctx.fillStyle = isA ? colA : colB;
          ctx.fillRect(x, y, tile, tile);
        }
      }
    } else if (this.params.floorPattern === 'diamond') {
      // Like image 2 — alternating colored squares laid in a diamond pattern
      const tile = 32;
      for (let y = 0; y < size; y += tile) {
        for (let x = 0; x < size; x += tile) {
          const ix = (x / tile) | 0;
          const iy = (y / tile) | 0;
          const sum = ix + iy;
          const cls = sum % 4;
          let col;
          if (cls === 0) col = colA;
          else if (cls === 1) col = colB;
          else if (cls === 2) col = colC;
          else col = colA;
          ctx.fillStyle = col;
          ctx.fillRect(x, y, tile, tile);
        }
      }
    } else if (this.params.floorPattern === 'grid') {
      ctx.fillStyle = colA;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = colB;
      ctx.lineWidth = 2;
      const tile = 32;
      for (let i = 0; i <= size; i += tile) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
      }
    }

    // Add a bit of grout shadow at tile edges
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    const tile = 32;
    for (let i = 0; i <= size; i += tile) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(FLOOR_WIDTH / 8, FLOOR_LEN / 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this._textures.push(tex);
    return tex;
  }

  // ────── Atrium ──────
  _buildAtriumOpening() {
    // Decorative ring around the atrium hole on the upper floor — a thick chrome lip
    const ringGeom = new THREE.TorusGeometry(ATRIUM_RADIUS + 0.4, 0.4, 8, 64);
    ringGeom.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x404448, roughness: 0.2, metalness: 1.0,
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.position.set(0, FLOOR_HEIGHT + 0.05, ATRIUM_Z);
    this.group.add(this._track(ring));
  }

  // ────── Ceilings ──────
  _buildCeilings() {
    // Lower ceiling: covers ground level corridor everywhere except over the atrium
    const lowerCeilShape = new THREE.Shape();
    const halfW = FLOOR_WIDTH / 2;
    const halfL = FLOOR_LEN / 2;
    lowerCeilShape.moveTo(-halfW, -halfL);
    lowerCeilShape.lineTo(halfW, -halfL);
    lowerCeilShape.lineTo(halfW, halfL);
    lowerCeilShape.lineTo(-halfW, halfL);
    lowerCeilShape.lineTo(-halfW, -halfL);

    const lowerHole = new THREE.Path();
    const segs = 32;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * ATRIUM_RADIUS;
      const z = Math.sin(a) * ATRIUM_RADIUS + ATRIUM_Z;
      if (i === 0) lowerHole.moveTo(x, z);
      else lowerHole.lineTo(x, z);
    }
    lowerCeilShape.holes.push(lowerHole);

    const lowerGeom = new THREE.ShapeGeometry(lowerCeilShape, 64);
    lowerGeom.rotateX(Math.PI / 2);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: this.params.ceilingColor,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const lowerCeil = new THREE.Mesh(lowerGeom, ceilMat);
    lowerCeil.position.y = FLOOR_HEIGHT - 0.02; // just below upper floor
    this.group.add(this._track(lowerCeil));

    // Upper ceiling — closes the top, dropped style with center skylight area
    const upperCeil = new THREE.Mesh(
      new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_LEN),
      ceilMat.clone()
    );
    upperCeil.geometry.rotateX(Math.PI / 2);
    upperCeil.position.y = FLOOR_HEIGHT * 2;
    this.group.add(this._track(upperCeil));

    // Recessed ceiling lights — array of small bright squares
    const lightsArr = this._buildRecessedLights();
    this.group.add(lightsArr);
  }

  _buildRecessedLights() {
    const grp = new THREE.Group();
    const lightMat = new THREE.MeshBasicMaterial({
      color: 0xffeebb,
      toneMapped: false,
    });
    this._mats.push(lightMat);
    const lightGeom = new THREE.PlaneGeometry(0.8, 0.8);
    lightGeom.rotateX(Math.PI / 2);
    this._geoms.push(lightGeom);

    // Lower ceiling lights (skipping atrium area)
    const spacing = 8;
    for (let z = -FLOOR_LEN / 2 + spacing; z < FLOOR_LEN / 2; z += spacing) {
      // Skip area inside atrium radius
      const inAtrium = Math.abs(z - ATRIUM_Z) < ATRIUM_RADIUS;
      for (let xi = -2; xi <= 2; xi++) {
        const x = xi * 8;
        if (inAtrium && Math.abs(x) < ATRIUM_RADIUS &&
            (x * x + (z - ATRIUM_Z) * (z - ATRIUM_Z) < ATRIUM_RADIUS * ATRIUM_RADIUS)) continue;
        const m = new THREE.Mesh(lightGeom, lightMat);
        m.position.set(x, FLOOR_HEIGHT - 0.05, z);
        grp.add(m);
      }
    }
    // Upper ceiling lights
    for (let z = -FLOOR_LEN / 2 + spacing; z < FLOOR_LEN / 2; z += spacing) {
      for (let xi = -2; xi <= 2; xi++) {
        const x = xi * 8;
        const m = new THREE.Mesh(lightGeom, lightMat);
        m.position.set(x, FLOOR_HEIGHT * 2 - 0.05, z);
        grp.add(m);
      }
    }
    return grp;
  }

  _buildSkylight() {
    // Glowing skylight rectangle in the center of the upper ceiling
    const geom = new THREE.PlaneGeometry(10, 14);
    geom.rotateX(Math.PI / 2);
    const tint = this.params.ambientTint;
    const mat = new THREE.MeshBasicMaterial({
      color: tint,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
    });
    const sky = new THREE.Mesh(geom, mat);
    sky.position.set(0, FLOOR_HEIGHT * 2 - 0.04, ATRIUM_Z);
    this.group.add(this._track(sky));
  }

  // ────── Walls ──────
  _buildWalls() {
    const wallH = FLOOR_HEIGHT * 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xeed8c0,
      roughness: 0.85,
    });
    this._mats.push(wallMat);

    // End walls
    [
      { z: -FLOOR_LEN / 2, normal: 1 },
      { z: FLOOR_LEN / 2, normal: -1 },
    ].forEach(end => {
      const geom = new THREE.PlaneGeometry(FLOOR_WIDTH, wallH);
      const m = new THREE.Mesh(geom, wallMat);
      m.position.set(0, wallH / 2, end.z);
      m.lookAt(0, wallH / 2, end.z + end.normal);
      this.group.add(this._track(m));
    });
  }

  // ────── Storefronts ──────
  _buildStorefronts() {
    // Storefronts line both side walls of the corridor
    const halfW = FLOOR_WIDTH / 2;
    const slotZSpacing = STORE_WIDTH + 1;
    const totalSlots = Math.floor(FLOOR_LEN / slotZSpacing);
    const startZ = -FLOOR_LEN / 2 + slotZSpacing / 2;

    for (let level = 0; level < 2; level++) {
      const yBase = level * FLOOR_HEIGHT;
      for (let i = 0; i < totalSlots; i++) {
        const z = startZ + i * slotZSpacing;
        // Skip slots near atrium on upper level
        if (level === 1 && Math.abs(z - ATRIUM_Z) < ATRIUM_RADIUS + 2) continue;
        for (const side of [-1, 1]) {
          if (Math.random() > this.params.storeDensity) continue;
          this._buildStorefront(side * halfW, yBase, z, side);
        }
      }
    }

    // Build outer wall sections between/behind storefronts
    this._buildOuterWalls();
  }

  _buildStorefront(x, yBase, z, side) {
    // side: -1 or +1, indicating which wall
    // The storefront opens *into* the corridor (so the lit interior is behind a recess)
    // Generate a random store color
    const hue = Math.random();
    const sat = 0.5 + Math.random() * 0.4;
    const val = 0.5 + Math.random() * 0.4;
    const interiorColor = new THREE.Color().setHSL(hue, sat, val);

    const sf = new THREE.Group();
    sf.position.set(x, yBase, z);

    // Recess the store (push the back wall away from corridor)
    const backX = -side * STORE_DEPTH;

    // Back wall (lit interior color)
    const backWallMat = new THREE.MeshStandardMaterial({
      color: interiorColor,
      emissive: interiorColor,
      emissiveIntensity: 0.6,
      roughness: 0.7,
    });
    this._mats.push(backWallMat);
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(STORE_WIDTH, STOREFRONT_HEIGHT),
      backWallMat
    );
    backWall.position.set(backX, STOREFRONT_HEIGHT / 2, 0);
    backWall.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    sf.add(this._track(backWall));

    // Side walls of store interior
    const sideWallMat = new THREE.MeshStandardMaterial({
      color: interiorColor.clone().multiplyScalar(0.5),
      emissive: interiorColor,
      emissiveIntensity: 0.2,
      roughness: 0.85,
    });
    this._mats.push(sideWallMat);
    [-STORE_WIDTH / 2, STORE_WIDTH / 2].forEach(zOff => {
      const w = new THREE.Mesh(
        new THREE.PlaneGeometry(STORE_DEPTH, STOREFRONT_HEIGHT),
        sideWallMat
      );
      w.position.set(-side * STORE_DEPTH / 2, STOREFRONT_HEIGHT / 2, zOff);
      w.rotation.y = zOff > 0 ? Math.PI : 0;
      sf.add(this._track(w));
    });

    // Ceiling of store
    const storeCeil = new THREE.Mesh(
      new THREE.PlaneGeometry(STORE_DEPTH, STORE_WIDTH),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffeecc, emissiveIntensity: 0.4 })
    );
    storeCeil.geometry.rotateX(Math.PI / 2);
    storeCeil.position.set(-side * STORE_DEPTH / 2, STOREFRONT_HEIGHT - 0.01, 0);
    sf.add(this._track(storeCeil));

    // Storefront frame (the "doorway" looking out into the corridor)
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x303030, roughness: 0.4, metalness: 0.6,
    });
    this._mats.push(frameMat);
    // Top bar
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.5, STORE_WIDTH),
      frameMat
    );
    top.position.set(0, STOREFRONT_HEIGHT - 0.75, 0);
    sf.add(this._track(top));
    // Side pillars
    [-STORE_WIDTH / 2 + 0.2, STORE_WIDTH / 2 - 0.2].forEach(zOff => {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, STOREFRONT_HEIGHT, 0.4),
        frameMat
      );
      p.position.set(0, STOREFRONT_HEIGHT / 2, zOff);
      sf.add(this._track(p));
    });

    // Glass front (subtle tint, slightly transmissive)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xa0c0d0,
      transparent: true,
      opacity: 0.15,
      roughness: 0.05,
      metalness: 0.4,
    });
    this._mats.push(glassMat);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(STORE_WIDTH - 0.5, STOREFRONT_HEIGHT - 1.5),
      glassMat
    );
    glass.position.set(0, (STOREFRONT_HEIGHT - 1.5) / 2, 0);
    glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    sf.add(this._track(glass));

    // Sign above storefront
    if (Math.random() < 0.7) {
      const signMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random(), 1, 0.7),
        toneMapped: false,
      });
      this._mats.push(signMat);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(STORE_WIDTH * 0.7, 0.8),
        signMat
      );
      sign.position.set(0.05 * -side, STOREFRONT_HEIGHT - 0.4, 0);
      sign.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      sf.add(this._track(sign));
    }

    // Mannequin silhouettes inside
    if (Math.random() < this.params.mannequinDensity) {
      const count = 1 + Math.floor(Math.random() * 3);
      for (let m = 0; m < count; m++) {
        const mannequin = this._buildMannequin();
        const mzOff = (Math.random() - 0.5) * (STORE_WIDTH - 3);
        const mxOff = -side * (STORE_DEPTH * 0.4 + Math.random() * STORE_DEPTH * 0.3);
        mannequin.position.set(mxOff, 0, mzOff);
        mannequin.rotation.y = Math.random() * Math.PI * 2;
        sf.add(mannequin);
      }
    }

    // A few interior boxes (display tables)
    const tableCount = 1 + Math.floor(Math.random() * 2);
    for (let t = 0; t < tableCount; t++) {
      const tbl = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.2, 1.6),
        new THREE.MeshStandardMaterial({
          color: interiorColor.clone().multiplyScalar(0.6),
          emissive: interiorColor.clone().multiplyScalar(0.15),
          roughness: 0.5,
        })
      );
      this._mats.push(tbl.material);
      tbl.position.set(
        -side * (STORE_DEPTH * 0.4 + Math.random() * 4),
        0.6,
        (Math.random() - 0.5) * (STORE_WIDTH - 3)
      );
      sf.add(this._track(tbl));
    }

    this.group.add(sf);
  }

  _buildMannequin() {
    // Simple silhouette mannequin: black/dark-grey shape
    const m = new THREE.Group();
    const matSilhouette = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      roughness: 0.7,
    });
    this._mats.push(matSilhouette);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), matSilhouette);
    head.position.y = 5.4;
    m.add(this._track(head));
    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.2, 12), matSilhouette);
    torso.position.y = 4.1;
    m.add(this._track(torso));
    // Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.4, metalness: 0.6 })
    );
    this._mats.push(ped.material);
    ped.position.y = 0.1;
    m.add(this._track(ped));
    // Legs
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.8, 12), matSilhouette);
    legs.position.y = 1.6;
    m.add(this._track(legs));
    return m;
  }

  _buildOuterWalls() {
    // Solid wall behind the storefronts on each side
    const wallH = FLOOR_HEIGHT * 2;
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xc8b8a0, roughness: 0.85,
    });
    this._mats.push(wallMat);
    [-1, 1].forEach(side => {
      const geom = new THREE.PlaneGeometry(FLOOR_LEN, wallH);
      const m = new THREE.Mesh(geom, wallMat);
      m.position.set(side * (FLOOR_WIDTH / 2 + STORE_DEPTH), wallH / 2, 0);
      m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(this._track(m));
    });
  }

  // ────── Balcony railing ──────
  _buildBalconyRailing() {
    // Railing along the edge of the upper floor, including around atrium hole
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x808890, roughness: 0.3, metalness: 0.7,
    });
    this._mats.push(railMat);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xb0d0e0, transparent: true, opacity: 0.25,
      roughness: 0.05, metalness: 0.2,
    });
    this._mats.push(glassMat);

    const railH = 1.3;
    const railY = FLOOR_HEIGHT + railH / 2;

    // Rail around atrium hole
    const segs = 32;
    for (let i = 0; i < segs; i++) {
      const a1 = (i / segs) * Math.PI * 2;
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const x1 = Math.cos(a1) * ATRIUM_RADIUS;
      const z1 = Math.sin(a1) * ATRIUM_RADIUS + ATRIUM_Z;
      const x2 = Math.cos(a2) * ATRIUM_RADIUS;
      const z2 = Math.sin(a2) * ATRIUM_RADIUS + ATRIUM_Z;
      const len = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;

      // Glass panel
      const g = new THREE.Mesh(new THREE.PlaneGeometry(len, railH), glassMat);
      g.position.set(cx, railY, cz);
      g.rotation.y = Math.atan2(z1 - z2, x1 - x2) + Math.PI / 2;
      this.group.add(this._track(g));

      // Top rail
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.08, 0.08),
        railMat
      );
      top.position.set(cx, FLOOR_HEIGHT + railH, cz);
      top.rotation.y = Math.atan2(z1 - z2, x1 - x2);
      this.group.add(this._track(top));
    }
  }

  // ────── Escalator ──────
  _buildEscalator() {
    // Single escalator running from ground to upper floor near atrium
    const esc = new THREE.Group();
    const angle = Math.atan2(FLOOR_HEIGHT, 12); // 12 unit run for ~14 unit rise
    const length = 12 / Math.cos(angle);

    // Inclined slab (the steps belt)
    const slabGeom = new THREE.BoxGeometry(3, 0.6, length);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x202428, roughness: 0.6, metalness: 0.5,
    });
    this._mats.push(slabMat);
    const slab = new THREE.Mesh(slabGeom, slabMat);
    slab.position.set(0, FLOOR_HEIGHT / 2, 0);
    slab.rotation.x = -angle;
    esc.add(this._track(slab));

    // Side panels (chrome)
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x808890, roughness: 0.15, metalness: 0.95,
    });
    this._mats.push(panelMat);
    [-1, 1].forEach(s => {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 1.4, length),
        panelMat
      );
      panel.position.set(s * 1.5, FLOOR_HEIGHT / 2 + 0.5, 0);
      panel.rotation.x = -angle;
      esc.add(this._track(panel));
    });

    // Step pattern — a ridged chrome slab on top
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const stepGeom = new THREE.BoxGeometry(3, 0.1, 0.5);
      const step = new THREE.Mesh(stepGeom, panelMat);
      const z = (t - 0.5) * length;
      const y = FLOOR_HEIGHT / 2 + (t - 0.5) * length * Math.sin(angle) * -1 + 0.32;
      // Math: along the inclined slab top
      step.position.set(0, FLOOR_HEIGHT * t + 0.32, z * Math.cos(angle));
      step.rotation.x = -angle;
      esc.add(this._track(step));
    }

    // Position the escalator near the edge of atrium (offset to one side)
    esc.position.set(-(ATRIUM_RADIUS - 4), 0, ATRIUM_Z + ATRIUM_RADIUS + 6);
    esc.rotation.y = Math.PI; // face toward atrium
    this.group.add(esc);
  }

  // ────── Columns ──────
  _buildColumns() {
    // Tall chrome columns flanking the atrium and a few along the corridor (ref image 1)
    const colMat = new THREE.MeshStandardMaterial({
      color: 0x202428, roughness: 0.08, metalness: 1.0,
    });
    this._mats.push(colMat);
    const colGeom = new THREE.CylinderGeometry(0.8, 0.8, FLOOR_HEIGHT * 2, 24);
    this._geoms.push(colGeom);

    const positions = [
      [-ATRIUM_RADIUS - 2, 0, ATRIUM_Z - ATRIUM_RADIUS - 2],
      [ATRIUM_RADIUS + 2, 0, ATRIUM_Z - ATRIUM_RADIUS - 2],
      [-ATRIUM_RADIUS - 2, 0, ATRIUM_Z + ATRIUM_RADIUS + 2],
      [ATRIUM_RADIUS + 2, 0, ATRIUM_Z + ATRIUM_RADIUS + 2],
      [-FLOOR_WIDTH / 2 + 1, 0, -FLOOR_LEN / 2 + 30],
      [FLOOR_WIDTH / 2 - 1, 0, -FLOOR_LEN / 2 + 30],
      [-FLOOR_WIDTH / 2 + 1, 0, FLOOR_LEN / 2 - 30],
      [FLOOR_WIDTH / 2 - 1, 0, FLOOR_LEN / 2 - 30],
    ];

    positions.forEach(p => {
      const col = new THREE.Mesh(colGeom, colMat);
      col.position.set(p[0], FLOOR_HEIGHT, p[2]);
      this.group.add(col);
    });
  }

  // ────── Neon strips ──────
  _buildNeonStrips() {
    // Glowing horizontal lines at upper-storefront level (ref image 3)
    const neonMat = new THREE.MeshBasicMaterial({
      color: this.params.neonColor,
      toneMapped: false,
    });
    this._mats.push(neonMat);

    [-1, 1].forEach(side => {
      // Lower level, along storefront top
      for (let zOff = -FLOOR_LEN / 2 + 5; zOff < FLOOR_LEN / 2 - 5; zOff += 30) {
        const len = 18;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.25, len),
          neonMat
        );
        strip.position.set(side * (FLOOR_WIDTH / 2 - 0.05), FLOOR_HEIGHT - 0.5, zOff);
        this.group.add(strip);
      }
      // Upper level neon (subtler)
      for (let zOff = -FLOOR_LEN / 2 + 15; zOff < FLOOR_LEN / 2 - 15; zOff += 36) {
        if (Math.abs(zOff - ATRIUM_Z) < ATRIUM_RADIUS + 3) continue;
        const len = 20;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.18, len),
          neonMat
        );
        strip.position.set(side * (FLOOR_WIDTH / 2 - 0.05), FLOOR_HEIGHT * 2 - 1.5, zOff);
        this.group.add(strip);
      }
    });
  }

  // ────── Palms ──────
  _buildPalms() {
    // Procedural palms in the atrium (ref image 1)
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3520, roughness: 0.85,
    });
    this._mats.push(trunkMat);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x306020, roughness: 0.7, side: THREE.DoubleSide,
    });
    this._mats.push(leafMat);

    for (let i = 0; i < this.params.palmCount; i++) {
      const palm = this._buildPalm(trunkMat, leafMat);
      const a = (i / this.params.palmCount) * Math.PI * 2;
      const r = ATRIUM_RADIUS - 4 + Math.random() * 2;
      palm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + ATRIUM_Z);
      palm.rotation.y = Math.random() * Math.PI * 2;
      this.group.add(palm);
    }
    // Plus a few in planters along the corridor
    for (let i = 0; i < 4; i++) {
      const palm = this._buildPalm(trunkMat, leafMat);
      const z = -FLOOR_LEN / 2 + 50 + i * 50;
      if (Math.abs(z - ATRIUM_Z) < ATRIUM_RADIUS + 3) continue;
      const x = ((i % 2) === 0 ? -1 : 1) * (FLOOR_WIDTH / 2 - 6);
      // Skip over atrium open area
      palm.position.set(x, 0, z);
      // Add a planter
      const planter = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.7, 0.8, 16),
        new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.7 })
      );
      this._mats.push(planter.material);
      planter.position.set(x, 0.4, z);
      this.group.add(this._track(planter));
      this.group.add(palm);
    }
  }

  _buildPalm(trunkMat, leafMat) {
    const palm = new THREE.Group();
    const trunkH = 7 + Math.random() * 3;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.4, trunkH, 8),
      trunkMat
    );
    trunk.position.y = trunkH / 2;
    palm.add(this._track(trunk));

    // Fronds — flat stretched cones
    const frondCount = 9;
    const frondGeom = new THREE.PlaneGeometry(4.5, 0.7, 1, 1);
    this._geoms.push(frondGeom);
    for (let i = 0; i < frondCount; i++) {
      const f = new THREE.Mesh(frondGeom, leafMat);
      const a = (i / frondCount) * Math.PI * 2;
      f.position.y = trunkH;
      f.rotation.y = a;
      f.rotation.z = -0.6 - Math.random() * 0.3;
      f.position.x = Math.cos(a) * 1.8;
      f.position.z = Math.sin(a) * 1.8;
      palm.add(f);
    }
    return palm;
  }

  // ────── Benches ──────
  _buildBenches() {
    const benchMat = new THREE.MeshStandardMaterial({
      color: 0x303032, roughness: 0.7, metalness: 0.3,
    });
    this._mats.push(benchMat);

    // Atrium has 4 benches around the center
    const benchPositions = [
      [0, 0, ATRIUM_Z - ATRIUM_RADIUS * 0.6],
      [0, 0, ATRIUM_Z + ATRIUM_RADIUS * 0.6],
      [-ATRIUM_RADIUS * 0.6, 0, ATRIUM_Z],
      [ATRIUM_RADIUS * 0.6, 0, ATRIUM_Z],
    ];
    benchPositions.forEach(p => {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.8), benchMat);
      seat.position.set(p[0], 0.55, p[2]);
      // orient toward center
      seat.lookAt(0, 0.55, ATRIUM_Z);
      this.group.add(this._track(seat));
      // Legs
      [-1, 1].forEach(s => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.6), benchMat);
        leg.position.copy(seat.position);
        leg.position.y = 0.275;
        const fwd = new THREE.Vector3();
        seat.getWorldDirection(fwd);
        const right = new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(s * 1.0);
        leg.position.add(right);
        this.group.add(this._track(leg));
      });
    });
  }

  // ────── Lighting ──────
  _buildLighting() {
    // Ambient pinkish wash + a center point light over the atrium
    const ambient = new THREE.AmbientLight(this.params.ambientTint, 0.6);
    this.group.add(ambient);
    this.lights.push(ambient);

    // Hemisphere — cool/warm split
    const hemi = new THREE.HemisphereLight(0xffe8d4, this.params.ambientTint, 0.45);
    hemi.position.set(0, FLOOR_HEIGHT * 2, 0);
    this.group.add(hemi);
    this.lights.push(hemi);

    // Atrium center point light
    const center = new THREE.PointLight(0xfff0d8, 1.2, 80, 2);
    center.position.set(0, FLOOR_HEIGHT * 2 - 1, ATRIUM_Z);
    center.castShadow = false;
    this.group.add(center);
    this.lights.push(center);

    // A few corridor point lights for that fluorescent-cluster glow
    for (let z = -FLOOR_LEN / 2 + 20; z < FLOOR_LEN / 2; z += 40) {
      if (Math.abs(z - ATRIUM_Z) < ATRIUM_RADIUS + 4) continue;
      const p = new THREE.PointLight(0xfff0d8, 0.6, 30, 2);
      p.position.set(0, FLOOR_HEIGHT - 1, z);
      this.group.add(p);
      this.lights.push(p);
    }

    // Neon backlights — strong colored point lights to bleed onto walls
    [-1, 1].forEach(side => {
      for (let z = -FLOOR_LEN / 2 + 30; z < FLOOR_LEN / 2; z += 60) {
        const p = new THREE.PointLight(this.params.neonColor, 0.4, 22, 2);
        p.position.set(side * (FLOOR_WIDTH / 2 - 1), FLOOR_HEIGHT * 1.5, z);
        this.group.add(p);
        this.lights.push(p);
        if (this.params.flickerEnabled && Math.random() < 0.2) {
          this.flickerLights.push({ light: p, base: 0.4, phase: Math.random() * 100 });
        }
      }
    });
  }

  _updateLighting() {
    // Hot-swap colors without rebuild
    this.lights.forEach(l => {
      if (l.isAmbientLight) l.color.set(this.params.ambientTint);
      else if (l.isHemisphereLight) l.groundColor.set(this.params.ambientTint);
    });
  }

  // ────── Update (called each frame for flickers) ──────
  update(dt) {
    if (!this.params.flickerEnabled) return;
    const t = performance.now() * 0.001;
    this.flickerLights.forEach(f => {
      const flick = 0.7 + Math.sin(t * 12 + f.phase) * 0.15 +
                    (Math.random() < 0.005 ? -0.3 : 0);
      f.light.intensity = f.base * flick;
    });
  }

  // Entry point used by world.js for raycasting
  getRaycastMesh() {
    return this.groundPlane;
  }

  // For paint clicks etc. — sample height under (u,v) — for mall, height is 0 (ground floor)
  sampleHeight(u, v) {
    return 0;
  }

  serialize() {
    return { ...this.params };
  }

  deserialize(data) {
    if (!data) return;
    Object.assign(this.params, data);
    this.rebuild();
  }
}

// Mall presets — match the three reference images
export const MALL_PRESETS = {
  // Image 2: empty pink-mauve dead mall
  deadMall: {
    floorPattern: 'diamond',
    floorColorA: 0xf5e8d8,
    floorColorB: 0xe8a8b8,
    floorColorC: 0x607080,
    ceilingColor: 0xffd8c0,
    neonColor: 0xff60a0,
    ambientTint: 0xff80a0,
    storeDensity: 0.7,
    mannequinDensity: 0.5,
    palmCount: 4,
    columnsEnabled: true,
    escalatorEnabled: true,
    neonStrips: false,
    flickerEnabled: true,
  },
  // Image 1: tropical atrium hotel
  tropicalAtrium: {
    floorPattern: 'grid',
    floorColorA: 0xc8b894,
    floorColorB: 0x7a6a4a,
    floorColorC: 0x504030,
    ceilingColor: 0xfff0d4,
    neonColor: 0x40b0ff,
    ambientTint: 0xfff0d4,
    storeDensity: 0.4,
    mannequinDensity: 0.2,
    palmCount: 12,
    columnsEnabled: true,
    escalatorEnabled: false,
    neonStrips: false,
    flickerEnabled: false,
  },
  // Image 3: neon arcade entrance
  neonArcade: {
    floorPattern: 'diamond',
    floorColorA: 0xe8d8c8,
    floorColorB: 0xc080a0,
    floorColorC: 0x6080a0,
    ceilingColor: 0xffc8b0,
    neonColor: 0x00d4ff,
    ambientTint: 0xff60a0,
    storeDensity: 0.8,
    mannequinDensity: 0.6,
    palmCount: 3,
    columnsEnabled: true,
    escalatorEnabled: true,
    neonStrips: true,
    flickerEnabled: true,
  },
};
