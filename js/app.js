// app.js — v4 bootstrap with transform, inspector, history, storage
import * as THREE from 'three';
import { Terrain } from './terrain.js';
import { MaterialSystem } from './materials.js';
import { PaintSystem } from './paint.js';
import { SceneManager } from './scene.js';
import { VideoRecorder } from './recorder.js';
import { SceneStore } from './scenes.js';
import { TransformManager } from './transform.js';
import { Inspector } from './inspector.js';
import { History } from './history.js';
import { storage, buildRecord, captureThumbnail, session } from './storage.js';

// ──────────────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('mainCanvas');
const terrain = new Terrain(192);
const materials = new MaterialSystem();
const paint = new PaintSystem(terrain);
terrain.generate();

const scene = new SceneManager(canvas, terrain, materials);
const recorder = new VideoRecorder(canvas);
const history = new History(100);

const app = { terrain, materials, sky: scene.sky, world: scene.world, scene };
const store = new SceneStore(app);

const transformMgr = new TransformManager(scene.scene, scene.camera, scene.renderer, scene.controls, canvas);
const inspector = new Inspector(document.getElementById('inspectPanel'), transformMgr, history);

let currentSceneId = null;
let currentSceneName = 'untitled';

scene.resize();
scene.skyPreset('sunset');
log('boot · WSF v4 initialized');

// Try to load pending scene from gallery
(async () => {
  const pending = session.getPendingLoad();
  if (pending) {
    session.clearPendingLoad();
    try {
      const rec = await storage.get(pending);
      if (rec && rec.data) {
        store.deserialize(rec.data);
        currentSceneId = rec.id;
        currentSceneName = rec.name;
        $('moodScene').textContent = rec.name;
        log(`loaded · ${rec.name}`);
        pushAllControlsFromState();
        updateMoodbar();
        refreshSceneList();
        refreshTransformPickList();
      }
    } catch (e) { console.error('failed to load pending', e); }
  }
})();

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function log(msg) { const el = $('moodLog'); if (el) el.textContent = msg; }
function setStatus(msg) { const el = $('statusText'); if (el) el.textContent = msg; }

function bindSlider(id, valId, scale, fmt, onChange) {
  const el = $(id), valEl = $(valId);
  if (!el) return;
  const update = () => {
    const v = parseFloat(el.value) * scale;
    if (valEl) valEl.textContent = fmt(v);
    onChange(v);
  };
  el.addEventListener('input', update);
  update();
}

function regen() {
  terrain.generate();
  scene.updateTerrain();
  log('regen · terrain rebuilt');
  updateMoodbar();
}
function repaintColors() { scene.updateTerrain(); }

function updateMoodbar() {
  $('moodVerts').textContent = scene.triangleCount().toLocaleString();
  $('moodObj').textContent = scene.objects.length + scene.floatingCubes.length;
  const memPct = Math.min(100, (scene.triangleCount() / 200000) * 100);
  $('memFill').style.width = memPct + '%';
}

function hexToInt(hex) { return parseInt(hex.replace('#', ''), 16); }
function intToHex(int) { return '#' + int.toString(16).padStart(6, '0'); }

function refreshTransformPickList() {
  // Pickable: all scene.objects and floating cubes
  transformMgr.setPickList([...scene.objects, ...scene.floatingCubes]);
}

// ──────────────────────────────────────────────────────────────────────
// Tool rail
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tool = btn.dataset.tool;
    document.querySelectorAll('.prop-group').forEach(g => g.classList.add('hidden'));
    const target = document.querySelector(`.prop-group[data-panel="${tool}"]`);
    if (target) target.classList.remove('hidden');
    paintActive = (tool === 'paint');
    if (paintActive) transformMgr.deselect();
  });
});

document.querySelectorAll('.tool-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => scene.viewPreset(btn.dataset.view));
});

// ──────────────────────────────────────────────────────────────────────
// SCENE PRESETS panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const ok = store.loadPreset(btn.dataset.preset);
    if (ok) {
      log(`preset · ${btn.dataset.preset}`);
      pushAllControlsFromState();
      updateMoodbar();
      refreshSceneList();
      refreshTransformPickList();
      transformMgr.deselect();
    }
  });
});

$('sceneSaveBtn').addEventListener('click', () => {
  store.exportToFile();
  log('scene · exported to .json');
});
$('sceneLoadBtn').addEventListener('click', () => $('sceneFileInput').click());
$('sceneFileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    await store.importFromFile(f);
    log(`scene · imported ${f.name}`);
    pushAllControlsFromState();
    updateMoodbar();
    refreshSceneList();
    refreshTransformPickList();
    transformMgr.deselect();
  } catch (err) { log('import failed'); console.error(err); }
});

