window.UniPopStore = (() => {
  const EVENTS = 'unipop_print_events_v1';
  const STATUS = 'unipop_display_status_v1';
  const CURRENT = 'unipop_current_course_v1';

  const getEvents = () => JSON.parse(localStorage.getItem(EVENTS) || '[]');
  const saveEvents = (events) => localStorage.setItem(EVENTS, JSON.stringify(events));

  function logPrint(course) {
    const events = getEvents();
    events.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      type: 'print',
      displayId: UNIPOP_CONFIG.displayId,
      courseId: course.id,
      courseTitle: course.title,
      timestamp: new Date().toISOString()
    });
    saveEvents(events);
  }

  function setStatus(extra = {}) {
    const payload = {
      displayId: UNIPOP_CONFIG.displayId,
      displayName: UNIPOP_CONFIG.displayName,
      lastSeen: new Date().toISOString(),
      online: true,
      ...extra
    };
    localStorage.setItem(STATUS, JSON.stringify(payload));
    return payload;
  }

  function getStatus() {
    return JSON.parse(localStorage.getItem(STATUS) || 'null');
  }

  function setCurrentCourse(course) {
    localStorage.setItem(CURRENT, JSON.stringify(course));
    setStatus({ currentCourse: course.title, currentCourseId: course.id });
  }

  function getCurrentCourse() {
    return JSON.parse(localStorage.getItem(CURRENT) || 'null');
  }

  function startOfToday() {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  }

  function startOfWeek() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d;
  }

  function startOfYear() {
    const d = new Date(); return new Date(d.getFullYear(),0,1);
  }

  function countSince(date, courseId = null) {
    return getEvents().filter(e => e.type === 'print' && new Date(e.timestamp) >= date && (!courseId || e.courseId === courseId)).length;
  }

  function countLastHour() {
    return countSince(new Date(Date.now() - 60 * 60 * 1000));
  }

  function statsByCourse() {
    const events = getEvents();
    const ids = [...new Set(events.map(e => e.courseId))];
    return ids.map(id => {
      const title = events.find(e => e.courseId === id)?.courseTitle || id;
      return {
        id, title,
        today: countSince(startOfToday(), id),
        week: countSince(startOfWeek(), id),
        year: countSince(startOfYear(), id),
        total: events.filter(e => e.courseId === id).length
      };
    }).sort((a,b) => b.total - a.total);
  }

  function reset() {
    localStorage.removeItem(EVENTS);
    localStorage.removeItem(STATUS);
    localStorage.removeItem(CURRENT);
  }

  return { getEvents, logPrint, setStatus, getStatus, setCurrentCourse, getCurrentCourse, countSince, countLastHour, statsByCourse, startOfToday, startOfWeek, startOfYear, reset };
})();
