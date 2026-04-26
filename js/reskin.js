// reskin.js — Image/video reskin tool with WebGL shader pipeline
const VERTEX_SRC = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 vUv;
  void main() {
    vUv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_tex;
  uniform vec2 u_resolution;
  uniform float u_time;

  uniform float u_sat;
  uniform float u_contrast;
  uniform float u_posterize;
  uniform float u_hue;
  uniform float u_warmth;
  uniform float u_chroma;
  uniform float u_vignette;
  uniform float u_blur;
  uniform float u_grain;
  uniform float u_scan;
  uniform float u_pixel;
  uniform float u_bleed;
  uniform float u_dither;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // 4x4 Bayer dither matrix
  float bayer(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int idx = x + y * 4;
    float v = 0.0;
    if (idx == 0) v = 0.0;
    else if (idx == 1) v = 8.0;
    else if (idx == 2) v = 2.0;
    else if (idx == 3) v = 10.0;
    else if (idx == 4) v = 12.0;
    else if (idx == 5) v = 4.0;
    else if (idx == 6) v = 14.0;
    else if (idx == 7) v = 6.0;
    else if (idx == 8) v = 3.0;
    else if (idx == 9) v = 11.0;
    else if (idx == 10) v = 1.0;
    else if (idx == 11) v = 9.0;
    else if (idx == 12) v = 15.0;
    else if (idx == 13) v = 7.0;
    else if (idx == 14) v = 13.0;
    else if (idx == 15) v = 5.0;
    return v / 16.0 - 0.5;
  }

  vec3 sampleBlur(vec2 uv, float amt) {
    if (amt <= 0.001) return texture2D(u_tex, uv).rgb;
    vec3 c = vec3(0.0);
    float total = 0.0;
    vec2 px = vec2(amt) / u_resolution;
    for (float x = -2.0; x <= 2.0; x += 1.0) {
      for (float y = -2.0; y <= 2.0; y += 1.0) {
        float w = exp(-(x*x + y*y) * 0.4);
        c += texture2D(u_tex, uv + vec2(x, y) * px).rgb * w;
        total += w;
      }
    }
    return c / total;
  }

  void main() {
    vec2 uv = vUv;
    // Pixelation
    if (u_pixel > 1.5) {
      vec2 p = u_resolution / u_pixel;
      uv = floor(uv * p) / p;
    }

    // Chromatic aberration on the color channels
    vec2 center = uv - 0.5;
    float chr = u_chroma * 0.01;
    vec3 col;
    if (u_blur > 0.001) {
      col.r = sampleBlur(uv + center * chr, u_blur).r;
      col.g = sampleBlur(uv, u_blur).g;
      col.b = sampleBlur(uv - center * chr, u_blur).b;
    } else {
      col.r = texture2D(u_tex, uv + center * chr).r;
      col.g = texture2D(u_tex, uv).g;
      col.b = texture2D(u_tex, uv - center * chr).b;
    }

    // Color bleed (horizontal smear)
    if (u_bleed > 0.001) {
      vec2 px = vec2(u_bleed * 0.005, 0.0);
      vec3 b = texture2D(u_tex, uv - px).rgb;
      col = mix(col, mix(col, b, 0.5), u_bleed);
    }

    // HSV operations
    vec3 hsv = rgb2hsv(col);
    hsv.x = fract(hsv.x + u_hue / 360.0);
    hsv.y *= u_sat;
    col = hsv2rgb(hsv);

    // Contrast
    col = (col - 0.5) * u_contrast + 0.5;

    // Warmth: shift toward orange/blue
    if (u_warmth > 0.0) {
      col.r += u_warmth * 0.08;
      col.b -= u_warmth * 0.05;
    } else {
      col.r += u_warmth * 0.05;
      col.b -= u_warmth * 0.08;
    }

    // Posterize (per-channel quantization)
    if (u_posterize < 32.0) {
      col = floor(col * u_posterize) / u_posterize;
    }

    // Dither (Bayer, applied before quantization would be more accurate but approximating)
    if (u_dither > 0.001) {
      float d = bayer(gl_FragCoord.xy) * u_dither * 0.1;
      col += vec3(d);
    }

    // Scanlines
    if (u_scan > 0.001) {
      float line = sin(gl_FragCoord.y * 1.5) * 0.5 + 0.5;
      col *= mix(1.0, line * 0.7 + 0.3, u_scan);
    }

    // Grain
    if (u_grain > 0.001) {
      float g = hash(gl_FragCoord.xy + u_time) - 0.5;
      col += vec3(g * u_grain * 0.25);
    }

    // Vignette
    if (u_vignette > 0.001) {
      float dist = length(uv - 0.5);
      float v = smoothstep(0.4, 0.85, dist);
      col *= 1.0 - v * u_vignette;
    }

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ──────────────────────────────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────────────────────────────
const canvas = document.getElementById('reskinCanvas');
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
if (!gl) { alert('WebGL not supported in this browser.'); }

function compile(src, type) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('shader err:', gl.getShaderInfoLog(sh));
  }
  return sh;
}

