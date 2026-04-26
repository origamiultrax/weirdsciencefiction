// portal.js — Landing page interactions
import { storage } from './storage.js';

function $(id) { return document.getElementById(id); }

// Live clock
function updateClock() {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  $('rdUtc').textContent = `${hh}:${mm}:${ss}`;
  // Mission day = days since site epoch
  const epoch = new Date('1996-01-01').getTime();
  const days = Math.floor((now.getTime() - epoch) / 86400000);
  $('rdSol').textContent = `DAY ${days.toLocaleString()}`;
}
updateClock();
setInterval(updateClock, 1000);

// Saved scene count
(async () => {
  try {
    const count = await storage.count();
    $('rdSaved').textContent = `${count} SIM${count === 1 ? '' : 'S'}`;
    $('leafPastSub').textContent = count === 0
      ? 'No saved worlds yet'
      : `${count} world${count === 1 ? '' : 's'} archived`;
  } catch (e) {
    console.error('storage init failed', e);
  }
})();

// Hover sound effect (optional — silent now, hook for future)
document.querySelectorAll('.leaf-door').forEach(el => {
  el.addEventListener('mouseenter', () => {
    el.classList.add('leaf-hover');
  });
  el.addEventListener('mouseleave', () => {
    el.classList.remove('leaf-hover');
  });
});

// Try to use Geolocation for the lat/lon readouts (graceful fail)
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      $('rdLat').textContent = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
      $('rdLon').textContent = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
    },
    () => { /* keep defaults */ },
    { timeout: 3000 }
  );
}