$('sceneClearBtn').addEventListener('click', () => {
  scene.clearObjects();
  paint.clear();
  scene.updateTerrain();
  refreshSceneList();
  refreshTransformPickList();
  transformMgr.deselect();
  history.clear();
  updateMoodbar();
  log('scene · cleared');
});

$('libGalleryBtn').addEventListener('click', () => { window.location.href = 'gallery.html'; });
$('libSaveBtn').addEventListener('click', () => openSaveModal());
$('titleSaveBtn').addEventListener('click', () => openSaveModal());

// ──────────────────────────────────────────────────────────────────────
// Save dialog
// ──────────────────────────────────────────────────────────────────────
function openSaveModal() {
  const m = $('saveModal');
  m.classList.remove('hidden');
  $('saveModalName').value = currentSceneName !== 'untitled' ? currentSceneName : '';
  // Generate thumbnail preview
  scene.render(0); // ensure latest frame
  const thumbUrl = captureThumbnail(canvas, 280);
  const thumbEl = $('saveModalThumb');
  thumbEl.style.backgroundImage = `url("${thumbUrl}")`;
  thumbEl.dataset.thumb = thumbUrl;
  setTimeout(() => $('saveModalName').focus(), 50);
}
function closeSaveModal() { $('saveModal').classList.add('hidden'); }

$('saveModalCancel').addEventListener('click', closeSaveModal);
$('saveModalConfirm').addEventListener('click', async () => {
  const name = ($('saveModalName').value || '').trim() || 'untitled simulation';
  const thumb = $('saveModalThumb').dataset.thumb;
  const data = store.serialize();
  const rec = buildRecord(name, data, thumb, currentSceneId);
  if (!currentSceneId) rec.created = Date.now();
  await storage.save(rec);
  currentSceneId = rec.id;
  currentSceneName = rec.name;
  $('moodScene').textContent = rec.name;
  session.setLastSaved(rec.id);
  log(`saved · ${rec.name}`);
  closeSaveModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('saveModal').classList.contains('hidden')) closeSaveModal();
});

// ──────────────────────────────────────────────────────────────────────
// WORLD MODE panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.world-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.world-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.world;
    scene.setWorldMode(mode);
    $('checkerControls').style.display = (mode === 'checkered') ? '' : 'none';
    $('mirrorControls').style.display = (mode === 'mirror') ? '' : 'none';
    log(`world · ${mode}`);
  });
});

bindSlider('checkTile', 'checkTileV', 0.01, v => v.toFixed(2), v => scene.setCheckerParam('tile', v));
bindSlider('checkGloss', 'checkGlossV', 0.01, v => v.toFixed(2), v => scene.setCheckerParam('glossy', v));
$('checkColorA').addEventListener('input', e => scene.setCheckerParam('colorA', hexToInt(e.target.value)));
$('checkColorB').addEventListener('input', e => scene.setCheckerParam('colorB', hexToInt(e.target.value)));
bindSlider('mirrorRefl', 'mirrorReflV', 0.01, v => v.toFixed(2), v => scene.setMirrorParam('reflectivity', v));
$('mirrorTint').addEventListener('input', e => scene.setMirrorParam('tint', hexToInt(e.target.value)));

// ──────────────────────────────────────────────────────────────────────
// TERRAIN panel
// ──────────────────────────────────────────────────────────────────────
bindSlider('terrFreq', 'terrFreqV', 0.01, v => v.toFixed(2), v => terrain.setParam('freq', v));
bindSlider('terrAmp', 'terrAmpV', 0.01, v => v.toFixed(2), v => terrain.setParam('amp', v));
bindSlider('terrOct', 'terrOctV', 1, v => v.toFixed(0), v => terrain.setParam('oct', Math.round(v)));
bindSlider('terrSeed', 'terrSeedV', 1, v => v.toFixed(0), v => terrain.setParam('seed', Math.round(v)));
bindSlider('terrRidge', 'terrRidgeV', 0.01, v => v.toFixed(2), v => terrain.setParam('ridge', v));
bindSlider('terrPeak', 'terrPeakV', 0.01, v => v.toFixed(2), v => terrain.setParam('peak', v));
bindSlider('terrErode', 'terrErodeV', 0.01, v => v.toFixed(2), v => terrain.setParam('erode', v));
bindSlider('terrPlateau', 'terrPlateauV', 0.01, v => v.toFixed(2), v => terrain.setParam('plateau', v));
bindSlider('terrSmooth', 'terrSmoothV', 0.01, v => v.toFixed(2), v => terrain.setParam('smooth', v));