const program = gl.createProgram();
gl.attachShader(program, compile(VERTEX_SRC, gl.VERTEX_SHADER));
gl.attachShader(program, compile(FRAG_SRC, gl.FRAGMENT_SHADER));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);

// Quad
const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
const uvs = new Float32Array([0,1, 1,1, 0,0, 1,0]);
const vbuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'a_pos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const ubuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, ubuf);
gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
const aUv = gl.getAttribLocation(program, 'a_uv');
gl.enableVertexAttribArray(aUv);
gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

// Uniform locations
const uniforms = {};
['u_resolution','u_time','u_sat','u_contrast','u_posterize','u_hue','u_warmth',
 'u_chroma','u_vignette','u_blur','u_grain','u_scan','u_pixel','u_bleed','u_dither'].forEach(n => {
  uniforms[n] = gl.getUniformLocation(program, n);
});

// ──────────────────────────────────────────────────────────────────────
// Source media (image or video)
// ──────────────────────────────────────────────────────────────────────
let sourceType = null; // 'image' | 'video'
let sourceEl = null;
let imgEl = document.getElementById('srcImage');
let videoEl = document.getElementById('srcVideo');

const params = {
  sat: 1.2, contrast: 1.15, posterize: 16, hue: 0, warmth: 0.2,
  chroma: 0.25, vignette: 0.5, blur: 0,
  grain: 0.2, scan: 0, pixel: 1, bleed: 0, dither: 0.15,
};

function $(id) { return document.getElementById(id); }
function setStatus(s) { $('reskinStatus').textContent = s; }

// Sliders
function bindRSlider(id, valId, scale, fmt, prop) {
  const el = $(id), valEl = $(valId);
  if (!el) return;
  const update = () => {
    const v = parseFloat(el.value) * scale;
    if (valEl) valEl.textContent = fmt(v);
    params[prop] = v;
  };
  el.addEventListener('input', update);
  update();
}

bindRSlider('rsSat', 'rsSatV', 0.01, v => v.toFixed(2), 'sat');
bindRSlider('rsContrast', 'rsContrastV', 0.01, v => v.toFixed(2), 'contrast');
bindRSlider('rsPosterize', 'rsPosterizeV', 1, v => v.toFixed(0), 'posterize');
bindRSlider('rsHue', 'rsHueV', 1, v => v.toFixed(0) + '°', 'hue');
bindRSlider('rsWarmth', 'rsWarmthV', 0.01, v => v.toFixed(2), 'warmth');
bindRSlider('rsChroma', 'rsChromaV', 0.01, v => v.toFixed(2), 'chroma');
bindRSlider('rsVignette', 'rsVignetteV', 0.01, v => v.toFixed(2), 'vignette');
bindRSlider('rsBlur', 'rsBlurV', 0.01, v => v.toFixed(2), 'blur');
bindRSlider('rsGrain', 'rsGrainV', 0.01, v => v.toFixed(2), 'grain');
bindRSlider('rsScan', 'rsScanV', 0.01, v => v.toFixed(2), 'scan');
bindRSlider('rsPixel', 'rsPixelV', 1, v => v.toFixed(0), 'pixel');
bindRSlider('rsBleed', 'rsBleedV', 0.01, v => v.toFixed(2), 'bleed');
bindRSlider('rsDither', 'rsDitherV', 0.01, v => v.toFixed(2), 'dither');

