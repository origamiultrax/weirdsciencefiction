// inspector.js — Properties panel for selected object(s)
export class Inspector {
  constructor(rootEl, transformMgr, history) {
    this.root = rootEl;
    this.transformMgr = transformMgr;
    this.history = history;
    this.current = null;
    this._build();
    this._wire();
  }

  _build() {
    this.root.innerHTML = `
      <div class="prop-header"><span class="prop-title">INSPECTOR</span><span class="prop-led"></span></div>
      <div class="ins-empty" id="insEmpty">
        <div style="text-align:center;padding:20px 12px;color:var(--metal-hi);font-family:var(--font-lcd);font-size:13px;letter-spacing:1px;">
          Click an object<br>to inspect.
        </div>
      </div>
      <div class="ins-active hidden" id="insActive">
        <div class="prop-subgroup">
          <div class="sub-label">SELECTION</div>
          <div class="ins-id" id="insId">—</div>
        </div>
        <div class="prop-subgroup">
          <div class="sub-label">TRANSFORM TOOL</div>
          <div class="button-row">
            <button class="chunky-btn small" data-tmode="translate">⇄ MOVE</button>
            <button class="chunky-btn small" data-tmode="rotate">↻ ROT</button>
            <button class="chunky-btn small" data-tmode="scale">⇲ SCL</button>
          </div>
          <div class="button-row">
            <button class="chunky-btn small" data-tspace="world">WORLD</button>
            <button class="chunky-btn small" data-tspace="local">LOCAL</button>
          </div>
        </div>
        <div class="prop-subgroup" id="insTransform">
          <div class="sub-label">POSITION</div>
          <div class="vec-row">
            <label>X</label><input type="number" step="0.5" id="insPosX">
            <label>Y</label><input type="number" step="0.5" id="insPosY">
            <label>Z</label><input type="number" step="0.5" id="insPosZ">
          </div>
          <div class="sub-label">ROTATION (°)</div>
          <div class="vec-row">
            <label>X</label><input type="number" step="5" id="insRotX">
            <label>Y</label><input type="number" step="5" id="insRotY">
            <label>Z</label><input type="number" step="5" id="insRotZ">
          </div>
          <div class="sub-label">SCALE</div>
          <div class="slider-row"><label>UNI</label><input type="range" id="insScale" min="10" max="500" value="100"><span class="val" id="insScaleV">1.00</span></div>
        </div>
        <div class="prop-subgroup">
          <div class="sub-label">COLOR / SURFACE</div>
          <div class="color-row"><label>COL</label><input type="color" id="insColor" value="#c0c0c0"></div>
          <div class="slider-row"><label>METL</label><input type="range" id="insMetal" min="0" max="100" value="20"><span class="val" id="insMetalV">0.20</span></div>
          <div class="slider-row"><label>ROUG</label><input type="range" id="insRough" min="0" max="100" value="50"><span class="val" id="insRoughV">0.50</span></div>
          <div class="color-row"><label>EMSV</label><input type="color" id="insEmissive" value="#000000"></div>
          <div class="slider-row"><label>EMS.I</label><input type="range" id="insEmissiveI" min="0" max="200" value="0"><span class="val" id="insEmissiveIV">0.00</span></div>
          <label class="check-row"><input type="checkbox" id="insWire"><span>WIREFRAME</span></label>
        </div>
        <div class="prop-subgroup">
          <div class="button-row">
            <button class="chunky-btn small" id="insDup">⎘ DUP</button>
            <button class="chunky-btn small" id="insDel">✕ DEL</button>
          </div>
          <div class="button-row">
            <button class="chunky-btn small" id="insFocus">⊕ FOCUS</button>
            <button class="chunky-btn small" id="insGround">⤓ GROUND</button>
          </div>
        </div>
        <div class="prop-subgroup hidden" id="insMulti">
          <div class="sub-label">MULTI-SELECT</div>
          <div id="insMultiCount" style="font-family:var(--font-lcd);font-size:14px;color:var(--acid-green);letter-spacing:1px;padding:4px 0;">0 OBJECTS</div>
          <div style="font-size:10px;color:var(--metal-hi);letter-spacing:1px;line-height:1.5;">
            Inspector edits apply to first.<br>
            Use gizmo to move all together.
          </div>
        </div>
      </div>
    `;
  }

