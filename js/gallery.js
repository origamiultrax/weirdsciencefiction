// gallery.js — Past simulations gallery
import { storage, session } from './storage.js';

function $(id) { return document.getElementById(id); }
function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString();
}

let allRecords = [];
let sortKey = 'updated';
let searchTerm = '';

async function refresh() {
  allRecords = await storage.list();
  $('countVal').textContent = allRecords.length;
  render();
}

function render() {
  const grid = $('galleryGrid');
  const empty = $('galleryEmpty');
  let recs = allRecords.slice();

  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    recs = recs.filter(r => (r.name || '').toLowerCase().includes(q));
  }

  if (sortKey === 'name') {
    recs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortKey === 'created') {
    recs.sort((a, b) => (b.created || 0) - (a.created || 0));
  } else {
    recs.sort((a, b) => (b.updated || 0) - (a.updated || 0));
  }

  if (recs.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  grid.classList.remove('hidden');
  empty.classList.add('hidden');
  grid.innerHTML = '';
  recs.forEach(r => grid.appendChild(buildCard(r)));
}

function buildCard(rec) {
  const card = document.createElement('div');
  card.className = 'gal-card';
  const thumbStyle = rec.thumbnail ? `background-image:url("${rec.thumbnail}");` : '';
  card.innerHTML = `
    <div class="gal-thumb" style="${thumbStyle}">
      ${rec.thumbnail ? '' : '<div class="gal-thumb-placeholder">◯</div>'}
      <div class="gal-thumb-corner tl"></div>
      <div class="gal-thumb-corner tr"></div>
      <div class="gal-thumb-corner bl"></div>
      <div class="gal-thumb-corner br"></div>
    </div>
    <div class="gal-meta">
      <div class="gal-name" title="${rec.name}">${rec.name || 'untitled'}</div>
      <div class="gal-stamps">
        <span class="gal-stamp">UPD ${fmtDate(rec.updated)}</span>
      </div>
    </div>
    <div class="gal-actions">
      <button class="gal-btn primary" data-act="open">⌖ OPEN</button>
      <button class="gal-btn" data-act="download">⬇ JSON</button>
      <button class="gal-btn" data-act="rename">✎</button>
      <button class="gal-btn danger" data-act="delete">✕</button>
    </div>
  `;
  card.querySelector('[data-act="open"]').addEventListener('click', () => {
    session.setPendingLoad(rec.id);
    window.location.href = 'editor.html';
  });
  card.querySelector('[data-act="download"]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(rec.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(rec.name || 'untitled').replace(/[^a-z0-9_-]/gi, '_')}.wsf.json`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  });
  card.querySelector('[data-act="rename"]').addEventListener('click', async () => {
    const newName = prompt('Rename simulation:', rec.name || '');
    if (newName && newName !== rec.name) {
      rec.name = newName.trim();
      rec.updated = Date.now();
      await storage.save(rec);
      refresh();
    }
  });
  card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
    if (!confirm(`Delete "${rec.name}"? This can't be undone.`)) return;
    await storage.delete(rec.id);
    refresh();
  });
  // Double-click thumb to open
  card.querySelector('.gal-thumb').addEventListener('dblclick', () => {
    session.setPendingLoad(rec.id);
    window.location.href = 'editor.html';
  });
  return card;
}

// Search + sort
$('searchInput').addEventListener('input', e => { searchTerm = e.target.value; render(); });
$('sortSelect').addEventListener('change', e => { sortKey = e.target.value; render(); });

// Import
$('importBtn').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const name = file.name.replace(/\.wsf\.json$|\.json$/i, '') || 'imported';
    // Generate a basic record
    const now = Date.now();
    const rec = {
      id: `wsf_${now}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      created: now,
      updated: now,
      thumbnail: null,
      data,
    };
    await storage.save(rec);
    refresh();
  } catch (err) {
    alert('Failed to import: ' + err.message);
  }
});

// Clear all
$('clearAllBtn').addEventListener('click', () => {
  if (allRecords.length === 0) return;
  $('confirmCount').textContent = allRecords.length;
  $('confirmModal').classList.remove('hidden');
});
$('confirmCancel').addEventListener('click', () => $('confirmModal').classList.add('hidden'));
$('confirmYes').addEventListener('click', async () => {
  await storage.clear();
  $('confirmModal').classList.add('hidden');
  refresh();
});

refresh();