// Presets
const PRESETS = {
  bryce:   { sat: 1.25, contrast: 1.20, posterize: 14, hue: 0, warmth: 0.25, chroma: 0.20, vignette: 0.45, blur: 0, grain: 0.20, scan: 0, pixel: 1, bleed: 0, dither: 0.15 },
  vhs:     { sat: 1.15, contrast: 1.10, posterize: 24, hue: 0, warmth: 0.15, chroma: 0.55, vignette: 0.35, blur: 0.4, grain: 0.45, scan: 0.55, pixel: 2, bleed: 0.35, dither: 0.25 },
  psx:     { sat: 1.10, contrast: 1.20, posterize: 6, hue: 0, warmth: 0.10, chroma: 0.05, vignette: 0.20, blur: 0, grain: 0.05, scan: 0, pixel: 5, bleed: 0, dither: 0.40 },
  crt:     { sat: 1.20, contrast: 1.30, posterize: 16, hue: 0, warmth: 0.15, chroma: 0.30, vignette: 0.65, blur: 0.3, grain: 0.30, scan: 0.85, pixel: 2, bleed: 0.20, dither: 0.10 },
  sunset:  { sat: 1.55, contrast: 1.10, posterize: 20, hue: 8, warmth: 0.65, chroma: 0.15, vignette: 0.40, blur: 0, grain: 0.10, scan: 0, pixel: 1, bleed: 0, dither: 0.10 },
  alien:   { sat: 1.35, contrast: 1.25, posterize: 10, hue: -45, warmth: -0.30, chroma: 0.40, vignette: 0.55, blur: 0, grain: 0.25, scan: 0.10, pixel: 1, bleed: 0, dither: 0.20 },
  dream:   { sat: 1.30, contrast: 0.95, posterize: 32, hue: 15, warmth: 0.30, chroma: 0.25, vignette: 0.40, blur: 1.2, grain: 0.10, scan: 0, pixel: 1, bleed: 0.15, dither: 0.05 },
  raw:     { sat: 1.0, contrast: 1.0, posterize: 32, hue: 0, warmth: 0, chroma: 0, vignette: 0, blur: 0, grain: 0, scan: 0, pixel: 1, bleed: 0, dither: 0 },
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.assign(params, p);
  // Push to UI
  $('rsSat').value = p.sat * 100; $('rsSatV').textContent = p.sat.toFixed(2);
  $('rsContrast').value = p.contrast * 100; $('rsContrastV').textContent = p.contrast.toFixed(2);
  $('rsPosterize').value = p.posterize; $('rsPosterizeV').textContent = p.posterize;
  $('rsHue').value = p.hue; $('rsHueV').textContent = p.hue + '°';
  $('rsWarmth').value = p.warmth * 100; $('rsWarmthV').textContent = p.warmth.toFixed(2);
  $('rsChroma').value = p.chroma * 100; $('rsChromaV').textContent = p.chroma.toFixed(2);
  $('rsVignette').value = p.vignette * 100; $('rsVignetteV').textContent = p.vignette.toFixed(2);
  $('rsBlur').value = p.blur * 100; $('rsBlurV').textContent = p.blur.toFixed(2);
  $('rsGrain').value = p.grain * 100; $('rsGrainV').textContent = p.grain.toFixed(2);
  $('rsScan').value = p.scan * 100; $('rsScanV').textContent = p.scan.toFixed(2);
  $('rsPixel').value = p.pixel; $('rsPixelV').textContent = p.pixel;
  $('rsBleed').value = p.bleed * 100; $('rsBleedV').textContent = p.bleed.toFixed(2);
  $('rsDither').value = p.dither * 100; $('rsDitherV').textContent = p.dither.toFixed(2);
}