  _wire() {
    this.empty = this.root.querySelector('#insEmpty');
    this.active = this.root.querySelector('#insActive');

    // Transform mode buttons
    this.root.querySelectorAll('[data-tmode]').forEach(b => {
      b.addEventListener('click', () => {
        this.transformMgr.setMode(b.dataset.tmode);
        this._refreshModeButtons();
      });
    });
    this.root.querySelectorAll('[data-tspace]').forEach(b => {
      b.addEventListener('click', () => {
        this.transformMgr.setSpace(b.dataset.tspace);
        this._refreshSpaceButtons();
      });
    });

    // Position/Rotation inputs — commit on change (with undo)
    ['insPosX', 'insPosY', 'insPosZ'].forEach((id, axis) => {
      const el = this.root.querySelector('#' + id);
      el.addEventListener('change', () => this._commitPos(axis, parseFloat(el.value)));
    });
    ['insRotX', 'insRotY', 'insRotZ'].forEach((id, axis) => {
      const el = this.root.querySelector('#' + id);
      el.addEventListener('change', () => this._commitRot(axis, parseFloat(el.value)));
    });

    const scaleEl = this.root.querySelector('#insScale');
    scaleEl.addEventListener('input', () => {
      const v = parseFloat(scaleEl.value) / 100;
      this.root.querySelector('#insScaleV').textContent = v.toFixed(2);
      if (this.current) this.current.scale.setScalar(v);
    });
    scaleEl.addEventListener('change', () => {
      const v = parseFloat(scaleEl.value) / 100;
      this._commitScale(v);
    });

    // Color
    this.root.querySelector('#insColor').addEventListener('input', e => {
      if (this.current && this.current.material) this.current.material.color.set(e.target.value);
    });
    this.root.querySelector('#insColor').addEventListener('change', e => {
      this._commitColorChange('color', e.target.value);
    });

    const metalEl = this.root.querySelector('#insMetal');
    metalEl.addEventListener('input', () => {
      const v = parseFloat(metalEl.value) / 100;
      this.root.querySelector('#insMetalV').textContent = v.toFixed(2);
      if (this.current && this.current.material) this.current.material.metalness = v;
    });

    const roughEl = this.root.querySelector('#insRough');
    roughEl.addEventListener('input', () => {
      const v = parseFloat(roughEl.value) / 100;
      this.root.querySelector('#insRoughV').textContent = v.toFixed(2);
      if (this.current && this.current.material) this.current.material.roughness = v;
    });

    this.root.querySelector('#insEmissive').addEventListener('input', e => {
      if (this.current && this.current.material && this.current.material.emissive) {
        this.current.material.emissive.set(e.target.value);
      }
    });

    const emiEl = this.root.querySelector('#insEmissiveI');
    emiEl.addEventListener('input', () => {
      const v = parseFloat(emiEl.value) / 100;
      this.root.querySelector('#insEmissiveIV').textContent = v.toFixed(2);
      if (this.current && this.current.material) this.current.material.emissiveIntensity = v;
    });

    this.root.querySelector('#insWire').addEventListener('change', e => {
      if (this.current && this.current.material) this.current.material.wireframe = e.target.checked;
    });

    // Action buttons
    this.root.querySelector('#insDup').addEventListener('click', () => this._fire('duplicate'));
    this.root.querySelector('#insDel').addEventListener('click', () => this._fire('delete'));
    this.root.querySelector('#insFocus').addEventListener('click', () => this._fire('focus'));
    this.root.querySelector('#insGround').addEventListener('click', () => this._fire('ground'));
  }

  on(event, fn) {
    this._handlers = this._handlers || {};
    this._handlers[event] = fn;
  }
  _fire(event) {
    if (this._handlers && this._handlers[event]) this._handlers[event]();
  }

  setSelection(meshes) {
    if (!meshes || meshes.length === 0) {
      this.current = null;
      this.empty.classList.remove('hidden');
      this.active.classList.add('hidden');
      return;
    }
    this.current = meshes[0];
    this.empty.classList.add('hidden');
    this.active.classList.remove('hidden');
    this.refresh();
    const multi = this.root.querySelector('#insMulti');
    if (meshes.length > 1) {
      multi.classList.remove('hidden');
      this.root.querySelector('#insMultiCount').textContent = meshes.length + ' OBJECTS';
    } else {
      multi.classList.add('hidden');
    }
    this._refreshModeButtons();
    this._refreshSpaceButtons();
  }

