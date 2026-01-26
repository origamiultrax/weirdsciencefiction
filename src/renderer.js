import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

export async function createRenderer(viewportEl) {
  // Expose THREE for app-level helpers (simple, pragmatic)
  window.THREE = THREE;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true, // for snapshot
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  viewportEl.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  // Bryce-ish overlay: horizon line + perspective guides (cheap canvas overdraw)
  const overlay = createOverlay(viewportEl);

  // Stub composer in case you later add postprocessing
  const composer = null;

  return { renderer, pmrem, composer, overlay, OrbitControls, THREE };
}

function createOverlay(viewportEl) {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.opacity = '0.6';
  viewportEl.appendChild(canvas);

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = viewportEl.clientWidth * devicePixelRatio;
    canvas.height = viewportEl.clientHeight * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(renderer, camera) {
    resize();
    const w = viewportEl.clientWidth;
    const h = viewportEl.clientHeight;

    ctx.clearRect(0, 0, w, h);

    // horizon-ish line
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(47,108,241,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.54);
    ctx.lineTo(w, h * 0.54);
    ctx.stroke();

    // perspective guidelines (faint)
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.lineTo(w * 0.1, h * 0.9);
    ctx.moveTo(w * 0.5, h * 0.2);
    ctx.lineTo(w * 0.9, h * 0.9);
    ctx.stroke();

    // ground grid lines (red-ish)
    ctx.strokeStyle = 'rgba(211,65,65,0.22)';
    const baseY = h * 0.65;
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const y = baseY + t * (h * 0.28);
      ctx.beginPath();
      ctx.moveTo(w * 0.15, y);
      ctx.lineTo(w * 0.85, y);
      ctx.stroke();
    }
  }

  return { draw };
}