const resEl = $('terrRes'), resVal = $('terrResV');
resEl.addEventListener('input', () => { resVal.textContent = parseInt(resEl.value); });
resEl.addEventListener('change', () => {
  const v = parseInt(resEl.value);
  terrain.resize(v);
  terrain.generate();
  scene.rebuildTerrainGeometry();
  log(`res · ${v}×${v}`);
  updateMoodbar();
});

$('terrNewBtn').addEventListener('click', regen);
$('terrRandBtn').addEventListener('click', () => {
  const seed = Math.floor(Math.random() * 9999);
  terrain.setParam('seed', seed);
  $('terrSeed').value = seed; $('terrSeedV').textContent = seed;
  regen();
});

// ──────────────────────────────────────────────────────────────────────
// SKY panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('[data-skymode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-skymode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const m = btn.dataset.skymode;
    scene.setSkyMode(m);
    $('atmosControls').style.display = (m === 'atmosphere') ? '' : 'none';
    $('gradControls').style.display = (m === 'gradient') ? '' : 'none';
    log(`sky mode · ${m}`);
  });
});

bindSlider('skyElev', 'skyElevV', 1, v => v.toFixed(0) + '°', v => scene.setSkyParam('elev', v));
bindSlider('skyAzim', 'skyAzimV', 1, v => v.toFixed(0) + '°', v => scene.setSkyParam('azim', v));
bindSlider('skyTurb', 'skyTurbV', 0.1, v => v.toFixed(1), v => scene.setSkyParam('turb', v));
bindSlider('skyRayl', 'skyRaylV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('rayl', v));
bindSlider('skyMie', 'skyMieV', 0.001, v => v.toFixed(3), v => scene.setSkyParam('mie', v));

bindSlider('gradStops', 'gradStopsV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('gradientStops', v));
$('gradTop').addEventListener('input', e => scene.setSkyParam('topColor', hexToInt(e.target.value)));
$('gradMid').addEventListener('input', e => scene.setSkyParam('midColor', hexToInt(e.target.value)));
$('gradHor').addEventListener('input', e => scene.setSkyParam('horizonColor', hexToInt(e.target.value)));

bindSlider('cloudDens', 'cloudDensV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('clouds', v));
bindSlider('cloudSpd', 'cloudSpdV', 0.001, v => v.toFixed(3), v => scene.setSkyParam('cloudSpeed', v));
bindSlider('cloudHgt', 'cloudHgtV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('cloudHeight', v));
$('cloudCol').addEventListener('input', e => scene.setSkyParam('cloudColor', hexToInt(e.target.value)));

$('planet1En').addEventListener('change', e => scene.setSkyParam('planet1Enabled', e.target.checked));
bindSlider('planet1Sz', 'planet1SzV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('planet1Size', v));
bindSlider('planet1Px', 'planet1PxV', 0.01, v => v.toFixed(2), v => scene.setPlanetPos(0, v, scene.sky.params.planet1Pos.y));
bindSlider('planet1Py', 'planet1PyV', 0.01, v => v.toFixed(2), v => scene.setPlanetPos(0, scene.sky.params.planet1Pos.x, v));
$('planet1Col').addEventListener('input', e => scene.setSkyParam('planet1Color', hexToInt(e.target.value)));

$('planet2En').addEventListener('change', e => scene.setSkyParam('planet2Enabled', e.target.checked));
bindSlider('planet2Sz', 'planet2SzV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('planet2Size', v));
bindSlider('planet2Px', 'planet2PxV', 0.01, v => v.toFixed(2), v => scene.setPlanetPos(1, v, scene.sky.params.planet2Pos.y));
bindSlider('planet2Py', 'planet2PyV', 0.01, v => v.toFixed(2), v => scene.setPlanetPos(1, scene.sky.params.planet2Pos.x, v));
$('planet2Col').addEventListener('input', e => scene.setSkyParam('planet2Color', hexToInt(e.target.value)));

bindSlider('skyStars', 'skyStarsV', 0.01, v => v.toFixed(2), v => scene.setSkyParam('stars', v));
bindSlider('skyFog', 'skyFogV', 0.01, v => v.toFixed(2), v => scene.setFog(v));
$('skyFogColor').addEventListener('input', e => scene.setFog(scene.fogParams.density, hexToInt(e.target.value)));

document.querySelectorAll('[data-skypreset]').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = scene.skyPreset(btn.dataset.skypreset);
    if (!p) return;
    pushSkyControlsFromState();
    log(`sky · ${btn.dataset.skypreset}`);
  });
});

// ──────────────────────────────────────────────────────────────────────
// OBJECTS panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.prim-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mesh = scene.addPrimitive(btn.dataset.prim);
    if (mesh) {
      history.push({
        label: 'add ' + btn.dataset.prim,
        undo: () => { scene.removeObject(mesh.userData.id); transformMgr.deselect(); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
        redo: () => { scene.scene.add(mesh); scene.objects.push(mesh); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
      });
      transformMgr.select([mesh]);
      // Switch to inspect panel
      const inspectBtn = document.querySelector('.tool-btn[data-tool="inspect"]');
      if (inspectBtn) inspectBtn.click();
    }
    refreshSceneList();
    refreshTransformPickList();
    updateMoodbar();
    log(`add · ${btn.dataset.prim}`);
  });
});

