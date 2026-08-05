const cfg = UNIPOP_CONFIG;
const $ = id => document.getElementById(id);

function render() {
  const status = UniPopStore.getStatus();
  const now = Date.now();
  const last = status?.lastSeen ? new Date(status.lastSeen) : null;
  const isOnline = last && (now - last.getTime()) < Math.max(120000, cfg.heartbeatSeconds * 3000);

  $('onlineStatus').textContent = isOnline ? '🟢 ONLINE' : '🔴 OFFLINE';
  $('lastSeen').textContent = last ? 'Dernier contact : ' + last.toLocaleString('fr-LU') : 'Aucun contact';
  $('todayCount').textContent = UniPopStore.countSince(UniPopStore.startOfToday());
  $('weekCount').textContent = UniPopStore.countSince(UniPopStore.startOfWeek());
  $('yearCount').textContent = UniPopStore.countSince(UniPopStore.startOfYear());
  $('cooldownText').textContent = cfg.printCooldownSeconds + ' secondes';
  $('hourLimitText').textContent = cfg.maxPrintsPerHour + ' impressions / heure';
  $('displayIdText').textContent = cfg.displayId;
  $('currentCourseText').textContent = status?.currentCourse || '—';

  const tbody = $('courseStats');
  const stats = UniPopStore.statsByCourse();
  tbody.innerHTML = stats.length ? stats.map(s => `<tr><td>${escapeHtml(s.title)}</td><td>${s.today}</td><td>${s.week}</td><td>${s.year}</td><td>${s.total}</td></tr>`).join('') : '<tr><td colspan="5">Aucune impression enregistrée.</td></tr>';
}

function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('refreshBtn').addEventListener('click', render);
$('resetBtn').addEventListener('click', () => { if (confirm('Réinitialiser toutes les données de démonstration ?')) { UniPopStore.reset(); render(); }});
render();
setInterval(render, 10000);
