/* =========================================================
   app.js — Main application, boots everything
   ========================================================= */
(function (global) {
  const W = global.WSF;

  class App {
    constructor() {
      this.canvas = document.getElementById('mainCanvas');
      this.terrain = new W.Terrain(128);
      this.sky = new W.Sky();
      this.materials = new W.MaterialSystem();
      this.objects = new W.ObjectSystem();
      this.camera = new W.Camera();
      this.paint = new W.PaintSystem(this.terrain);
      this.renderer = new W.Renderer(
        this.canvas, this.terrain, this.sky, this.materials, this.objects, this.camera
      );
      this.ui = new W.UI(this);
      this.currentTool = 'terrain';
      this.needsRender = true;
      this.lastTime = 0;
      this.fpsSmooth = 60;
    }

    boot() {
      this.ui.init();
      this.terrain.generate();
      this._onResize();
      window.addEventListener('resize', () => this._onResize());

      // Initial populate
      this.ui.refreshSceneList();
      this.ui.updateStats();
      this.ui.log('boot · systems nominal');

      // Animation loop
      requestAnimationFrame(t => this._tick(t));
    }

    _onResize() {
      this.renderer.resize();
      this.needsRender = true;
    }

    requestRender() { this.needsRender = true; }

    _tick(t) {
      const dt = Math.min(0.1, (t - this.lastTime) / 1000 || 0.016);
      this.lastTime = t;

      // Animate clouds continuously even without user input
      if (this.sky.params.cloudSpd > 0.01 && this.sky.params.clouds > 0.01) {
        this.needsRender = true;
      }

      if (this.needsRender) {
        this.renderer.render(dt);
        this.needsRender = false;
      }

      // FPS
      const fps = 1 / Math.max(0.001, dt);
      this.fpsSmooth = this.fpsSmooth * 0.9 + fps * 0.1;
      this.ui.updateHud(this.fpsSmooth);

      requestAnimationFrame(nt => this._tick(nt));
    }

    finalRender() {
      this.ui.setStatus('RENDERING', '#ff6a1a');
      this.ui.log('final render · in progress');

      const overlay = document.getElementById('renderOverlay');
      const renderCanvas = document.getElementById('renderCanvas');
      overlay.classList.remove('hidden');

      // Use a higher-res temporary render
      const prevMeshRes = this.renderer.meshRes;
      this.renderer.meshRes = 128;
      const prevCanvas = this.renderer.canvas;
      const prevCtx = this.renderer.ctx;
      const prevDpr = this.renderer.dpr;

      const W_ = 720, H_ = 480;
      renderCanvas.width = W_;
      renderCanvas.height = H_;
      renderCanvas.style.width = W_ + 'px';
      renderCanvas.style.height = H_ + 'px';

      this.renderer.canvas = renderCanvas;
      this.renderer.ctx = renderCanvas.getContext('2d');
      this.renderer.dpr = 1;

      // Simulate progress with a short delay so user sees render window
      const progEl = document.getElementById('renderProgress');
      let p = 0;
      const interval = setInterval(() => {
        p += 12;
        progEl.textContent = `${Math.min(99, p)}%`;
      }, 40);

      setTimeout(() => {
        this.renderer.render(0.016);
        clearInterval(interval);
        progEl.textContent = '100%';
        // Restore
        this.renderer.canvas = prevCanvas;
        this.renderer.ctx = prevCtx;
        this.renderer.dpr = prevDpr;
        this.renderer.meshRes = prevMeshRes;
        this.needsRender = true;
        this.ui.setStatus('READY', '#7dff42');
        this.ui.log('final render · complete');
      }, 300);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.boot();
    window.__WSF = app; // debug handle
  });
})(window);