bindSlider('cubeCount', 'cubeCountV', 1, v => v.toFixed(0), () => {});
bindSlider('cubeHgt', 'cubeHgtV', 0.01, v => v.toFixed(2), () => {});

$('cubeSpawnBtn').addEventListener('click', () => {
  const n = parseInt($('cubeCount').value);
  const h = parseFloat($('cubeHgt').value) / 100;
  scene.spawnFloatingCubes(n, h);
  refreshTransformPickList();
  updateMoodbar();
  log(`spawn · ${n} chrome cubes`);
});

bindSlider('scatterDens', 'scatterDensV', 1, v => v.toFixed(0), () => {});
bindSlider('scatterSlope', 'scatterSlopeV', 0.01, v => v.toFixed(2), () => {});
bindSlider('scatterHmin', 'scatterHminV', 0.01, v => v.toFixed(2), () => {});
bindSlider('scatterHmax', 'scatterHmaxV', 0.01, v => v.toFixed(2), () => {});

$('scatterBtn').addEventListener('click', () => {
  const dens = parseInt($('scatterDens').value);
  const slope = parseFloat($('scatterSlope').value) / 100;
  const hMin = parseFloat($('scatterHmin').value) / 100;
  const hMax = parseFloat($('scatterHmax').value) / 100;
  const placed = scene.scatterTrees(dens, slope, hMin, hMax);
  log(`scatter · ${placed} trees`);
  updateMoodbar();
});

$('clearObjBtn').addEventListener('click', () => {
  scene.clearObjects();
  refreshSceneList();
  refreshTransformPickList();
  transformMgr.deselect();
  updateMoodbar();
  log('clear · all objects');
});

function refreshSceneList() {
  const list = $('sceneList');
  list.innerHTML = '';
  scene.objects.forEach(o => {
    const el = document.createElement('div');
    el.textContent = `· ${(o.userData.type || 'obj').toUpperCase()}`;
    el.addEventListener('click', () => {
      transformMgr.select([o]);
      // Switch to inspect
      const inspectBtn = document.querySelector('.tool-btn[data-tool="inspect"]');
      if (inspectBtn) inspectBtn.click();
    });
    list.appendChild(el);
  });
}

// ──────────────────────────────────────────────────────────────────────
// MATERIALS panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.mat-swatch').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mat-swatch').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    materials.setPreset(btn.dataset.mat);
    repaintColors();
    log(`mat · ${btn.dataset.mat}`);
  });
});

bindSlider('matSnowLine', 'matSnowLineV', 0.01, v => v.toFixed(2), v => { materials.setParam('snowLine', v); repaintColors(); });
bindSlider('matMoss', 'matMossV', 0.01, v => v.toFixed(2), v => { materials.setParam('moss', v); repaintColors(); });
bindSlider('matWaterLvl', 'matWaterLvlV', 0.01, v => v.toFixed(2), v => {
  materials.setParam('waterLevel', v);
  scene.setWaterLevel(v);
  repaintColors();
});
bindSlider('matSlope', 'matSlopeV', 0.01, v => v.toFixed(2), v => { materials.setParam('slopeBlend', v); repaintColors(); });

