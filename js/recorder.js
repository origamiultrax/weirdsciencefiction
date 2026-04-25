// recorder.js — Video, single-frame PNG, and PNG sequence export
export class VideoRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
    this.startTime = 0;
    this.mimeType = this._pickMime();
  }

  _pickMime() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  start(fps = 30, bitrate = 8_000_000) {
    if (this.recording) return;
    const stream = this.canvas.captureStream(fps);
    const opts = { mimeType: this.mimeType, videoBitsPerSecond: bitrate };
    try { this.recorder = new MediaRecorder(stream, opts); }
    catch (e) { this.recorder = new MediaRecorder(stream); }
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100);
    this.recording = true;
    this.startTime = performance.now();
  }

  elapsed() { return this.recording ? (performance.now() - this.startTime) / 1000 : 0; }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder || !this.recording) { resolve(null); return; }
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });
        const ext = this.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const name = `wsf_${stamp}.${ext}`;
        this._download(blob, name);
        this.recording = false;
        resolve({ blob, name });
      };
      this.recorder.stop();
    });
  }

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // Single PNG frame
  exportPNG(filename = null) {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const name = filename || `wsf_${stamp}.png`;
        this._download(blob, name);
        resolve({ blob, name });
      }, 'image/png');
    });
  }

  // PNG sequence — orbit camera and capture each frame as numbered PNG
  async exportPNGSequence(scene, opts = {}) {
    const {
      duration = 6, fps = 24, tilt = 15, onProgress = null,
    } = opts;
    if (this.recording) await this.stop();

    const cam = scene.camera;
    const ctrl = scene.controls;
    const target = ctrl.target.clone();
    const startPos = cam.position.clone();
    const radius = startPos.distanceTo(target);
    const startAng = Math.atan2(startPos.x - target.x, startPos.z - target.z);
    const tiltRad = tilt * Math.PI / 180;
    const yOffset = Math.tan(tiltRad) * radius * 0.5 + radius * 0.4;

    const totalFrames = Math.round(duration * fps);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    for (let i = 0; i < totalFrames; i++) {
      const p = i / totalFrames;
      const ang = startAng + p * Math.PI * 2;
      cam.position.x = target.x + Math.sin(ang) * radius;
      cam.position.z = target.z + Math.cos(ang) * radius;
      cam.position.y = target.y + yOffset;
      cam.lookAt(target);
      ctrl.update();
      scene.render(0);

      await new Promise(res => {
        this.canvas.toBlob((blob) => {
          const name = `wsf_seq_${stamp}_${String(i).padStart(4, '0')}.png`;
          this._download(blob, name);
          res();
        }, 'image/png');
      });

      if (onProgress) onProgress((i + 1) / totalFrames);
      await new Promise(res => setTimeout(res, 60));
    }

    cam.position.copy(startPos);
    ctrl.update();
  }

  async turntable(scene, opts = {}) {
    const {
      duration = 10, fps = 30, tilt = 15, onProgress = null,
    } = opts;
    if (this.recording) await this.stop();
    const cam = scene.camera;
    const ctrl = scene.controls;
    const target = ctrl.target.clone();
    const startPos = cam.position.clone();
    const radius = startPos.distanceTo(target);
    const startAng = Math.atan2(startPos.x - target.x, startPos.z - target.z);
    const tiltRad = tilt * Math.PI / 180;
    const yOffset = Math.tan(tiltRad) * radius * 0.5 + radius * 0.4;

    this.start(fps);
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        const p = Math.min(1, t / duration);
        const ang = startAng + p * Math.PI * 2;
        cam.position.x = target.x + Math.sin(ang) * radius;
        cam.position.z = target.z + Math.cos(ang) * radius;
        cam.position.y = target.y + yOffset;
        cam.lookAt(target);
        ctrl.update();
        if (onProgress) onProgress(p);
        if (p < 1) {
          requestAnimationFrame(tick);
        } else {
          cam.position.copy(startPos);
          ctrl.update();
          this.stop().then(resolve);
        }
      };
      requestAnimationFrame(tick);
    });
  }
}
