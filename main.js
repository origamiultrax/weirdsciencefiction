import { App } from './src/app.js';

const app = new App({
  viewportEl: document.getElementById('viewport'),
  statusEl: document.getElementById('statusText'),
});

window.__WSF__ = app; // handy for debugging in console
app.init();
