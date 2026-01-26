import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { mulberry32, clamp01 } from './utils.js';

export class ObjectSystem {
  constructor({ scene, terrain, materials }){
    this.scene = scene;
    this.terrain = terrain;
    this.materials = materials;

    this.group = new THREE.Group();
    this.group.name = 'Objects';
    this.scene.add(this.group);

    this._rng = mulberry32(42);
  }

  addPrimitive(type){
    let geo;
    if (type === 'sphere') geo = new THREE.SphereGeometry(3, 28, 18);
    if (type === 'cube') geo = new THREE.BoxGeometry(5, 5, 5);
    if (type === 'cone') geo = new THREE.ConeGeometry(3.2, 7.0, 24);
    if (type === 'cylinder') geo = new THREE.CylinderGeometry(2.8, 2.8, 7.0, 24);

    const mat = this.materials.createObjectMaterial('default');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    mesh.position.set(
      (this._rng()-0.5)*40,
      10,
      (this._rng()-0.5)*40
    );

    this.group.add(mesh);
    return mesh;
  }

  // NOTE: true boolean CSG is heavier; this is a placeholder hook.
  // You can swap later for three-bvh-csg.
  booleanCombine(a, b, mode='union'){
    console.warn('Boolean ops: placeholder. Use three-bvh-csg later for real CSG.');
  }

  scatterTrees({ count=120 } = {}){
    const rng = mulberry32(133);
    const N = this.terrain.size;
    const worldSize = this.terrain.worldSize;

    const treeMatTrunk = this.materials.createObjectMaterial('tree');
    const treeMatLeaf = new THREE.MeshStandardMaterial({ color: 0x2f7a3b, roughness: 0.9 });

    for (let i=0;i<count;i++){
      const u = rng();
      const v = rng();

      // height / slope filters
      const ix = Math.floor(u*(N-1));
      const iy = Math.floor(v*(N-1));
      const h = this.terrain.height[iy*N + ix];

      // avoid waterline, avoid peaks
      if (h < 0.18 || h > 0.78) continue;

      const slope = this._estimateSlope(ix, iy);
      if (slope > 0.55) continue;

      const x = (u-0.5)*worldSize;
      const z = (v-0.5)*worldSize;
      const y = h * this.terrain.heightRange;

      const tree = this._makeTree(treeMatTrunk, treeMatLeaf, rng);
      tree.position.set(x, y, z);
      tree.rotation.y = rng()*Math.PI*2;
      tree.scale.setScalar(0.7 + rng()*1.35);
      this.group.add(tree);
    }
  }

  scatterRocks({ count=160 } = {}){
    const rng = mulberry32(77);
    const N = this.terrain.size;
    const worldSize = this.terrain.worldSize;
    const mat = this.materials.createObjectMaterial('rock');

    for (let i=0;i<count;i++){
      const u = rng();
      const v = rng();
      const ix = Math.floor(u*(N-1));
      const iy = Math.floor(v*(N-1));
      const h = this.terrain.height[iy*N + ix];

      // more on slopes
      const slope = this._estimateSlope(ix, iy);
      if (slope < 0.22) continue;
      if (h < 0.12) continue;

      const x = (u-0.5)*worldSize;
      const z = (v-0.5)*worldSize;
      const y = h * this.terrain.heightRange;

      const geo = this._makeRockGeo(rng);
      const rock = new THREE.Mesh(geo, mat);
      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.position.set(x, y, z);
      rock.rotation.set(rng()*0.4, rng()*Math.PI*2, rng()*0.4);
      rock.scale.setScalar(0.4 + rng()*1.6);
      this.group.add(rock);
    }
  }

  _makeTree(trunkMat, leafMat, rng){
    const g = new THREE.Group();

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 5.2, 10), trunkMat);
    trunk.position.y = 2.6;
    trunk.castShadow = true;
    trunk.receiveShadow = true;

    const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6.2, 14), leafMat);
    leaf.position.y = 6.2;
    leaf.castShadow = true;
    leaf.receiveShadow = true;

    g.add(trunk, leaf);
    return g;
  }

  _makeRockGeo(rng){
    const geo = new THREE.IcosahedronGeometry(2.2, 1);
    const pos = geo.attributes.position;
    for (let i=0;i<pos.count;i++){
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 0.65 + rng()*0.6;
      pos.setXYZ(i, x*n, y*(0.75+rng()*0.7), z*n);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  _estimateSlope(ix, iy){
    const N = this.terrain.size;
    const idx = (x,y)=> this.terrain.height[(Math.max(0,Math.min(N-1,y)))*N + (Math.max(0,Math.min(N-1,x)))];

    const c = idx(ix,iy);
    const gx = (idx(ix+1,iy)-idx(ix-1,iy))*0.5;
    const gy = (idx(ix,iy+1)-idx(ix,iy-1))*0.5;
    return clamp01(Math.sqrt(gx*gx+gy*gy)*4.0);
  }
}