$('waterEnabled').addEventListener('change', e => scene.setWaterEnabled(e.target.checked));
$('waterColor').addEventListener('input', e => scene.setWaterColor(e.target.value));
bindSlider('waterOpac', 'waterOpacV', 0.01, v => v.toFixed(2), v => scene.setWaterOpacity(v));

// ──────────────────────────────────────────────────────────────────────
// PAINT panel
// ──────────────────────────────────────────────────────────────────────
let paintActive = false;
let painting = false;

document.querySelectorAll('.paint-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.paint-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    paint.setMode(btn.dataset.paint);
  });
});

bindSlider('brushSize', 'brushSizeV', 1, v => v.toFixed(0), v => paint.setSize(v));
bindSlider('brushStr', 'brushStrV', 0.01, v => v.toFixed(2), v => paint.setStrength(v));
bindSlider('brushFall', 'brushFallV', 0.01, v => v.toFixed(2), v => paint.setFalloff(v));

$('paintClearBtn').addEventListener('click', () => {
  paint.clear();
  scene.updateTerrain();
  log('paint · cleared');
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function paintFromEvent(e) {
  if (!paintActive) return false;
  const target = scene.getRaycastMesh();
  if (!target) return false;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, scene.camera);
  const hits = raycaster.intersectObject(target);
  if (hits.length === 0) return false;
  const p = hits[0].point;
  const u = (p.x / scene.worldSize) + 0.5;
  const v = (p.z / scene.worldSize) + 0.5;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  paint.apply(u, v);
  scene.updateTerrain();
  return true;
}

canvas.addEventListener('pointerdown', e => {
  if (paintActive && e.button === 0) {
    painting = true;
    scene.controls.enabled = false;
    paintFromEvent(e);
  }
});
canvas.addEventListener('pointermove', e => { if (painting) paintFromEvent(e); });
canvas.addEventListener('pointerup', () => {
  if (painting) { painting = false; scene.controls.enabled = true; }
});
canvas.addEventListener('pointerleave', () => {
  if (painting) { painting = false; scene.controls.enabled = true; }
});

// ──────────────────────────────────────────────────────────────────────
// CAMERA panel
// ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('[data-cam]').forEach(btn => {
  btn.addEventListener('click', () => scene.cameraPreset(btn.dataset.cam));
});
bindSlider('camFov', 'camFovV', 1, v => v.toFixed(0) + '°', v => scene.setFov(v));
$('postBloom').addEventListener('change', e => scene.setBloom(e.target.checked, parseFloat($('bloomStr').value) / 100));
bindSlider('bloomStr', 'bloomStrV', 0.01, v => v.toFixed(2), v => scene.setBloom($('postBloom').checked, v));
$('postVignette').addEventListener('change', e => document.body.classList.toggle('no-vignette', !e.target.checked));
$('wireBtn').addEventListener('click', () => {
  scene.setWireframe(!scene.wireframe);
  $('wireBtn').classList.toggle('active', scene.wireframe);
});
$('resetCamBtn').addEventListener('click', () => scene.resetCamera());
bindSlider('exposure', 'exposureVal', 0.01, v => v.toFixed(2), v => scene.setExposure(v));

// ──────────────────────────────────────────────────────────────────────
// EXPORT — PNG, PNG sequence, video
// ──────────────────────────────────────────────────────────────────────
bindSlider('vidDur', 'vidDurV', 1, v => v.toFixed(0) + 's', () => {});
bindSlider('vidFps', 'vidFpsV', 1, v => v.toFixed(0), () => {});
bindSlider('vidTilt', 'vidTiltV', 1, v => v.toFixed(0) + '°', () => {});
bindSlider('seqDur', 'seqDurV', 1, v => v.toFixed(0) + 's', () => {});
bindSlider('seqFps', 'seqFpsV', 1, v => v.toFixed(0), () => {});

const recIndicator = $('recIndicator');
const recTime = $('recTime');
const recBtn = $('recordBtn');
const turnBtn = $('turntableBtn');
const snapBtn = $('snapBtn');
const vidInfo = $('vidInfo');

function setRecUI(on) {
  recIndicator.classList.toggle('hidden', !on);
  recBtn.classList.toggle('recording', on);
  recBtn.textContent = on ? '■ STOP' : '● REC';
}

snapBtn.addEventListener('click', async () => {
  // Hide gizmo for clean shot
  const gizmoVis = transformMgr.gizmo.visible;
  transformMgr.gizmo.visible = false;
  scene.render(0);
  const r = await recorder.exportPNG();
  transformMgr.gizmo.visible = gizmoVis;
  vidInfo.textContent = `saved · ${r.name}`;
  log(`png · ${r.name}`);
});
$('pngBtn').addEventListener('click', () => snapBtn.click());

