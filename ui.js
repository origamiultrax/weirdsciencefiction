/* =========================================================
   ui.js — UI wiring: sliders, tool switch, readouts
   ========================================================= */
(function (global) {
  const W = global.WSF;

  class UI {
    constructor(app) {
      this.app = app;
      this.currentPanel = 'terrain';
    }

    init() {
      this._bindToolRail();
      this._bindTerrain();
      this._bindSky();
      this._bindObjects();
      this._bindMaterials();
      this._bindPaint();
      this._bindCamera();
      this._bindViewport();
      this._bindRenderOverlay();
    }

    _bindToolRail() {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tool = btn.dataset.tool;
          this.switchPanel(tool);
          this.app.currentTool = tool;
        });
      });

      document.querySelectorAll('.tool-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.dataset.view;
          const cam = this.app.camera;
          switch (v) {
            case 'persp': cam.yaw = -0.5; cam.pitch = 0.35; break;
            case 'top':   cam.yaw = 0;    cam.pitch = 1.45; break;
            case 'front': cam.yaw = 0;    cam.pitch = 0.05; break;
            case 'side':  cam.yaw = -1.57; cam.pitch = 0.05; break;
          }
          this.app.requestRender();
        });
      });
    }

    switchPanel(name) {
      this.currentPanel = name;
      document.querySelectorAll('.prop-group').forEach(g => {
        g.classList.toggle('hidden', g.dataset.panel !== name);
      });
      this.log(`panel · ${name.toUpperCase()}`);
    }

    // Helper to bind a slider to a value & callback
    _slider(id, valueId, fn, scale = 100, suffix = '') {
      const el = document.getElementById(id);
      const valEl = document.getElementById(valueId);
      if (!el) return;
      const update = () => {
        const raw = parseFloat(el.value);
        const v = raw / scale;
        if (valEl) {
          if (suffix === '°') valEl.textContent = `${Math.round(raw)}°`;
          else if (suffix === 'int') valEl.textContent = Math.round(raw);
          else if (suffix === 'time') {
            const h = Math.floor(raw / 10) % 24;
            const m = Math.round((raw % 10) * 6);
            valEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
          }
          else valEl.textContent = v.toFixed(2);
        }
        fn(v, raw);
      };
      el.addEventListener('input', update);
      update();
    }

    _bindTerrain() {
      const t = this.app.terrain;
      const req = () => { t.generate(); this.app.requestRender(); this.updateStats(); };
      this._slider('terrFreq', 'terrFreqV', v => { t.setParam('freq', v); req(); });
      this._slider('terrAmp',  'terrAmpV',  v => { t.setParam('amp',  v); req(); });
      this._slider('terrOct',  'terrOctV',  (v, raw) => { t.setParam('oct', raw); req(); }, 1, 'int');
      this._slider('terrSeed', 'terrSeedV', (v, raw) => { t.setParam('seed', raw); req(); }, 1, 'int');
      this._slider('terrErode',   'terrErodeV',   v => { t.setParam('erode', v); req(); });
      this._slider('terrPlateau', 'terrPlateauV', v => { t.setParam('plateau', v); req(); });
      this._slider('terrSmooth',  'terrSmoothV',  v => { t.setParam('smooth', v); req(); });

      document.getElementById('terrNewBtn').addEventListener('click', () => {
        t.paint.fill(0); t.snow.fill(0); t.veg.fill(0); t.fog.fill(0); t.sun.fill(0);
        t.generate();
        this.app.requestRender();
        this.log('terrain · reset');
      });
      document.getElementById('terrRandBtn').addEventListener('click', () => {
        const seed = Math.floor(Math.random() * 9999);
        document.getElementById('terrSeed').value = seed;
        document.getElementById('terrSeedV').textContent = seed;
        t.setParam('seed', seed);
        t.generate();
        this.app.requestRender();
        this.log(`seed · ${seed}`);
      });
    }

    _bindSky() {
      const s = this.app.sky;
      const req = () => this.app.requestRender();
      this._slider('skyTime', 'skyTimeV', (v, raw) => { s.setParam('time', raw); req(); }, 1, 'time');
      this._slider('skyAzim', 'skyAzimV', (v, raw) => { s.setParam('azim', raw); req(); }, 1, '°');
      this._slider('skyFog', 'skyFogV', v => { s.setParam('fog', v); req(); });
      this._slider('skyClouds', 'skyCloudsV', v => { s.setParam('clouds', v); req(); });
      this._slider('skyCloudSpd', 'skyCloudSpdV', v => { s.setParam('cloudSpd', v); req(); });

      document.getElementById('skyZenith').addEventListener('input', e => {
        s.setParam('zenith', e.target.value); req();
      });
      document.getElementById('skyHorizon').addEventListener('input', e => {
        s.setParam('horizon', e.target.value); req();
      });
    }

    _bindObjects() {
      const o = this.app.objects;
      document.querySelectorAll('.prim-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.prim;
          const obj = o.add(type);
          this.refreshSceneList();
          this.app.requestRender();
          this.log(`+ ${type} #${obj.id}`);
        });
      });

      this._slider('scatterDens', 'scatterDensV', (v, raw) => {}, 1, 'int');
      this._slider('scatterSlope', 'scatterSlopeV', () => {});
      this._slider('scatterHmin', 'scatterHminV', () => {});
      this._slider('scatterHmax', 'scatterHmaxV', () => {});

      document.getElementById('scatterBtn').addEventListener('click', () => {
        const d = parseFloat(document.getElementById('scatterDens').value);
        const sl = parseFloat(document.getElementById('scatterSlope').value) / 100;
        const hmin = parseFloat(document.getElementById('scatterHmin').value) / 100;
        const hmax = parseFloat(document.getElementById('scatterHmax').value) / 100;
        const n = o.scatter(this.app.terrain, d, sl, hmin, hmax);
        this.app.requestRender();
        this.updateStats();
        this.log(`scattered · ${n} trees`);
      });

      document.getElementById('boolUnion').addEventListener('click', () => {
        this.log('boolean · UNION (select 2 primitives)');
      });
      document.getElementById('boolSub').addEventListener('click', () => {
        this.log('boolean · SUBTRACT (select 2 primitives)');
      });
    }

    _bindMaterials() {
      const m = this.app.materials;
      document.querySelectorAll('.mat-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.mat-swatch').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          m.setPreset(btn.dataset.mat);
          this.app.requestRender();
          this.log(`material · ${btn.dataset.mat}`);
        });
      });
      // Set initial active
      const initBtn = document.querySelector(`.mat-swatch[data-mat="${m.current}"]`);
      if (initBtn) initBtn.classList.add('active');

      const req = () => this.app.requestRender();
      this._slider('matVar', 'matVarV', v => { m.setParam('variation', v); req(); });
      this._slider('matRough', 'matRoughV', v => { m.setParam('roughness', v); req(); });
      this._slider('matScale', 'matScaleV', v => { m.setParam('scale', v); req(); });
      this._slider('matSlope', 'matSlopeV', v => { m.setParam('slopeBlend', v); req(); });
      this._slider('matSnowLine', 'matSnowLineV', v => { m.setParam('snowLine', v); req(); });
      this._slider('matWaterLvl', 'matWaterLvlV', v => { m.setParam('waterLevel', v); req(); });
    }

    _bindPaint() {
      const p = this.app.paint;
      document.querySelectorAll('.paint-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.paint-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          p.setMode(btn.dataset.paint);
          this.log(`paint · ${btn.dataset.paint}`);
        });
      });
      this._slider('brushSize', 'brushSizeV', (v, raw) => p.setSize(raw), 1, 'int');
      this._slider('brushStr', 'brushStrV', v => p.setStrength(v));
      this._slider('brushFall', 'brushFallV', v => p.setFalloff(v));

      document.getElementById('paintClearBtn').addEventListener('click', () => {
        p.clear();
        this.app.requestRender();
        this.log('paint · cleared');
      });
    }

    _bindCamera() {
      const cam = this.app.camera;
      document.querySelectorAll('[data-cam]').forEach(btn => {
        btn.addEventListener('click', () => {
          cam.preset(btn.dataset.cam);
          document.getElementById('camFov').value = cam.fov;
          document.getElementById('camFovV').textContent = `${cam.fov}°`;
          this.app.requestRender();
          this.log(`camera · ${btn.dataset.cam}`);
        });
      });
      this._slider('camFov', 'camFovV', (v, raw) => { cam.fov = raw; this.app.requestRender(); }, 1, '°');
      this._slider('camDof', 'camDofV', v => { cam.dof = v; this.app.requestRender(); });
      this._slider('camFocus', 'camFocusV', v => { cam.focus = v; this.app.requestRender(); });
      this._slider('rndSamples', 'rndSamplesV', (v, raw) => {}, 1, 'int');
      this._slider('rndShadow', 'rndShadowV', v => {});
    }

    _bindViewport() {
      const app = this.app;
      const cam = app.camera;
      const exp = document.getElementById('exposure');
      const expV = document.getElementById('exposureVal');
      exp.addEventListener('input', () => {
        cam.exposure = parseFloat(exp.value) / 100;
        expV.textContent = cam.exposure.toFixed(2);
        app.requestRender();
      });

      document.getElementById('wireBtn').addEventListener('click', () => {
        app.renderer.wireframe = !app.renderer.wireframe;
        app.requestRender();
        this.log(`wire · ${app.renderer.wireframe ? 'on' : 'off'}`);
      });
      document.getElementById('resetCamBtn').addEventListener('click', () => {
        cam.reset();
        app.requestRender();
        this.log('camera · reset');
      });
      document.getElementById('renderBtn').addEventListener('click', () => {
        app.requestRender();
        this.log('preview · refreshed');
      });
      document.getElementById('finalRenderBtn').addEventListener('click', () => {
        app.finalRender();
      });

      // Canvas interaction - orbit and paint
      const canvas = document.getElementById('mainCanvas');
      let dragging = false;
      let lastX = 0, lastY = 0;

      canvas.addEventListener('mousedown', e => {
        dragging = true;
        lastX = e.clientX; lastY = e.clientY;
        if (app.currentTool === 'paint') {
          app.paint.active = true;
          this._paintAt(e, canvas);
        }
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
        app.paint.active = false;
      });
      window.addEventListener('mousemove', e => {
        if (!dragging) {
          this._updateBrushCursor(e, canvas);
          return;
        }
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (app.currentTool === 'paint' && app.paint.active) {
          this._paintAt(e, canvas);
        } else {
          cam.orbit(dx, dy);
          app.requestRender();
        }
      });
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        cam.zoom(e.deltaY * 0.001);
        app.requestRender();
      }, { passive: false });
    }

    _paintAt(e, canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      // Crude mapping: project screen y to terrain v based on camera pitch
      // Quick hack: use x for u and 1-y-ish for v, tweaked by pitch
      const cam = this.app.camera;
      const u = x;
      const v = Math.min(1, Math.max(0, y + (1 - cam.pitch) * 0.2 - 0.1));
      this.app.paint.apply(u, v);
      this.app.requestRender();
    }

    _updateBrushCursor(e, canvas) {
      let cur = document.querySelector('.brush-cursor');
      if (this.app.currentTool !== 'paint') {
        if (cur) cur.remove();
        return;
      }
      if (!cur) {
        cur = document.createElement('div');
        cur.className = 'brush-cursor';
        document.body.appendChild(cur);
      }
      const rect = canvas.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      cur.style.display = inside ? 'block' : 'none';
      const size = this.app.paint.size * 4;
      cur.style.width = size + 'px';
      cur.style.height = size + 'px';
      cur.style.left = e.clientX + 'px';
      cur.style.top = e.clientY + 'px';
    }

    _bindRenderOverlay() {
      document.getElementById('renderCloseBtn').addEventListener('click', () => {
        document.getElementById('renderOverlay').classList.add('hidden');
      });
    }

    refreshSceneList() {
      const list = document.getElementById('sceneList');
      const objs = this.app.objects.objects;
      list.innerHTML = '';
      if (objs.length === 0) {
        list.innerHTML = '<div style="opacity:0.5;font-style:italic;">(empty scene)</div>';
        return;
      }
      objs.forEach(obj => {
        const div = document.createElement('div');
        div.textContent = `• ${obj.type} #${obj.id}`;
        div.addEventListener('click', () => {
          this.app.objects.remove(obj.id);
          this.refreshSceneList();
          this.app.requestRender();
          this.log(`removed · ${obj.type} #${obj.id}`);
        });
        div.title = 'click to remove';
        list.appendChild(div);
      });
    }

    updateStats() {
      const t = this.app.terrain;
      const verts = t.size * t.size;
      document.getElementById('moodVerts').textContent = verts.toLocaleString();
      const objCount = this.app.objects.objects.length + this.app.objects.trees.length + this.app.objects.rocks.length;
      document.getElementById('moodObj').textContent = objCount;
      // Rough memory estimate
      const kb = (verts * 4 * 6) / 1024;
      const pct = Math.min(95, 15 + kb / 30);
      document.getElementById('memFill').style.width = pct + '%';
    }

    log(msg) {
      document.getElementById('moodLog').textContent = msg;
    }

    setStatus(text, color) {
      const el = document.getElementById('statusText');
      el.textContent = text;
      if (color) el.style.color = color;
    }

    updateHud(fps) {
      document.getElementById('hudFps').textContent = `${Math.round(fps)} fps`;
      const cam = this.app.camera;
      const p = cam.position();
      document.getElementById('hudCoords').textContent =
        `X:${p[0].toFixed(2)} Y:${p[1].toFixed(2)} Z:${p[2].toFixed(2)}`;
    }
  }

  W.UI = UI;
})(window);
