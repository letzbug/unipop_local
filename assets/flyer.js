const params = new URLSearchParams(location.search);
const id = params.get('course');
const course = UNIPOP_CONFIG.courses.find(c => c.id === id) || UniPopStore.getCurrentCourse() || UNIPOP_CONFIG.courses[0];
const $ = id => document.getElementById(id);
const qrFor = url => 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(url);

$('flyerImage').src = course.image;
$('flyerTitle').textContent = course.title;
$('flyerSubtitle').textContent = course.subtitle;
$('flyerQr').src = qrFor(course.url);
$('flyerMeta').innerHTML = `
  <div>📅 ${course.date}</div>
  <div>🕒 ${course.time}</div>
  <div>📍 ${course.place}</div>
  <div>👤 ${course.trainer}</div>`;

if (params.get('autoprint') === '1') {
  window.addEventListener('load', () => setTimeout(() => window.print(), 500));
}
