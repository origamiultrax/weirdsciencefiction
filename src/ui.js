export class UI {
  constructor(app){
    this.app = app;

    // Terrain
    this.noiseFreq = byId('noiseFreq');
    this.noiseAmp  = byId('noiseAmp');
    this.noiseOct  = byId('noiseOct');
    this.plateau   = byId('plateau');
    this.smooth    = byId('smooth');
    this.erosion   = byId('erosion');

    // Sky
    this.timeOfDay = byId('timeOfDay');
    this.fogDensity= byId('fogDensity');
    this.cloudAmount=byId('cloudAmount');
    this.skyZenith = byId('skyZenith');
    this.skyHorizon= byId('skyHorizon');

    // Materials
    this.matPreset = byId('matPreset');
    this.matVar    = byId('matVar');
    this.matRough  = byId('matRough');
    this.matScale  = byId('matScale');
    this.blendSlope= byId('blendSlope');
    this.blendHeight=byId('blendHeight');

    // Camera & render
    this.camPreset = byId('camPreset');
    this.dofToggle = byId('dofToggle');
    this.exposure  = byId('exposure');

    // Paint
    this.brushSize = byId('brushSize');
    this.brushStrength = byId('brushStrength');
    this.paintMode = byId('paintMode');

    // Buttons
    this.regenTerrainBtn = byId('regenTerrainBtn');
    this.resetTerrainBtn = byId('resetTerrainBtn');
    this.finalRenderBtn  = byId('finalRenderBtn');
    this.snapshotBtn     = byId('snapshotBtn');

    // Bottom timeline mirrors time-of-day
    this.timeline = byId('timeline');
  }

  bind(){
    const { terrain, sky, materials, objects, paint, renderer, camera, controls } = this.app;

    // helper to update label values
    const bindRange = (el, valElId, fn) => {
      const valEl = byId(valElId);
      const update = () => {
        if (valEl) valEl.textContent = formatNum(el.value);
        fn(parseFloat(el.value));
      };
      el.addEventListener('input', update);
      update();
    };

    // Terrain sliders (live preview while dragging)
    bindRange(this.noiseFreq, 'noiseFreqVal', v => { terrain.params.frequency = v; terrain.regenerate(false); });
    bindRange(this.noiseAmp,  'noiseAmpVal',  v => { terrain.params.amplitude = v; terrain.regenerate(false); });
    bindRange(this.noiseOct,  'noiseOctVal',  v => { terrain.params.octaves = Math.floor(v); terrain.regenerate(false); });
    bindRange(this.plateau,   'plateauVal',   v => { terrain.params.plateau = v; terrain.regenerate(false); });
    bindRange(this.smooth,    'smoothVal',    v => { terrain.params.smooth = v; terrain.regenerate(false); });
    bindRange(this.erosion,   'erosionVal',   v => { terrain.params.erosion = v; terrain.regenerate(false); });

    this.regenTerrainBtn.addEventListener('click', () => terrain.regenerate(false));
    this.resetTerrainBtn.addEventListener('click', () => { terrain.regenerate(true); });

    // Paint
    bindRange(this.brushSize, 'brushSizeVal', v => { paint.brushSize = v; });
    bindRange(this.brushStrength, 'brushStrengthVal', v => { paint.strength = v; });
    this.paintMode.addEventListener('change', () => { paint.mode = this.paintMode.value; });

    // Left rail paint quick buttons
    document.querySelectorAll('[data-paint]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const m = btn.getAttribute('data-paint');
        this.paintMode.value = m;
        paint.mode = m;
      });
    });

    // Sky
    bindRange(this.timeOfDay, 'timeOfDayVal', v => { sky.params.timeOfDay = v; this.timeline.value = v; sky.applyParams(); terrain.material.userData._uniforms.uSunDir.value.copy(sky.sunDir); });
    bindRange(this.fogDensity,'fogDensityVal', v => { sky.params.fogDensity = v; sky.applyParams(); });
    bindRange(this.cloudAmount,'cloudAmountVal', v => { sky.params.cloudAmount = v; });

    this.skyZenith.addEventListener('input', ()=>{ sky.params.zenith = this.skyZenith.value; sky.applyParams(); });
    this.skyHorizon.addEventListener('input', ()=>{ sky.params.horizon = this.skyHorizon.value; sky.applyParams(); });

    // Bottom timeline mirrors time of day
    this.timeline.addEventListener('input', ()=>{
      this.timeOfDay.value = this.timeline.value;
      this.timeOfDay.dispatchEvent(new Event('input'));
    });

    // Materials
    const applyMat = () => {
      materials.applyParamsToTerrainMaterial(terrain.material);
    };
    this.matPreset.addEventListener('change', ()=>{
      materials.params.preset = this.matPreset.value;
      applyMat();
    });
    bindRange(this.matVar, 'matVarVal', v => { materials.params.variation = v; applyMat(); });
    bindRange(this.matRough,'matRoughVal', v => { materials.params.roughness = v; applyMat(); });
    bindRange(this.matScale,'matScaleVal', v => { materials.params.scale = v; applyMat(); });
    bindRange(this.blendSlope,'blendSlopeVal', v => { materials.params.blendSlope = v; applyMat(); });
    bindRange(this.blendHeight,'blendHeightVal', v => { materials.params.blendHeight = v; applyMat(); });

    // Camera presets
    this.camPreset.addEventListener('change', ()=>{
      const p = this.camPreset.value;
      if (p === 'wide'){
        camera.fov = 65; camera.updateProjectionMatrix();
        camera.position.set(55, 38, 55);
        controls.target.set(0, 6, 0);
      }
      if (p === 'tele'){
        camera.fov = 32; camera.updateProjectionMatrix();
        camera.position.set(90, 44, 90);
        controls.target.set(0, 8, 0);
      }
      if (p === 'aerial'){
        camera.fov = 50; camera.updateProjectionMatrix();
        camera.position.set(0, 110, 0.01);
        controls.target.set(0, 0, 0);
      }
    });

    // DOF toggle (placeholder hook)
    this.dofToggle.addEventListener('change', ()=>{
      // You can add a postprocessing BokehPass later.
      this.app.setStatus(this.dofToggle.checked ? 'DOF: ON (hook ready)' : 'DOF: OFF');
    });

    // Exposure
    bindRange(this.exposure,'exposureVal', v => { renderer.toneMappingExposure = v; });

    // Render actions
    this.finalRenderBtn.addEventListener('click', ()=> this.app.finalRender());
    this.snapshotBtn.addEventListener('click', ()=> this.app.snapshotPNG());

    // Objects
    byId('addSphereBtn').addEventListener('click', ()=> objects.addPrimitive('sphere'));
    byId('addCubeBtn').addEventListener('click', ()=> objects.addPrimitive('cube'));
    byId('addConeBtn').addEventListener('click', ()=> objects.addPrimitive('cone'));
    byId('addCylBtn').addEventListener('click', ()=> objects.addPrimitive('cylinder'));
    byId('scatterTreesBtn').addEventListener('click', ()=> objects.scatterTrees({count: 220}));
    byId('scatterRocksBtn').addEventListener('click', ()=> objects.scatterRocks({count: 260}));
  }

  syncAllToUI(){
    // ensures initial label values show
    const inputs = document.querySelectorAll('input[type="range"]');
    inputs.forEach(i => i.dispatchEvent(new Event('input')));
    // apply sky colors & preset dropdowns
    this.app.sky.applyParams();
    this.app.materials.applyParamsToTerrainMaterial(this.app.terrain.material);
  }
}

function byId(id){ return document.getElementById(id); }
function formatNum(v){
  const n = parseFloat(v);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
}