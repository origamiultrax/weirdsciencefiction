import { createRenderer } from './renderer.js';
import { createSceneRig } from './sceneRig.js';
import { TerrainSystem } from './terrain.js';
import { SkySystem } from './sky.js';
import { MaterialSystem } from './materials.js';
import { ObjectSystem } from './objects.js';
import { PaintSystem } from './paint.js';
import { UI } from './ui.js';

export class App {
  constructor({ viewportEl, statusEl }) {
    this.viewportEl = viewportEl;
    this.statusEl = statusEl;

    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;

    this.sky = null;
    this.terrain = null;
    this.materials = null;
    this.objects = null;
    this.paint = null;

    this.ui = null;

    this._raf = 0;
    this._time = 0;
  }

  setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  async init() {
    this.setStatus('Booting…');

    const { renderer, pmrem, composer, overlay } = await createRenderer(this.viewportEl);
    const rig = createSceneRig();

    this.renderer = renderer;
    this.scene = rig.scene;
    this.camera = rig.camera;
    this.controls = rig.controls;
    this.scene.add(rig.lights.group);

    // Systems
    this.materials = new MaterialSystem();
    this.sky = new SkySystem({ scene: this.scene, renderer: this.renderer, pmrem });
    this.terrain = new TerrainSystem({ scene: this.scene, materials: this.materials });
    this.objects = new ObjectSystem({ scene: this.scene, terrain: this.terrain, materials: this.materials });
    this.paint = new PaintSystem({ camera: this.camera, scene: this.scene, domEl: this.renderer.domElement, terrain: this.terrain });

    // UI
    this.ui = new UI(this);
    this.ui.bind();

    // Initial values
    this.ui.syncAllToUI();
    this.setStatus('Ready');

    // Render loop
    const onResize = () => {
      const w = this.viewportEl.clientWidth;
      const h = this.viewportEl.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', onResize);
    onResize();

    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      this._time += 0.016;

      this.controls.update();

      // animate clouds a touch
      this.sky.update(this._time);

      // draw
      this.renderer.render(this.scene, this.camera);
      overlay.draw(this.renderer, this.camera);
    };
    tick();
  }

  // "Final render": higher resolution + higher shadow quality
  async finalRender() {
    this.setStatus('Final render…');

    const r = this.renderer;
    const oldPR = r.getPixelRatio();
    const oldSize = r.getSize(new THREE.Vector2());

    // big but safe: 2x pixel ratio
    r.setPixelRatio(Math.min(2.0, window.devicePixelRatio * 2.0));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    // render a few frames to settle
    for (let i = 0; i < 3; i++) r.render(this.scene, this.camera);

    // restore
    r.setPixelRatio(oldPR);
    r.setSize(oldSize.x, oldSize.y, false);

    this.setStatus('Final render done');
  }

  snapshotPNG() {
    const a = document.createElement('a');
    a.download = 'weird-science-fiction.png';
    a.href = this.renderer.domElement.toDataURL('image/png');
    a.click();
  }
}
