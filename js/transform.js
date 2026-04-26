// transform.js — Selection, transform gizmo, outline, multi-select
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class TransformManager {
  constructor(scene, camera, renderer, orbitControls, canvas) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.orbitControls = orbitControls;
    this.canvas = canvas;

    this.selected = []; // array of meshes (multi-select)
    this.outlineMeshes = new Map(); // mesh -> outline mesh

    this.gizmo = new TransformControls(camera, renderer.domElement);
    // For multi-select we attach to a "pivot" group
    this.pivot = new THREE.Group();
    scene.add(this.pivot);
    this.scene.add(this.gizmo);
    this.gizmo.visible = false;

    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbitControls.enabled = !e.value;
      if (e.value) {
        // Drag started — record start state for undo
        this._dragStart = this._captureGroupState();
      } else {
        // Drag ended — push to history
        const end = this._captureGroupState();
        if (this._onTransformEnd) this._onTransformEnd(this._dragStart, end);
      }
    });

    this.gizmo.addEventListener('change', () => {
      if (this._onTransformChange) this._onTransformChange();
    });

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._onTransformChange = null;
    this._onTransformEnd = null;
    this._onSelectionChange = null;

    this._initKeyboardShortcuts();
    this._initClickSelection();
  }

  _initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if typing in an input
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.target.isContentEditable) return;

      // Cmd/Ctrl + Z = undo, Shift+Cmd+Z or Ctrl+Y = redo (handled by app.js via this.onShortcut)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this._fire('redo');
        else this._fire('undo');
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault(); this._fire('redo'); return;
      }
      // Cmd/Ctrl + D = duplicate
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault(); this._fire('duplicate'); return;
      }
      // Cmd/Ctrl + A = select all
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault(); this._fire('selectAll'); return;
      }

      switch (e.key.toLowerCase()) {
        case 'w': this.setMode('translate'); break;
        case 'e': this.setMode('rotate'); break;
        case 'r': this.setMode('scale'); break;
        case 'f': this._fire('focusSelection'); break;
        case 'delete':
        case 'backspace':
          if (this.selected.length > 0) { e.preventDefault(); this._fire('deleteSelection'); }
          break;
        case 'escape':
          this.deselect(); break;
      }
    });
  }

  _initClickSelection() {
    let downX = 0, downY = 0, isDown = false;
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      isDown = true; downX = e.clientX; downY = e.clientY;
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!isDown) return;
      isDown = false;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (Math.sqrt(dx * dx + dy * dy) > 4) return; // it was a drag
      // Don't try to select if gizmo is being interacted with
      if (this.gizmo.dragging) return;
      this._tryPick(e);
    });
  }

  _tryPick(e) {
    if (!this._pickList) return;
    const rect = this.canvas.getBoundingClientRect();
    this._ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this._pickList, false);
    if (hits.length > 0) {
      const mesh = hits[0].object;
      if (e.shiftKey) {
        this.toggleSelect(mesh);
      } else {
        this.select([mesh]);
      }
    } else if (!e.shiftKey) {
      this.deselect();
    }
  }

  setPickList(list) { this._pickList = list; }

  on(event, fn) {
    if (event === 'transformChange') this._onTransformChange = fn;
    else if (event === 'transformEnd') this._onTransformEnd = fn;
    else if (event === 'selectionChange') this._onSelectionChange = fn;
    else this._listeners = this._listeners || {};
    if (!['transformChange', 'transformEnd', 'selectionChange'].includes(event)) {
      this._listeners[event] = fn;
    }
  }

  _fire(event, ...args) {
    if (this._listeners && this._listeners[event]) this._listeners[event](...args);
  }

  setMode(mode) { this.gizmo.setMode(mode); }
  getMode() { return this.gizmo.mode; }
  setSpace(space) { this.gizmo.setSpace(space); } // 'world' | 'local'

  select(meshes) {
    this.deselect();
    if (!meshes || meshes.length === 0) return;
    this.selected = meshes.slice();
    this._addOutlines();
    this._attachGizmo();
    if (this._onSelectionChange) this._onSelectionChange(this.selected);
  }

  toggleSelect(mesh) {
    const idx = this.selected.indexOf(mesh);
    if (idx >= 0) {
      this.selected.splice(idx, 1);
      this._removeOutline(mesh);
    } else {
      this.selected.push(mesh);
      this._addOutline(mesh);
    }
    this._attachGizmo();
    if (this._onSelectionChange) this._onSelectionChange(this.selected);
  }

  deselect() {
    this._removeOutlines();
    this.selected = [];
    this.gizmo.detach();
    this.gizmo.visible = false;
    if (this._onSelectionChange) this._onSelectionChange(this.selected);
  }

  _attachGizmo() {
    if (this.selected.length === 0) {
      this.gizmo.detach();
      this.gizmo.visible = false;
      return;
    }
    if (this.selected.length === 1) {
      this.gizmo.attach(this.selected[0]);
    } else {
      // Multi-select: position pivot at centroid, attach gizmo to pivot
      // We track relative offsets so dragging the pivot moves all selected
      const c = new THREE.Vector3();
      this.selected.forEach(m => c.add(m.position));
      c.divideScalar(this.selected.length);
      this.pivot.position.copy(c);
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.scale.set(1, 1, 1);
      // Store offsets
      this._multiOffsets = this.selected.map(m => ({
        mesh: m,
        posOffset: m.position.clone().sub(c),
        baseQuat: m.quaternion.clone(),
        baseScale: m.scale.clone(),
      }));
      this.gizmo.attach(this.pivot);
    }
    this.gizmo.visible = true;
  }

  // Called from app.js render loop to sync multi-select children to pivot
  syncMultiSelect() {
    if (this.selected.length <= 1 || !this._multiOffsets) return;
    const pivotPos = this.pivot.position;
    const pivotQuat = this.pivot.quaternion;
    const pivotScale = this.pivot.scale;
    this._multiOffsets.forEach(({ mesh, posOffset, baseQuat, baseScale }) => {
      // Apply pivot's rotation and scale to the offset
      const rotatedOffset = posOffset.clone().applyQuaternion(pivotQuat).multiply(pivotScale);
      mesh.position.copy(pivotPos).add(rotatedOffset);
      mesh.quaternion.copy(pivotQuat).multiply(baseQuat);
      mesh.scale.copy(baseScale).multiply(pivotScale);
    });
  }

  _addOutlines() {
    this.selected.forEach(m => this._addOutline(m));
  }

  _addOutline(mesh) {
    if (this.outlineMeshes.has(mesh)) return;
    // Create an outline by cloning the geometry slightly enlarged with backside material
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x7dff42,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.copy(mesh.scale).multiplyScalar(1.05);
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.renderOrder = -1;
    outline.userData.isOutline = true;
    mesh.parent.add(outline);
    this.outlineMeshes.set(mesh, outline);
  }

  _removeOutline(mesh) {
    const o = this.outlineMeshes.get(mesh);
    if (o) {
      if (o.parent) o.parent.remove(o);
      o.material.dispose();
      this.outlineMeshes.delete(mesh);
    }
  }

  _removeOutlines() {
    this.outlineMeshes.forEach((o) => {
      if (o.parent) o.parent.remove(o);
      o.material.dispose();
    });
    this.outlineMeshes.clear();
  }

  // Called every frame to keep outlines synced with mesh transforms
  syncOutlines() {
    this.outlineMeshes.forEach((outline, mesh) => {
      outline.position.copy(mesh.position);
      outline.rotation.copy(mesh.rotation);
      outline.scale.copy(mesh.scale).multiplyScalar(1.05);
    });
  }

  _captureGroupState() {
    return this.selected.map(m => ({
      mesh: m,
      pos: m.position.clone(),
      rot: m.rotation.clone(),
      scl: m.scale.clone(),
    }));
  }

  // Public: capture a single mesh's transform (for inspector edits)
  captureTransform(mesh) {
    return {
      mesh,
      pos: mesh.position.clone(),
      rot: mesh.rotation.clone(),
      scl: mesh.scale.clone(),
    };
  }

  applyTransform(state) {
    if (!state.mesh) return;
    state.mesh.position.copy(state.pos);
    state.mesh.rotation.copy(state.rot);
    state.mesh.scale.copy(state.scl);
  }

  applyGroupState(states) {
    states.forEach(s => this.applyTransform(s));
  }

  dispose() {
    this._removeOutlines();
    this.gizmo.detach();
    if (this.gizmo.parent) this.gizmo.parent.remove(this.gizmo);
    if (this.pivot.parent) this.pivot.parent.remove(this.pivot);
  }
}
