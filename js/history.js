// history.js — undo/redo stack
export class History {
  constructor(maxDepth = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxDepth = maxDepth;
    this.onChange = null;
  }

  push(action) {
    // action: { undo: fn, redo: fn, label: string }
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack.length = 0;
    if (this.onChange) this.onChange(this);
  }

  undo() {
    const a = this.undoStack.pop();
    if (!a) return null;
    try { a.undo(); } catch (e) { console.error('undo failed', e); }
    this.redoStack.push(a);
    if (this.onChange) this.onChange(this);
    return a;
  }

  redo() {
    const a = this.redoStack.pop();
    if (!a) return null;
    try { a.redo(); } catch (e) { console.error('redo failed', e); }
    this.undoStack.push(a);
    if (this.onChange) this.onChange(this);
    return a;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    if (this.onChange) this.onChange(this);
  }
}