document.querySelectorAll('[data-rpreset]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-rpreset]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyPreset(btn.dataset.rpreset);
  });
});

// ──────────────────────────────────────────────────────────────────────
// File loading
// ──────────────────────────────────────────────────────────────────────
const dropZone = $('dropZone');
const fileInput = $('fileInput');
const empty = $('reskinEmpty');

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) loadFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', e => {
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

$('srcChangeBtn').addEventListener('click', () => fileInput.click());
$('srcClearBtn').addEventListener('click', clearSource);

function clearSource() {
  sourceType = null;
  sourceEl = null;
  imgEl.style.display = 'none';
  videoEl.style.display = 'none';
  imgEl.src = '';
  videoEl.src = '';
  empty.style.display = '';
  $('rsiName').textContent = '—';
  $('rsiSize').textContent = '—';
  $('rsiDims').textContent = '—';
  $('playPauseBtn').disabled = true;
  $('vidScrub').disabled = true;
  $('exportPngBtn').disabled = true;
  $('exportVidBtn').disabled = true;
  $('dlPng').disabled = true;
  $('dlVid').disabled = true;
  setStatus('DROP MEDIA');
}

function loadFile(file) {
  $('rsiName').textContent = file.name;
  $('rsiSize').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';

  const url = URL.createObjectURL(file);
  if (file.type.startsWith('image/')) {
    sourceType = 'image';
    imgEl.onload = () => {
      $('rsiDims').textContent = `${imgEl.naturalWidth}×${imgEl.naturalHeight}`;
      sourceEl = imgEl;
      empty.style.display = 'none';
      imgEl.style.display = '';
      videoEl.style.display = 'none';
      sizeCanvasFor(imgEl.naturalWidth, imgEl.naturalHeight);
      uploadTexture(imgEl);
      setStatus('IMAGE LOADED');
      $('exportPngBtn').disabled = false;
      $('dlPng').disabled = false;
      $('exportVidBtn').disabled = true;
      $('dlVid').disabled = true;
    };
    imgEl.src = url;
  } else if (file.type.startsWith('video/')) {
    sourceType = 'video';
    videoEl.onloadedmetadata = () => {
      $('rsiDims').textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}`;
      sourceEl = videoEl;
      empty.style.display = 'none';
      imgEl.style.display = 'none';
      videoEl.style.display = '';
      sizeCanvasFor(videoEl.videoWidth, videoEl.videoHeight);
      setStatus('VIDEO LOADED');
      $('playPauseBtn').disabled = false;
      $('vidScrub').disabled = false;
      $('exportPngBtn').disabled = false;
      $('dlPng').disabled = false;
      $('exportVidBtn').disabled = false;
      $('dlVid').disabled = false;
      videoEl.play().catch(() => {});
    };
    videoEl.src = url;
  }
}

function sizeCanvasFor(w, h) {
  const maxW = 1920, maxH = 1080;
  const r = Math.min(maxW / w, maxH / h, 1);
  canvas.width = Math.round(w * r);
  canvas.height = Math.round(h * r);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function uploadTexture(src) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  } catch (e) { console.error('tex upload', e); }
}

// ──────────────────────────────────────────────────────────────────────
// Render
// ──────────────────────────────────────────────────────────────────────
function renderFrame() {
  if (!sourceEl) return;
  if (sourceType === 'video' && !videoEl.paused && videoEl.readyState >= 2) {
    uploadTexture(videoEl);
  } else if (sourceType === 'image') {
    // Already uploaded once
  }

  gl.useProgram(program);
  gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
  gl.uniform1f(uniforms.u_time, performance.now() * 0.001);
  gl.uniform1f(uniforms.u_sat, params.sat);
  gl.uniform1f(uniforms.u_contrast, params.contrast);
  gl.uniform1f(uniforms.u_posterize, params.posterize);
  gl.uniform1f(uniforms.u_hue, params.hue);
  gl.uniform1f(uniforms.u_warmth, params.warmth);
  gl.uniform1f(uniforms.u_chroma, params.chroma);
  gl.uniform1f(uniforms.u_vignette, params.vignette);
  gl.uniform1f(uniforms.u_blur, params.blur);
  gl.uniform1f(uniforms.u_grain, params.grain);
  gl.uniform1f(uniforms.u_scan, params.scan);
  gl.uniform1f(uniforms.u_pixel, params.pixel);
  gl.uniform1f(uniforms.u_bleed, params.bleed);
  gl.uniform1f(uniforms.u_dither, params.dither);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function loop() {
  renderFrame();
  // Update video scrub
  if (sourceType === 'video' && !$('vidScrub').dragging) {
    if (videoEl.duration) {
      $('vidScrub').value = (videoEl.currentTime / videoEl.duration) * 1000;
      $('vidTime').textContent = fmtT(videoEl.currentTime) + ' / ' + fmtT(videoEl.duration);
    }
  }
  requestAnimationFrame(loop);
}
function fmtT(s) {
  if (!isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}
requestAnimationFrame(loop);

// Video controls
$('playPauseBtn').addEventListener('click', () => {
  if (videoEl.paused) { videoEl.play(); $('playPauseBtn').textContent = '❙❙'; }
  else { videoEl.pause(); $('playPauseBtn').textContent = '▶'; }
});
$('vidScrub').addEventListener('input', () => {
  if (videoEl.duration) {
    videoEl.currentTime = (parseFloat($('vidScrub').value) / 1000) * videoEl.duration;
  }
});

// Export PNG
function exportPNG() {
  renderFrame(); // ensure latest
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = `wsf_reskin_${stamp}.png`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }, 'image/png');
}
$('exportPngBtn').addEventListener('click', exportPNG);
$('dlPng').addEventListener('click', exportPNG);

// Export video — captureStream from canvas while video plays
async function exportVideo() {
  if (sourceType !== 'video') return;
  const btn = $('dlVid');
  btn.disabled = true;
  $('exportVidBtn').disabled = true;
  $('recProgress').textContent = 'recording...';
  setStatus('RECORDING');

  const stream = canvas.captureStream(30);
  const mimeCandidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  let mime = '';
  for (const m of mimeCandidates) { if (MediaRecorder.isTypeSupported(m)) { mime = m; break; } }
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  videoEl.currentTime = 0;
  await videoEl.play().catch(() => {});
  rec.start(100);

  const onEnd = () => {
    rec.stop();
    videoEl.removeEventListener('ended', onEnd);
  };
  videoEl.addEventListener('ended', onEnd);

  // Progress
  const progTick = setInterval(() => {
    if (videoEl.duration) {
      const p = (videoEl.currentTime / videoEl.duration * 100).toFixed(0);
      $('recProgress').textContent = `recording · ${p}%`;
    }
  }, 200);

  rec.onstop = () => {
    clearInterval(progTick);
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url; a.download = `wsf_reskin_${stamp}.webm`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    btn.disabled = false;
    $('exportVidBtn').disabled = false;
    $('recProgress').textContent = 'saved.';
    setStatus('VIDEO LOADED');
  };
}
$('exportVidBtn').addEventListener('click', exportVideo);
$('dlVid').addEventListener('click', exportVideo);

setStatus('DROP MEDIA');