  refresh() {
    if (!this.current) return;
    const m = this.current;
    this.root.querySelector('#insId').textContent = (m.userData.type || 'OBJECT').toUpperCase();
    this.root.querySelector('#insPosX').value = m.position.x.toFixed(2);
    this.root.querySelector('#insPosY').value = m.position.y.toFixed(2);
    this.root.querySelector('#insPosZ').value = m.position.z.toFixed(2);
    this.root.querySelector('#insRotX').value = (m.rotation.x * 180 / Math.PI).toFixed(0);
    this.root.querySelector('#insRotY').value = (m.rotation.y * 180 / Math.PI).toFixed(0);
    this.root.querySelector('#insRotZ').value = (m.rotation.z * 180 / Math.PI).toFixed(0);
    const sc = m.scale.x;
    this.root.querySelector('#insScale').value = Math.max(10, Math.min(500, sc * 100));
    this.root.querySelector('#insScaleV').textContent = sc.toFixed(2);
    if (m.material) {
      this.root.querySelector('#insColor').value = '#' + m.material.color.getHexString();
      this.root.querySelector('#insMetal').value = (m.material.metalness || 0) * 100;
      this.root.querySelector('#insMetalV').textContent = (m.material.metalness || 0).toFixed(2);
      this.root.querySelector('#insRough').value = (m.material.roughness || 0) * 100;
      this.root.querySelector('#insRoughV').textContent = (m.material.roughness || 0).toFixed(2);
      if (m.material.emissive) {
        this.root.querySelector('#insEmissive').value = '#' + m.material.emissive.getHexString();
      }
      this.root.querySelector('#insEmissiveI').value = (m.material.emissiveIntensity || 0) * 100;
      this.root.querySelector('#insEmissiveIV').textContent = (m.material.emissiveIntensity || 0).toFixed(2);
      this.root.querySelector('#insWire').checked = !!m.material.wireframe;
    }
  }

  _refreshModeButtons() {
    const mode = this.transformMgr.getMode();
    this.root.querySelectorAll('[data-tmode]').forEach(b => {
      b.classList.toggle('active', b.dataset.tmode === mode);
    });
  }

  _refreshSpaceButtons() {
    const space = this.transformMgr.gizmo.space;
    this.root.querySelectorAll('[data-tspace]').forEach(b => {
      b.classList.toggle('active', b.dataset.tspace === space);
    });
  }

  _commitPos(axis, val) {
    if (!this.current || isNaN(val)) return;
    const before = this.transformMgr.captureTransform(this.current);
    if (axis === 0) this.current.position.x = val;
    if (axis === 1) this.current.position.y = val;
    if (axis === 2) this.current.position.z = val;
    const after = this.transformMgr.captureTransform(this.current);
    this._pushTransformAction(before, after);
  }

  _commitRot(axis, valDeg) {
    if (!this.current || isNaN(valDeg)) return;
    const before = this.transformMgr.captureTransform(this.current);
    const r = valDeg * Math.PI / 180;
    if (axis === 0) this.current.rotation.x = r;
    if (axis === 1) this.current.rotation.y = r;
    if (axis === 2) this.current.rotation.z = r;
    const after = this.transformMgr.captureTransform(this.current);
    this._pushTransformAction(before, after);
  }

  _commitScale(val) {
    if (!this.current) return;
    const before = this.transformMgr.captureTransform(this.current);
    this.current.scale.setScalar(val);
    const after = this.transformMgr.captureTransform(this.current);
    this._pushTransformAction(before, after);
  }

  _pushTransformAction(before, after) {
    if (!this.history) return;
    this.history.push({
      label: 'transform',
      undo: () => this.transformMgr.applyTransform(before),
      redo: () => this.transformMgr.applyTransform(after),
    });
  }

  _commitColorChange(key, hex) {
    if (!this.current || !this.current.material) return;
    const beforeHex = '#' + this.current.material.color.getHexString();
    if (this.history) {
      this.history.push({
        label: 'color',
        undo: () => { this.current && this.current.material.color.set(beforeHex); },
        redo: () => { this.current && this.current.material.color.set(hex); },
      });
    }
  }
}