$('seqBtn').addEventListener('click', async () => {
  if (recorder.recording) return;
  const dur = parseInt($('seqDur').value);
  const fps = parseInt($('seqFps').value);
  setStatus('PNG SEQUENCE');
  vidInfo.textContent = `sequence · ${dur}s @ ${fps}fps`;
  log('png seq · started');
  const gizmoVis = transformMgr.gizmo.visible;
  transformMgr.gizmo.visible = false;
  await recorder.exportPNGSequence(scene, {
    duration: dur, fps, tilt: 15,
    onProgress: p => { recTime.textContent = (p * dur).toFixed(1) + 's'; },
  });
  transformMgr.gizmo.visible = gizmoVis;
  setStatus('READY');
  vidInfo.textContent = `sequence · ${dur * fps} frames saved`;
  log('png seq · done');
});

recBtn.addEventListener('click', async () => {
  if (recorder.recording) {
    setStatus('SAVING...');
    const r = await recorder.stop();
    setRecUI(false);
    setStatus('READY');
    if (r) { vidInfo.textContent = `saved · ${r.name}`; log(`video · ${r.name}`); }
  } else {
    const fps = parseInt($('vidFps').value);
    recorder.start(fps);
    setRecUI(true);
    setStatus('RECORDING');
    vidInfo.textContent = `recording @ ${fps}fps`;
    log('video · recording');
  }
});

turnBtn.addEventListener('click', async () => {
  if (recorder.recording) return;
  const dur = parseInt($('vidDur').value);
  const fps = parseInt($('vidFps').value);
  const tilt = parseInt($('vidTilt').value);
  setRecUI(true);
  setStatus('TURNTABLE');
  vidInfo.textContent = `turntable · ${dur}s @ ${fps}fps`;
  log(`turntable · ${dur}s`);
  const gizmoVis = transformMgr.gizmo.visible;
  transformMgr.gizmo.visible = false;
  await recorder.turntable(scene, {
    duration: dur, fps, tilt,
    onProgress: p => { recTime.textContent = (p * dur).toFixed(1) + 's'; },
  });
  transformMgr.gizmo.visible = gizmoVis;
  setRecUI(false);
  setStatus('READY');
  vidInfo.textContent = 'turntable saved';
  log('turntable · done');
});

// ──────────────────────────────────────────────────────────────────────
// TRANSFORM + INSPECTOR + HISTORY wiring
// ──────────────────────────────────────────────────────────────────────
transformMgr.on('selectionChange', (sel) => {
  inspector.setSelection(sel);
  $('hudSel').textContent = sel.length === 0 ? '—' :
    (sel.length === 1 ? (sel[0].userData.type || 'obj').toUpperCase() : `${sel.length} OBJ`);
});

transformMgr.on('transformChange', () => {
  transformMgr.syncOutlines();
  transformMgr.syncMultiSelect();
  inspector.refresh();
});

transformMgr.on('transformEnd', (before, after) => {
  history.push({
    label: 'transform',
    undo: () => transformMgr.applyGroupState(before),
    redo: () => transformMgr.applyGroupState(after),
  });
});

transformMgr.on('undo', () => history.undo());
transformMgr.on('redo', () => history.redo());

