import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class PaintSystem {
  constructor({ camera, scene, domEl, terrain }){
    this.camera = camera;
    this.scene = scene;
    this.domEl = domEl;
    this.terrain = terrain;

    this.enabled = true;
    this.mode = 'height';
    this.brushSize = 3.2;     // world units
    this.strength = 0.35;

    this._ray = new THREE.Raycaster();
    this._mouse = new THREE.Vector2();
    this._down = false;
    this._invert = false;

    this._bind();
  }

  _bind(){
    const el = this.domEl;
    el.addEventListener('pointerdown', (e)=>{
      this._down = true;
      this._invert = e.button === 2 || e.ctrlKey;
      el.setPointerCapture(e.pointerId);
      this._paintFromEvent(e);
    });
    el.addEventListener('pointermove', (e)=>{
      if (!this._down) return;
      this._paintFromEvent(e);
    });
    el.addEventListener('pointerup', ()=>{
      this._down = false;
    });

    // prevent context menu for right-click subtract
    el.addEventListener('contextmenu', (e)=> e.preventDefault());
  }

  _paintFromEvent(e){
    if (!this.enabled) return;

    const rect = this.domEl.getBoundingClientRect();
    this._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    this._ray.setFromCamera(this._mouse, this.camera);
    const hits = this._ray.intersectObject(this.terrain.mesh, false);
    if (!hits.length) return;

    const hit = hits[0];
    if (!hit.uv) return;

    const sign = this._invert ? -1 : +1;
    this.terrain.paintAtUV(hit.uv, this.mode, this.brushSize, this.strength, sign);
  }
}
