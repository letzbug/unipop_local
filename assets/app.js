const cfg = UNIPOP_CONFIG;
let courseIndex = 0;
let lockUntil = 0;

const $ = (id) => document.getElementById(id);

function qrFor(url) {
  return 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=' + encodeURIComponent(url);
}

function renderCourse(course) {
  $('courseImage').src = course.image;
  $('courseTitle').textContent = course.title;
  $('courseSubtitle').textContent = course.subtitle;
  $('courseDate').textContent = course.date;
  $('courseTime').textContent = course.time;
  $('coursePlace').textContent = course.place;
  $('courseTrainer').textContent = course.trainer;
  $('qrImage').src = qrFor(course.url);
  UniPopStore.setCurrentCourse(course);
}

function nextCourse() {
  courseIndex = (courseIndex + 1) % cfg.courses.length;
  renderCourse(cfg.courses[courseIndex]);
}

function updateButton() {
  const left = Math.ceil((lockUntil - Date.now()) / 1000);
  const btn = $('printBtn');
  if (left > 0) {
    btn.disabled = true;
    $('printStatus').textContent = `Merci ! Nouveau tirage possible dans ${left}s.`;
  } else {
    btn.disabled = false;
    if ($('printStatus').textContent.includes('Nouveau tirage')) $('printStatus').textContent = '';
  }
}

function printCurrentCourse() {
  if (Date.now() < lockUntil) return;
  if (UniPopStore.countLastHour() >= cfg.maxPrintsPerHour) {
    $('printStatus').textContent = 'Impression temporairement indisponible. Limite horaire atteinte.';
    return;
  }
  const course = cfg.courses[courseIndex];
  UniPopStore.logPrint(course);
  lockUntil = Date.now() + cfg.printCooldownSeconds * 1000;
  $('printStatus').textContent = 'Votre flyer est en cours d’impression…';
  updateButton();

  const url = 'flyer.html?course=' + encodeURIComponent(course.id) + '&autoprint=1';
  const w = window.open(url, '_blank', 'width=900,height=1100');
  if (!w) $('printStatus').textContent = 'Popup bloquée : autorisez les fenêtres pour tester l’impression.';
}

$('printBtn').addEventListener('click', printCurrentCourse);
document.addEventListener('keydown', e => { if (e.key === 'F9') printCurrentCourse(); });

renderCourse(cfg.courses[0]);
setInterval(nextCourse, cfg.autoRotateSeconds * 1000);
setInterval(() => UniPopStore.setStatus({ currentCourse: cfg.courses[courseIndex].title, currentCourseId: cfg.courses[courseIndex].id }), cfg.heartbeatSeconds * 1000);
setInterval(updateButton, 500);
UniPopStore.setStatus({ currentCourse: cfg.courses[0].title, currentCourseId: cfg.courses[0].id });