transformMgr.on('duplicate', () => {
  const sel = transformMgr.selected;
  if (sel.length === 0) return;
  const dups = [];
  sel.forEach(orig => {
    const dup = scene.duplicateObject(orig);
    if (dup) {
      dup.position.x += 5;
      dup.position.z += 5;
      dups.push(dup);
    }
  });
  refreshSceneList();
  refreshTransformPickList();
  transformMgr.select(dups);
  history.push({
    label: 'duplicate',
    undo: () => { dups.forEach(d => scene.removeObject(d.userData.id)); transformMgr.deselect(); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
    redo: () => { dups.forEach(d => { scene.scene.add(d); scene.objects.push(d); }); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
  });
  updateMoodbar();
  log(`duplicate · ${dups.length}`);
});

transformMgr.on('deleteSelection', () => {
  const sel = transformMgr.selected.slice();
  if (sel.length === 0) return;
  sel.forEach(o => scene.removeObject(o.userData.id));
  transformMgr.deselect();
  refreshSceneList();
  refreshTransformPickList();
  history.push({
    label: 'delete',
    undo: () => { sel.forEach(d => { scene.scene.add(d); scene.objects.push(d); }); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
    redo: () => { sel.forEach(d => scene.removeObject(d.userData.id)); transformMgr.deselect(); refreshSceneList(); refreshTransformPickList(); updateMoodbar(); },
  });
  updateMoodbar();
  log(`delete · ${sel.length}`);
});

transformMgr.on('focusSelection', () => {
  const sel = transformMgr.selected;
  if (sel.length === 0) return;
  const c = new THREE.Vector3();
  sel.forEach(m => c.add(m.position));
  c.divideScalar(sel.length);
  scene.controls.target.copy(c);
});

transformMgr.on('selectAll', () => {
  transformMgr.select([...scene.objects, ...scene.floatingCubes]);
});

inspector.on('duplicate', () => transformMgr._listeners.duplicate());
inspector.on('delete', () => transformMgr._listeners.deleteSelection());
inspector.on('focus', () => transformMgr._listeners.focusSelection());
inspector.on('ground', () => {
  // Snap selected to ground
  transformMgr.selected.forEach(m => {
    const u = (m.position.x / scene.worldSize) + 0.5;
    const v = (m.position.z / scene.worldSize) + 0.5;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      m.position.y = scene.world.sampleHeight(u, v) + m.scale.y * 0.5;
    } else {
      m.position.y = m.scale.y * 0.5;
    }
  });
  inspector.refresh();
  transformMgr.syncOutlines();
});

$('undoBtn').addEventListener('click', () => history.undo());
$('redoBtn').addEventListener('click', () => history.redo());

history.onChange = (h) => {
  $('undoBtn').classList.toggle('disabled', !h.canUndo());
  $('redoBtn').classList.toggle('disabled', !h.canRedo());
};

// ──────────────────────────────────────────────────────────────────────
// Push state into UI controls
// ──────────────────────────────────────────────────────────────────────
function pushSkyControlsFromState() {
  const p = scene.sky.params;
  $('skyElev').value = p.elev; $('skyElevV').textContent = Math.round(p.elev) + '°';
  $('skyAzim').value = p.azim; $('skyAzimV').textContent = Math.round(p.azim) + '°';
  $('skyTurb').value = p.turb * 10; $('skyTurbV').textContent = p.turb.toFixed(1);
  $('skyRayl').value = p.rayl * 100; $('skyRaylV').textContent = p.rayl.toFixed(2);
  $('skyMie').value = p.mie * 1000; $('skyMieV').textContent = p.mie.toFixed(3);
  $('cloudDens').value = p.clouds * 100; $('cloudDensV').textContent = p.clouds.toFixed(2);
  $('cloudSpd').value = p.cloudSpeed * 1000; $('cloudSpdV').textContent = p.cloudSpeed.toFixed(3);
  $('cloudHgt').value = p.cloudHeight * 100; $('cloudHgtV').textContent = p.cloudHeight.toFixed(2);
  $('cloudCol').value = intToHex(p.cloudColor);
  $('skyStars').value = p.stars * 100; $('skyStarsV').textContent = p.stars.toFixed(2);
  $('gradTop').value = intToHex(p.topColor);
  $('gradMid').value = intToHex(p.midColor);
  $('gradHor').value = intToHex(p.horizonColor);
  $('gradStops').value = p.gradientStops * 100; $('gradStopsV').textContent = p.gradientStops.toFixed(2);
  $('planet1En').checked = p.planet1Enabled;
  $('planet1Sz').value = p.planet1Size * 100; $('planet1SzV').textContent = p.planet1Size.toFixed(2);
  $('planet1Px').value = p.planet1Pos.x * 100; $('planet1PxV').textContent = p.planet1Pos.x.toFixed(2);
  $('planet1Py').value = p.planet1Pos.y * 100; $('planet1PyV').textContent = p.planet1Pos.y.toFixed(2);
  $('planet1Col').value = intToHex(p.planet1Color);
  $('planet2En').checked = p.planet2Enabled;
  $('planet2Sz').value = p.planet2Size * 100; $('planet2SzV').textContent = p.planet2Size.toFixed(2);
  $('planet2Px').value = p.planet2Pos.x * 100; $('planet2PxV').textContent = p.planet2Pos.x.toFixed(2);
  $('planet2Py').value = p.planet2Pos.y * 100; $('planet2PyV').textContent = p.planet2Pos.y.toFixed(2);
  $('planet2Col').value = intToHex(p.planet2Color);
  document.querySelectorAll('[data-skymode]').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-skymode="${p.mode || 'atmosphere'}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  $('atmosControls').style.display = (p.mode === 'atmosphere' || !p.mode) ? '' : 'none';
  $('gradControls').style.display = (p.mode === 'gradient') ? '' : 'none';
}

function pushTerrainControlsFromState() {
  const p = terrain.params;
  $('terrFreq').value = p.freq * 100; $('terrFreqV').textContent = p.freq.toFixed(2);
  $('terrAmp').value = p.amp * 100; $('terrAmpV').textContent = p.amp.toFixed(2);
  $('terrOct').value = p.oct; $('terrOctV').textContent = p.oct;
  $('terrSeed').value = p.seed; $('terrSeedV').textContent = p.seed;
  $('terrRidge').value = p.ridge * 100; $('terrRidgeV').textContent = p.ridge.toFixed(2);
  $('terrPeak').value = p.peak * 100; $('terrPeakV').textContent = p.peak.toFixed(2);
  $('terrErode').value = p.erode * 100; $('terrErodeV').textContent = p.erode.toFixed(2);
  $('terrPlateau').value = p.plateau * 100; $('terrPlateauV').textContent = p.plateau.toFixed(2);
  $('terrSmooth').value = p.smooth * 100; $('terrSmoothV').textContent = p.smooth.toFixed(2);
  $('terrRes').value = terrain.size; $('terrResV').textContent = terrain.size;
}

function pushMaterialControlsFromState() {
  const p = materials.params;
  $('matSnowLine').value = p.snowLine * 100; $('matSnowLineV').textContent = p.snowLine.toFixed(2);
  $('matMoss').value = p.moss * 100; $('matMossV').textContent = p.moss.toFixed(2);
  $('matWaterLvl').value = p.waterLevel * 100; $('matWaterLvlV').textContent = p.waterLevel.toFixed(2);
  $('matSlope').value = p.slopeBlend * 100; $('matSlopeV').textContent = p.slopeBlend.toFixed(2);
  document.querySelectorAll('.mat-swatch').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-mat="${materials.current}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

function pushWorldControlsFromState() {
  document.querySelectorAll('.world-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-world="${scene.world.mode}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  $('checkerControls').style.display = (scene.world.mode === 'checkered') ? '' : 'none';
  $('mirrorControls').style.display = (scene.world.mode === 'mirror') ? '' : 'none';
  $('checkTile').value = scene.world.checkerParams.tile * 100;
  $('checkTileV').textContent = scene.world.checkerParams.tile.toFixed(2);
  $('checkGloss').value = scene.world.checkerParams.glossy * 100;
  $('checkGlossV').textContent = scene.world.checkerParams.glossy.toFixed(2);
  $('checkColorA').value = intToHex(scene.world.checkerParams.colorA);
  $('checkColorB').value = intToHex(scene.world.checkerParams.colorB);
  $('mirrorRefl').value = scene.world.mirrorParams.reflectivity * 100;
  $('mirrorReflV').textContent = scene.world.mirrorParams.reflectivity.toFixed(2);
  $('mirrorTint').value = intToHex(scene.world.mirrorParams.tint);
}

function pushAllControlsFromState() {
  pushSkyControlsFromState();
  pushTerrainControlsFromState();
  pushMaterialControlsFromState();
  pushWorldControlsFromState();
}

// ──────────────────────────────────────────────────────────────────────
// Resize + render loop
// ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => scene.resize());
new ResizeObserver(() => scene.resize()).observe(canvas.parentElement);

let lastT = performance.now();
let frames = 0, fpsTimer = 0;
const hudFps = $('hudFps');
const hudCoords = $('hudCoords');

function loop() {
  const now = performance.now();
  const dt = (now - lastT) / 1000;
  lastT = now;

  if (recorder.recording) recTime.textContent = recorder.elapsed().toFixed(1) + 's';

  if (hudCoords) {
    const c = scene.camera.position;
    hudCoords.textContent = `X:${c.x.toFixed(1)} Y:${c.y.toFixed(1)} Z:${c.z.toFixed(1)}`;
  }

  transformMgr.syncOutlines();
  transformMgr.syncMultiSelect();
  scene.render(dt);

  frames++; fpsTimer += dt;
  if (fpsTimer > 0.5) {
    if (hudFps) hudFps.textContent = `${Math.round(frames / fpsTimer)} fps`;
    frames = 0; fpsTimer = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

updateMoodbar();
pushSkyControlsFromState();
refreshTransformPickList();
setStatus('READY');
