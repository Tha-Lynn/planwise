(() => {
  'use strict';
  const {
    toISO, fromISO, addDays, todayISO, daysBetween, startOfWeek, monthStart, timeToMin, minToTime,
    isISODate, isTime, fmtClock, fmtTime, fmtDuration, fmtDate, parseQuickAdd, DOW, MON, MONTH_LONG,
  } = window.PW;

  // ---------- constants ----------
  const STORAGE_KEY = 'planwise.v1';
  const HOUR_PX = 48;        // time-block grid: pixels per hour
  const SNAP = 15;           // minutes
  const DAY_MIN = 1440;
  const DEFAULT_BLOCK = 30;  // minutes, for tasks without a duration
  const LAYOUTS = ['list', 'calendar', 'timeblock', 'table'];
  const PALETTE = ['#e05d44', '#f29e4c', '#d4a72c', '#57a773', '#2a9d8f', '#4a90d9', '#7b6cd9', '#c06c84', '#8d99ae'];
  const PRIORITY_COLORS = { 1: '#e03e3e', 2: '#e8890c', 3: '#3b7ddd', 4: '#a0a4ab' };
  const SCOPES = [
    { id: 'inbox', label: 'Inbox', icon: '📥' },
    { id: 'today', label: 'Today', icon: '☀️' },
    { id: 'upcoming', label: 'Upcoming', icon: '📅' },
    { id: 'deadlines', label: 'Deadlines', icon: '⚑' },
    { id: 'all', label: 'All tasks', icon: '☰' },
  ];

  // ---------- small utils ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snap = (m) => Math.round(m / SNAP) * SNAP;
  const snapFloor = (m) => Math.floor(m / SNAP) * SNAP;
  const groupBy = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const validColor = (c) => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : PALETTE[8]);
  const parseLabels = (s) => [...new Set(String(s).split(',').map((x) => x.trim().replace(/^@/, '')).filter(Boolean))];
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // ---------- state ----------
  function normTask(t, projectIds) {
    const due = isISODate(t.due) ? t.due : null;
    const dur = Math.round(Number(t.duration));
    return {
      id: String(t.id || uid()),
      title: String(t.title || 'Untitled').slice(0, 300),
      notes: String(t.notes || ''),
      project: projectIds.has(t.project) ? t.project : 'inbox',
      priority: [1, 2, 3, 4].includes(Number(t.priority)) ? Number(t.priority) : 4,
      labels: Array.isArray(t.labels) ? t.labels.map(String).filter(Boolean) : [],
      due,
      time: due && isTime(t.time) ? t.time : null,
      duration: dur > 0 ? Math.min(dur, DAY_MIN) : null,
      deadline: isISODate(t.deadline) ? t.deadline : null,
      done: !!t.done,
      createdAt: Number(t.createdAt) || Date.now(),
    };
  }

  function normalize(s) {
    const projects = [{ id: 'inbox', name: 'Inbox', color: '#8d99ae' }];
    for (const p of Array.isArray(s.projects) ? s.projects : []) {
      if (!p || p.id === 'inbox') continue;
      projects.push({ id: String(p.id || uid()), name: String(p.name || 'Untitled').slice(0, 60), color: validColor(p.color) });
    }
    const ids = new Set(projects.map((p) => p.id));
    const tasks = (Array.isArray(s.tasks) ? s.tasks : []).map((t) => normTask(t || {}, ids));
    const st = s.settings || {};
    const scopeOk = SCOPES.some((x) => x.id === st.scope) || (typeof st.scope === 'string' && st.scope.startsWith('project:') && ids.has(st.scope.slice(8)));
    return {
      projects,
      tasks,
      settings: { layout: LAYOUTS.includes(st.layout) ? st.layout : 'list', scope: scopeOk ? st.scope : 'today', showDone: !!st.showDone },
    };
  }

  function seed() {
    const now = new Date();
    const d = (n) => toISO(addDays(now, n));
    const raw = {
      projects: [
        { id: 'p-work', name: 'Work', color: '#4a90d9' },
        { id: 'p-home', name: 'Home', color: '#57a773' },
        { id: 'p-learn', name: 'Learning', color: '#7b6cd9' },
      ],
      tasks: [
        { title: 'Draft Q4 planning doc', project: 'p-work', priority: 1, due: d(0), time: '09:00', duration: 90, deadline: d(3), labels: ['writing'] },
        { title: 'Team sync', project: 'p-work', priority: 3, due: d(0), time: '11:00', duration: 30 },
        { title: 'Review pull requests', project: 'p-work', priority: 2, due: d(1), time: '14:00', duration: 60 },
        { title: 'Submit expense report', project: 'p-work', priority: 2, due: d(-1), deadline: d(1) },
        { title: 'Book dentist appointment', project: 'p-home', priority: 3, due: d(2) },
        { title: 'Pay electricity bill', project: 'p-home', priority: 1, deadline: d(5) },
        { title: 'Grocery run', project: 'p-home', priority: 4, due: d(0), time: '18:00', duration: 45, labels: ['errand'] },
        { title: 'Finish TypeScript course module 4', project: 'p-learn', priority: 3, duration: 60, deadline: d(10) },
        { title: 'Read chapter 7', project: 'p-learn', priority: 4, due: d(4), time: '20:00', duration: 30, labels: ['reading'] },
        { title: 'Renew passport', project: 'p-home', priority: 2, due: d(6), deadline: d(4), notes: 'Scheduled after its deadline: move it earlier!' },
        { title: 'Plan weekend trip', project: 'inbox', priority: 4 },
      ],
      settings: { layout: 'list', scope: 'today' },
    };
    return normalize(raw);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { console.warn('Planwise: could not read saved data', e); }
    return seed();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Planwise: could not save', e); }
  }

  let state = load();
  const ui = {
    calMonth: monthStart(new Date()),
    weekStart: startOfWeek(new Date()),
    sort: { key: 'due', dir: 1 },
    groupBy: 'none',
    tbScroll: null,
    editing: null,
  };

  const getTask = (id) => state.tasks.find((t) => t.id === id);
  const project = (id) => state.projects.find((p) => p.id === id) || state.projects[0];
  const projectIds = () => new Set(state.projects.map((p) => p.id));
  const defaultProject = () => (state.settings.scope.startsWith('project:') ? state.settings.scope.slice(8) : 'inbox');

  function commit() { save(); render(); }
  function updateTask(id, patch) {
    const t = getTask(id);
    if (!t) return;
    Object.assign(t, patch);
    Object.assign(t, normTask(t, projectIds())); // re-validate (e.g. clears time when date is removed)
    commit();
  }
  function addTask(fields) {
    const t = normTask({ ...fields, id: uid(), createdAt: Date.now() }, projectIds());
    state.tasks.push(t);
    commit();
    return t;
  }
  function deleteTask(id) { state.tasks = state.tasks.filter((t) => t.id !== id); commit(); }

  function findOrCreateProject(name) {
    const key = name.replace(/\s+/g, '').toLowerCase();
    const hit = state.projects.find((p) => p.name.replace(/\s+/g, '').toLowerCase() === key);
    if (hit) return hit.id;
    const p = { id: 'p-' + uid(), name, color: PALETTE[state.projects.length % PALETTE.length] };
    state.projects.push(p);
    return p.id;
  }

  // ---------- task semantics ----------
  function compareTasks(a, b) {
    return (a.done - b.done) || cmp(a.due || '9999', b.due || '9999') || cmp(a.time || '99', b.time || '99')
      || (a.priority - b.priority) || (a.createdAt - b.createdAt);
  }
  const byDeadline = (a, b) => cmp(a.deadline || '9999', b.deadline || '9999') || compareTasks(a, b);

  function deadlineInfo(task) {
    if (!task.deadline) return null;
    const diff = daysBetween(todayISO(), task.deadline);
    const conflict = !!(task.due && task.due > task.deadline && !task.done);
    if (task.done) return { diff, level: 'ok', text: 'met', conflict };
    if (diff < 0) return { diff, level: 'overdue', text: `${-diff}d overdue`, conflict };
    if (diff === 0) return { diff, level: 'urgent', text: 'today', conflict };
    return { diff, level: diff <= 2 ? 'soon' : 'ok', text: `in ${diff}d`, conflict };
  }

  function scopeTasks(layout) {
    const s = state.settings.scope, t = todayISO();
    let list = state.tasks;
    if (!state.settings.showDone) list = list.filter((x) => !x.done);
    if (s === 'inbox') return list.filter((x) => x.project === 'inbox');
    if (s.startsWith('project:')) return list.filter((x) => x.project === s.slice(8));
    if (s === 'deadlines') return list.filter((x) => x.deadline);
    // Calendar-style layouts already navigate by date, so date scopes show everything.
    if (layout === 'calendar' || layout === 'timeblock') return list;
    if (s === 'today') return list.filter((x) => (x.due && x.due <= t) || (x.deadline && x.deadline <= t && !x.done));
    if (s === 'upcoming') return list.filter((x) => x.due && x.due >= t);
    return list;
  }

  function scopeLabel() {
    const s = state.settings.scope;
    if (s.startsWith('project:')) return project(s.slice(8)).name;
    return SCOPES.find((x) => x.id === s)?.label || 'Tasks';
  }

  // ---------- shared fragments ----------
  function deadlineBadge(task, compact = false) {
    const info = deadlineInfo(task);
    if (!info) return '';
    const tip = `Deadline ${fmtDate(task.deadline)}${info.conflict ? ' (scheduled after its deadline)' : ''}`;
    return `<span class="badge deadline ${info.level}${info.conflict ? ' conflict' : ''}" title="${esc(tip)}">⚑ ${compact ? '' : esc(fmtDate(task.deadline)) + ' · '}${esc(info.text)}${info.conflict ? ' ⚠' : ''}</span>`;
  }
  function checkButton(task, extra = '') {
    return `<button class="check ${extra}" data-action="toggle" data-id="${esc(task.id)}" style="--pc:${PRIORITY_COLORS[task.priority]}" aria-label="${task.done ? 'Mark incomplete' : 'Complete'}" title="${task.done ? 'Mark incomplete' : 'Complete'}"></button>`;
  }
  function metaBadges(task, { showProject = true } = {}) {
    const out = [];
    if (task.due) {
      const late = task.due < todayISO() && !task.done;
      out.push(`<span class="badge due${late ? ' late' : ''}">📅 ${esc(fmtDate(task.due))}${task.time ? ' ' + fmtTime(task.time) : ''}</span>`);
    }
    if (task.duration) out.push(`<span class="badge">⏱ ${fmtDuration(task.duration)}</span>`);
    out.push(deadlineBadge(task));
    for (const l of task.labels) out.push(`<span class="badge label">@${esc(l)}</span>`);
    if (task.notes) out.push('<span class="badge" title="Has notes">✎</span>');
    if (showProject) {
      const p = project(task.project);
      out.push(`<span class="badge proj"><i style="background:${p.color}"></i>${esc(p.name)}</span>`);
    }
    return out.join('');
  }
  const emptyState = (msg) => `<div class="empty"><div class="empty-ico">✓</div><p>${esc(msg)}</p></div>`;

  // ---------- render ----------
  function render() {
    const content = $('#content');
    const active = document.activeElement;
    const focusKey = active && content.contains(active) && active.dataset.field ? [active.dataset.id, active.dataset.field] : null;

    renderNav();
    renderProjects();
    $('#viewTitle').textContent = scopeLabel();
    $('#showDone').checked = state.settings.showDone;
    for (const b of document.querySelectorAll('#viewSwitch button')) b.classList.toggle('active', b.dataset.layout === state.settings.layout);

    const layout = state.settings.layout;
    content.className = `content layout-${layout}`;
    ({ list: renderList, calendar: renderCalendar, timeblock: renderTimeblock, table: renderTable })[layout](content, scopeTasks(layout));

    if (focusKey) {
      const el = content.querySelector(`[data-id="${CSS.escape(focusKey[0])}"][data-field="${CSS.escape(focusKey[1])}"]`);
      if (el) el.focus();
    }
  }

  function renderNav() {
    const t = todayISO();
    const open = state.tasks.filter((x) => !x.done);
    const counts = {
      inbox: open.filter((x) => x.project === 'inbox').length,
      today: open.filter((x) => (x.due && x.due <= t) || (x.deadline && x.deadline <= t)).length,
      upcoming: open.filter((x) => x.due && x.due >= t).length,
      deadlines: open.filter((x) => x.deadline).length,
      all: open.length,
    };
    const urgentDeadlines = open.some((x) => x.deadline && daysBetween(t, x.deadline) <= 2);
    $('#nav').innerHTML = SCOPES.map((s) => `
      <button class="nav-item${state.settings.scope === s.id ? ' active' : ''}" data-action="scope" data-scope="${s.id}">
        <span class="ico">${s.icon}</span><span class="name">${s.label}</span>
        <span class="count${s.id === 'deadlines' && urgentDeadlines ? ' alert' : ''}">${counts[s.id] || ''}</span>
      </button>`).join('');
  }

  function renderProjects() {
    const open = state.tasks.filter((x) => !x.done);
    $('#projectList').innerHTML = state.projects.filter((p) => p.id !== 'inbox').map((p) => {
      const scope = `project:${p.id}`;
      const n = open.filter((x) => x.project === p.id).length;
      return `<li>
        <button class="nav-item${state.settings.scope === scope ? ' active' : ''}" data-action="scope" data-scope="${esc(scope)}">
          <i class="dot" style="background:${p.color}"></i><span class="name">${esc(p.name)}</span><span class="count">${n || ''}</span>
        </button>
        <button class="icon-btn del" data-action="delete-project" data-id="${esc(p.id)}" title="Delete project">×</button>
      </li>`;
    }).join('');
  }

  // ----- List -----
  function dayHeading(iso) {
    const d = fromISO(iso);
    const rel = fmtDate(iso);
    const abs = `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
    return rel === abs || rel === DOW[d.getDay()] ? abs : `${rel} · ${abs}`;
  }

  function renderList(el, tasks) {
    if (!tasks.length) { el.innerHTML = emptyState('Nothing here. Add a task above.'); return; }
    const t = todayISO();
    const scope = state.settings.scope;
    const useDeadline = scope === 'deadlines';
    const groups = new Map();
    const push = (k, label, item) => { if (!groups.has(k)) groups.set(k, { label, items: [] }); groups.get(k).items.push(item); };
    for (const task of [...tasks].sort(useDeadline ? byDeadline : compareTasks)) {
      if (task.done) { push('zz-done', 'Completed', task); continue; }
      const key = useDeadline ? task.deadline : task.due;
      if (!key) { push('y2-none', 'No date', task); continue; }
      const diff = daysBetween(t, key);
      if (diff < 0) push('a-overdue', useDeadline ? 'Missed deadlines' : 'Overdue', task);
      else if (diff < 7) push('b-' + key, dayHeading(key), task);
      else push('y1-later', 'Later', task);
    }
    const showProject = !scope.startsWith('project:');
    el.innerHTML = [...groups.entries()].sort((a, b) => cmp(a[0], b[0])).map(([k, g]) => `
      <section class="group${k === 'a-overdue' ? ' overdue' : ''}">
        <h2>${esc(g.label)} <span class="count">${g.items.length}</span></h2>
        <ul class="task-list">${g.items.map((task) => `
          <li class="task${task.done ? ' done' : ''}">
            ${checkButton(task)}
            <div class="task-body" data-action="edit" data-id="${esc(task.id)}">
              <div class="task-title">${esc(task.title)}</div>
              <div class="task-meta">${metaBadges(task, { showProject })}</div>
            </div>
          </li>`).join('')}
        </ul>
      </section>`).join('');
  }

  // ----- Calendar (month) -----
  function renderCalendar(el, tasks) {
    const m = ui.calMonth;
    const gridStart = startOfWeek(m);
    const tISO = todayISO();
    const byDue = groupBy(tasks.filter((x) => x.due), (x) => x.due);
    const byDl = groupBy(tasks.filter((x) => x.deadline && !x.done), (x) => x.deadline);
    const undated = tasks.filter((x) => !x.due && !x.done).sort(byDeadline);

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const iso = toISO(d);
      const due = (byDue.get(iso) || []).sort(compareTasks);
      const dls = byDl.get(iso) || [];
      const cls = ['cal-cell', d.getMonth() !== m.getMonth() && 'other', iso === tISO && 'today', iso < tISO && 'past'].filter(Boolean).join(' ');
      cells += `<div class="${cls}" data-drop-date="${iso}">
        <div class="cal-date">
          <span class="num">${d.getDate() === 1 ? MON[d.getMonth()] + ' ' : ''}${d.getDate()}</span>
          <button class="icon-btn add-on" data-action="add-on" data-date="${iso}" title="Add task on this day">+</button>
        </div>
        <div class="cal-items">
          ${dls.map((x) => `<div class="cal-deadline ${deadlineInfo(x).level}" draggable="true" data-drag="deadline:${esc(x.id)}" data-action="edit" data-id="${esc(x.id)}" title="Deadline: ${esc(x.title)} (drag to move the deadline)">⚑ ${esc(x.title)}</div>`).join('')}
          ${due.map((x) => `<div class="cal-chip${x.done ? ' done' : ''}" draggable="true" data-drag="task:${esc(x.id)}" data-action="edit" data-id="${esc(x.id)}" style="--c:${project(x.project).color}" title="${esc(x.title)}">${x.time ? `<b>${fmtTime(x.time)}</b> ` : ''}${esc(x.title)}</div>`).join('')}
        </div>
      </div>`;
    }
    const dowHead = [1, 2, 3, 4, 5, 6, 0].map((i) => `<div>${DOW[i]}</div>`).join('');
    el.innerHTML = `<div class="split">
      <div class="cal-main panel">
        <div class="toolbar">
          <button data-action="cal-prev" title="Previous month">‹</button>
          <button data-action="cal-today">Today</button>
          <button data-action="cal-next" title="Next month">›</button>
          <h2>${MONTH_LONG[m.getMonth()]} ${m.getFullYear()}</h2>
          <span class="legend">Drag tasks to reschedule · ⚑ = deadline</span>
        </div>
        <div class="cal-dow">${dowHead}</div>
        <div class="cal-grid">${cells}</div>
      </div>
      <aside class="side-tray panel" data-drop-date="">
        <h3>No date <span class="count">${undated.length}</span></h3>
        <p class="hint">Drag onto a day to schedule. Drop a task here to clear its date.</p>
        ${undated.map((x) => `<div class="tray-item" draggable="true" data-drag="task:${esc(x.id)}" data-action="edit" data-id="${esc(x.id)}" style="--c:${project(x.project).color}">
          <div class="tray-title">${esc(x.title)}</div><div class="task-meta">${x.duration ? `<span class="badge">⏱ ${fmtDuration(x.duration)}</span>` : ''}${deadlineBadge(x)}</div></div>`).join('') || '<p class="hint">All tasks have dates.</p>'}
      </aside>
    </div>`;
  }

  // ----- Time blocking (week) -----
  function layoutDay(list) {
    const items = list.map((task) => {
      const start = timeToMin(task.time);
      return { task, start, end: Math.min(DAY_MIN, start + (task.duration || DEFAULT_BLOCK)) };
    }).sort((a, b) => a.start - b.start || b.end - a.end);
    let cluster = [], lanes = [], clusterEnd = -1;
    const flush = () => { for (const it of cluster) it.lanes = lanes.length; cluster = []; lanes = []; clusterEnd = -1; };
    for (const it of items) {
      if (cluster.length && it.start >= clusterEnd) flush();
      let lane = lanes.findIndex((end) => end <= it.start);
      if (lane < 0) { lane = lanes.length; lanes.push(it.end); } else lanes[lane] = it.end;
      it.lane = lane;
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    }
    flush();
    return items;
  }
  const rangeLabel = (s, e) => `${fmtClock(s)}–${fmtClock(e)}`;
  const nowMinute = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };

  function weekLabel(ws) {
    const we = addDays(ws, 6);
    const a = `${MON[ws.getMonth()]} ${ws.getDate()}`;
    const b = ws.getMonth() === we.getMonth() ? `${we.getDate()}` : `${MON[we.getMonth()]} ${we.getDate()}`;
    return `${a} – ${b}, ${we.getFullYear()}`;
  }

  function renderTimeblock(el, tasks) {
    const ws = ui.weekStart;
    const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(ws, i)));
    const tISO = todayISO();
    const byDay = groupBy(tasks.filter((x) => x.due && x.time), (x) => x.due);
    const byDl = groupBy(tasks.filter((x) => x.deadline && !x.done), (x) => x.deadline);
    const tray = tasks.filter((x) => !x.done && !x.time).sort(byDeadline);

    const heads = days.map((iso) => {
      const d = fromISO(iso);
      const planned = (byDay.get(iso) || []).filter((x) => !x.done).reduce((s, x) => s + (x.duration || DEFAULT_BLOCK), 0);
      const dls = byDl.get(iso) || [];
      return `<div class="tb-dayhead${iso === tISO ? ' today' : ''}">
        <div class="tb-dow">${DOW[d.getDay()]} <b>${d.getDate()}</b></div>
        <div class="tb-load" title="Planned time">${planned ? fmtDuration(planned) : '—'}</div>
        ${dls.map((x) => `<div class="tb-dl ${deadlineInfo(x).level}" data-action="edit" data-id="${esc(x.id)}" title="Deadline: ${esc(x.title)}">⚑ ${esc(x.title)}</div>`).join('')}
      </div>`;
    }).join('');

    const hours = Array.from({ length: 24 }, (_, h) => `<div class="tb-hour" style="top:${h * HOUR_PX}px">${h ? fmtClock(h * 60) : ''}</div>`).join('');
    const cols = days.map((iso) => {
      const blocks = layoutDay(byDay.get(iso) || []).map((it) => {
        const top = (it.start / 60) * HOUR_PX;
        const h = Math.max(((it.end - it.start) / 60) * HOUR_PX, 14);
        const t = it.task;
        const dl = deadlineInfo(t);
        return `<div class="tb-block${t.done ? ' done' : ''}${h < 34 ? ' short' : ''}" data-id="${esc(t.id)}"
            style="top:${top}px;height:${h}px;left:calc(${(it.lane / it.lanes) * 100}% + 2px);width:calc(${100 / it.lanes}% - 4px);--c:${project(t.project).color}"
            title="${esc(t.title)} · ${rangeLabel(it.start, it.end)}">
          ${checkButton(t, 'mini')}
          <div class="tb-title">${esc(t.title)}</div>
          <div class="tb-time">${rangeLabel(it.start, it.end)}${dl ? ` · <span class="dl-${dl.level}">⚑ ${esc(dl.text)}</span>` : ''}</div>
          <div class="tb-resize" title="Drag to change duration"></div>
        </div>`;
      }).join('');
      const now = iso === tISO ? `<div class="tb-now" style="top:${(nowMinute() / 60) * HOUR_PX}px"></div>` : '';
      return `<div class="tb-col${iso === tISO ? ' today' : ''}" data-date="${iso}">${blocks}${now}</div>`;
    }).join('');

    el.innerHTML = `<div class="split tb-split">
      <aside class="side-tray panel" data-tray>
        <h3>Unscheduled <span class="count">${tray.length}</span></h3>
        <p class="hint">Drag onto the grid to block time. Drop a block here to unschedule it.</p>
        ${tray.map((x) => `<div class="tray-item tb-draggable" data-id="${esc(x.id)}" style="--c:${project(x.project).color}">
          <div class="tray-title">${esc(x.title)}</div>
          <div class="task-meta">${x.due ? `<span class="badge due${x.due < tISO ? ' late' : ''}">📅 ${esc(fmtDate(x.due))}</span>` : ''}<span class="badge">⏱ ${fmtDuration(x.duration || DEFAULT_BLOCK)}</span>${deadlineBadge(x, true)}</div>
        </div>`).join('') || '<p class="hint">Everything is scheduled 🎉</p>'}
      </aside>
      <div class="tb-main panel">
        <div class="toolbar">
          <button data-action="tb-prev" title="Previous week">‹</button>
          <button data-action="tb-today">This week</button>
          <button data-action="tb-next" title="Next week">›</button>
          <h2>${weekLabel(ws)}</h2>
          <span class="legend">Drag empty space to create · drag a block to move · drag its bottom edge to resize</span>
        </div>
        <div class="tb-head"><div></div>${heads}</div>
        <div class="tb-scroll"><div class="tb-grid" style="height:${24 * HOUR_PX}px;--hour:${HOUR_PX}px"><div class="tb-gutter">${hours}</div>${cols}</div></div>
      </div>
    </div>`;

    const sc = $('.tb-scroll', el);
    sc.scrollTop = ui.tbScroll ?? 7 * HOUR_PX;
    sc.addEventListener('scroll', () => { ui.tbScroll = sc.scrollTop; });
  }

  // Pointer-driven drag for the time-block grid (move / resize / draw-to-create).
  let drag = null, previewEl = null, ghostEl = null;
  const minuteAt = (col, y) => ((y - col.getBoundingClientRect().top) / HOUR_PX) * 60;

  function showPreview(col, start, end, label) {
    if (!previewEl) { previewEl = document.createElement('div'); previewEl.className = 'tb-preview'; }
    if (previewEl.parentElement !== col) col.appendChild(previewEl);
    previewEl.style.top = `${(start / 60) * HOUR_PX}px`;
    previewEl.style.height = `${((end - start) / 60) * HOUR_PX}px`;
    previewEl.textContent = `${rangeLabel(start, end)}  ${label}`;
  }
  const hidePreview = () => { previewEl?.remove(); };
  function moveGhost(e, label) {
    if (!ghostEl) { ghostEl = document.createElement('div'); ghostEl.className = 'drag-ghost'; ghostEl.textContent = label; document.body.appendChild(ghostEl); }
    ghostEl.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
  }
  const hideGhost = () => { ghostEl?.remove(); ghostEl = null; };
  function autoScroll(x, y) {
    const sc = $('.tb-scroll'); if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (x < r.left || x > r.right) return; // only while the pointer is over the grid
    if (y < r.top + 32) sc.scrollTop -= 14; else if (y > r.bottom - 32) sc.scrollTop += 14;
  }

  function onPointerDown(e) {
    if (state.settings.layout !== 'timeblock' || e.button !== 0) return;
    if (e.target.closest('[data-action]')) return; // buttons keep normal click behaviour
    const block = e.target.closest('.tb-block');
    const item = e.target.closest('.tray-item');
    const col = e.target.closest('.tb-col');
    if (!block && !item && !col) return;
    e.preventDefault();
    const base = { x0: e.clientX, y0: e.clientY, moved: false };
    if (block && e.target.closest('.tb-resize')) {
      const t = getTask(block.dataset.id);
      drag = { ...base, mode: 'resize', task: t, el: block, start: timeToMin(t.time), duration: t.duration || DEFAULT_BLOCK };
    } else if (block || item) {
      const el = block || item;
      const t = getTask(el.dataset.id);
      const offset = block ? minuteAt(col, e.clientY) - timeToMin(t.time) : 0;
      drag = { ...base, mode: 'move', task: t, el, offset, duration: t.duration || DEFAULT_BLOCK, fromTray: !!item };
    } else {
      drag = { ...base, mode: 'create', col, anchor: clamp(snapFloor(minuteAt(col, e.clientY)), 0, DAY_MIN - SNAP) };
    }
    if (!drag.task && drag.mode !== 'create') { drag = null; return; }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      document.body.classList.add('is-dragging');
      drag.el?.classList.add('dragging');
    }
    autoScroll(e.clientX, e.clientY);

    if (drag.mode === 'resize') {
      const end = clamp(snap(minuteAt(drag.el.parentElement, e.clientY)), drag.start + SNAP, DAY_MIN);
      drag.duration = end - drag.start;
      drag.el.style.height = `${(drag.duration / 60) * HOUR_PX}px`;
      drag.el.querySelector('.tb-time').textContent = rangeLabel(drag.start, end);
      return;
    }
    if (drag.mode === 'create') {
      const a = drag.anchor, b = clamp(snap(minuteAt(drag.col, e.clientY)), 0, DAY_MIN);
      const [start, end] = b >= a ? [a, Math.max(b, a + SNAP)] : [b, a + SNAP];
      drag.start = start; drag.duration = end - start;
      showPreview(drag.col, start, end, 'New task');
      return;
    }
    // move
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const col = target?.closest('.tb-col');
    drag.overTray = !!target?.closest('[data-tray]');
    if (col) {
      hideGhost();
      const start = clamp(snap(minuteAt(col, e.clientY) - drag.offset), 0, Math.max(0, DAY_MIN - drag.duration));
      drag.col = col; drag.start = start;
      showPreview(col, start, start + drag.duration, drag.task.title);
    } else {
      drag.col = null;
      hidePreview();
      moveGhost(e, drag.overTray && !drag.fromTray ? `Unschedule “${drag.task.title}”` : drag.task.title);
    }
  }

  function endDrag() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancelDrag);
    document.body.classList.remove('is-dragging');
    hidePreview(); hideGhost();
    const d = drag; drag = null;
    return d;
  }
  function cancelDrag() { if (endDrag()) render(); }

  function onPointerUp() {
    const d = endDrag();
    if (!d) return;
    if (!d.moved) {
      if (d.mode === 'create') openTaskDialog(null, { due: d.col.dataset.date, time: minToTime(d.anchor), duration: DEFAULT_BLOCK });
      else openTaskDialog(d.task.id);
      return;
    }
    if (d.mode === 'resize') updateTask(d.task.id, { duration: d.duration });
    else if (d.mode === 'create') openTaskDialog(null, { due: d.col.dataset.date, time: minToTime(d.start), duration: d.duration });
    else if (d.col) updateTask(d.task.id, { due: d.col.dataset.date, time: minToTime(d.start), duration: d.duration });
    else if (d.overTray && !d.fromTray) updateTask(d.task.id, { time: null });
    else render();
  }

  // ----- Table -----
  const TABLE_COLS = [
    { key: 'done', label: '', sort: (t) => (t.done ? 1 : 0) },
    { key: 'title', label: 'Task', sort: (t) => t.title.toLowerCase() },
    { key: 'project', label: 'Project', sort: (t) => project(t.project).name.toLowerCase() },
    { key: 'priority', label: 'Priority', sort: (t) => t.priority },
    { key: 'due', label: 'Date', sort: (t) => t.due || '9999-99-99' },
    { key: 'time', label: 'Time', sort: (t) => t.time || '99:99' },
    { key: 'duration', label: 'Duration', sort: (t) => t.duration || 0 },
    { key: 'deadline', label: 'Deadline', sort: (t) => t.deadline || '9999-99-99' },
    { key: 'labels', label: 'Labels', sort: (t) => t.labels.join(',').toLowerCase() },
  ];

  function tableRow(t) {
    const id = esc(t.id);
    const projOpts = state.projects.map((p) => `<option value="${esc(p.id)}"${p.id === t.project ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    const prioOpts = [1, 2, 3, 4].map((n) => `<option value="${n}"${n === t.priority ? ' selected' : ''}>P${n}</option>`).join('');
    return `<tr class="${t.done ? 'done' : ''}">
      <td>${checkButton(t)}</td>
      <td><input class="cell cell-title" data-field="title" data-id="${id}" value="${esc(t.title)}" aria-label="Task name"></td>
      <td><span class="proj-cell"><i style="background:${project(t.project).color}"></i><select data-field="project" data-id="${id}" aria-label="Project">${projOpts}</select></span></td>
      <td><select class="prio p${t.priority}" data-field="priority" data-id="${id}" aria-label="Priority">${prioOpts}</select></td>
      <td><input type="date" class="${t.due && t.due < todayISO() && !t.done ? 'late' : ''}" data-field="due" data-id="${id}" value="${t.due || ''}" aria-label="Date"></td>
      <td><input type="time" step="900" data-field="time" data-id="${id}" value="${t.time || ''}" ${t.due ? '' : 'disabled title="Set a date first"'} aria-label="Time"></td>
      <td><input type="number" class="num" min="0" max="1440" step="15" placeholder="—" data-field="duration" data-id="${id}" value="${t.duration || ''}" aria-label="Duration in minutes"></td>
      <td class="dl-cell"><input type="date" data-field="deadline" data-id="${id}" value="${t.deadline || ''}" aria-label="Deadline">${deadlineBadge(t, true)}</td>
      <td><input class="cell" data-field="labels" data-id="${id}" value="${esc(t.labels.join(', '))}" placeholder="—" aria-label="Labels"></td>
      <td><button class="icon-btn" data-action="edit" data-id="${id}" title="Open details">⋯</button></td>
    </tr>`;
  }

  function renderTable(el, tasks) {
    const { key, dir } = ui.sort;
    const col = TABLE_COLS.find((c) => c.key === key) || TABLE_COLS[4];
    const sorted = [...tasks].sort((a, b) => cmp(col.sort(a), col.sort(b)) * dir || compareTasks(a, b));
    let groups = [{ label: null, items: sorted }];
    if (ui.groupBy === 'project') {
      const g = groupBy(sorted, (t) => t.project);
      groups = state.projects.filter((p) => g.has(p.id)).map((p) => ({ label: p.name, color: p.color, items: g.get(p.id) }));
    } else if (ui.groupBy === 'priority') {
      const g = groupBy(sorted, (t) => t.priority);
      groups = [1, 2, 3, 4].filter((n) => g.has(n)).map((n) => ({ label: `Priority ${n}`, color: PRIORITY_COLORS[n], items: g.get(n) }));
    }
    const planned = tasks.filter((t) => !t.done).reduce((s, t) => s + (t.duration || 0), 0);
    const head = TABLE_COLS.map((c) => `<th${c.key === key ? ' class="sorted"' : ''}>${c.label ? `<button data-action="sort" data-key="${c.key}">${c.label}${c.key === key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button>` : ''}</th>`).join('') + '<th></th>';
    const body = groups.map((g) => (g.label ? `<tr class="group-row"><td colspan="10"><i style="background:${g.color}"></i>${esc(g.label)} <span class="count">${g.items.length}</span></td></tr>` : '') + g.items.map(tableRow).join('')).join('');

    el.innerHTML = `<div class="panel table-panel">
      <div class="toolbar">
        <label>Group by
          <select data-ui="groupBy">
            ${['none', 'project', 'priority'].map((v) => `<option value="${v}"${ui.groupBy === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}
          </select>
        </label>
        <span class="legend">${tasks.length} tasks · ${fmtDuration(planned) || '0m'} planned · click a header to sort, edit cells inline</span>
      </div>
      <div class="table-scroll">
        <table class="grid-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${body || `<tr><td colspan="10">${emptyState('No tasks match this view.')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ---------- dialog ----------
  const dlg = $('#taskDialog');
  const form = $('#taskForm');
  const F = (name) => form.elements.namedItem(name);

  function refreshDialogState() {
    const due = F('due').value, dl = F('deadline').value;
    F('time').disabled = !due;
    $('#dlgWarn').textContent = due && dl && due > dl ? '⚠ This task is scheduled after its deadline.' : '';
  }

  function openTaskDialog(id, preset = {}) {
    const t = id ? getTask(id) : { title: '', notes: '', project: defaultProject(), priority: 4, due: null, time: null, duration: null, deadline: null, labels: [], ...preset };
    if (!t) return;
    ui.editing = id;
    F('project').innerHTML = state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    F('title').value = t.title;
    F('notes').value = t.notes || '';
    F('project').value = t.project;
    F('priority').value = String(t.priority);
    F('due').value = t.due || '';
    F('time').value = t.time || '';
    F('duration').value = t.duration || '';
    F('deadline').value = t.deadline || '';
    F('labels').value = t.labels.join(', ');
    $('#dlgDelete').hidden = !id;
    refreshDialogState();
    dlg.showModal();
    F('title').focus();
  }

  form.addEventListener('input', refreshDialogState);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = F('title').value.trim();
    if (!title) return;
    const fields = {
      title,
      notes: F('notes').value,
      project: F('project').value,
      priority: Number(F('priority').value),
      due: F('due').value || null,
      time: F('time').value || null,
      duration: Number(F('duration').value) || null,
      deadline: F('deadline').value || null,
      labels: parseLabels(F('labels').value),
    };
    dlg.close();
    if (ui.editing) updateTask(ui.editing, fields); else addTask(fields);
  });
  $('#dlgCancel').addEventListener('click', () => dlg.close());
  $('#dlgDelete').addEventListener('click', () => {
    if (ui.editing && confirm('Delete this task?')) { dlg.close(); deleteTask(ui.editing); }
  });

  // ---------- quick add ----------
  const quickInput = $('#quickInput');
  function quickChips(r) {
    const chips = [];
    if (r.due || r.time) chips.push(`📅 ${r.due ? fmtDate(r.due) : 'Today'}${r.time ? ' ' + fmtTime(r.time) : ''}`);
    if (r.duration) chips.push(`⏱ ${fmtDuration(r.duration)}`);
    if (r.deadline) chips.push(`⚑ deadline ${fmtDate(r.deadline)}`);
    if (r.priority) chips.push(`P${r.priority}`);
    if (r.project) chips.push(`#${r.project}`);
    for (const l of r.labels) chips.push(`@${l}`);
    return chips;
  }
  quickInput.addEventListener('input', () => {
    const r = parseQuickAdd(quickInput.value);
    const chips = quickChips(r);
    $('#quickPreview').innerHTML = quickInput.value.trim()
      ? `<span class="qp-title">${esc(r.title || '…')}</span>${chips.map((c) => `<span class="badge">${esc(c)}</span>`).join('')}`
      : '';
  });
  $('#quickAdd').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = parseQuickAdd(quickInput.value);
    if (!r.title) return;
    let due = r.due;
    if (!due && (r.time || state.settings.scope === 'today')) due = todayISO();
    addTask({
      title: r.title, due, time: r.time, duration: r.duration, deadline: r.deadline,
      priority: r.priority || 4, labels: r.labels,
      project: r.project ? findOrCreateProject(r.project) : defaultProject(),
    });
    quickInput.value = '';
    $('#quickPreview').innerHTML = '';
  });

  // ---------- global events ----------
  function setLayout(layout) {
    if (!LAYOUTS.includes(layout)) return;
    state.settings.layout = layout;
    history.replaceState(null, '', '#' + layout);
    commit();
  }

  const actions = {
    toggle: (el) => { const t = getTask(el.dataset.id); if (t) updateTask(t.id, { done: !t.done }); },
    edit: (el) => openTaskDialog(el.dataset.id),
    'add-on': (el) => openTaskDialog(null, { due: el.dataset.date }),
    scope: (el) => { state.settings.scope = el.dataset.scope; commit(); },
    layout: (el) => setLayout(el.dataset.layout),
    'cal-prev': () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); render(); },
    'cal-next': () => { ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); render(); },
    'cal-today': () => { ui.calMonth = monthStart(new Date()); render(); },
    'tb-prev': () => { ui.weekStart = addDays(ui.weekStart, -7); render(); },
    'tb-next': () => { ui.weekStart = addDays(ui.weekStart, 7); render(); },
    'tb-today': () => { ui.weekStart = startOfWeek(new Date()); render(); },
    sort: (el) => {
      const key = el.dataset.key;
      ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: 1 };
      render();
    },
    'add-project': () => {
      const name = prompt('Project name');
      if (!name || !name.trim()) return;
      const id = findOrCreateProject(name.trim().slice(0, 60));
      state.settings.scope = `project:${id}`;
      commit();
    },
    'delete-project': (el) => {
      const p = project(el.dataset.id);
      if (p.id === 'inbox' || !confirm(`Delete project “${p.name}”? Its tasks move to the Inbox.`)) return;
      for (const t of state.tasks) if (t.project === p.id) t.project = 'inbox';
      state.projects = state.projects.filter((x) => x.id !== p.id);
      if (state.settings.scope === `project:${p.id}`) state.settings.scope = 'inbox';
      commit();
    },
    export: () => {
      const data = { app: 'planwise', version: 1, exportedAt: new Date().toISOString(), projects: state.projects, tasks: state.tasks };
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      a.download = `planwise-${todayISO()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    // In the time-block grid, blocks/tray items open on pointerup instead.
    if (drag) return;
    actions[el.dataset.action](el);
  });

  $('#showDone').addEventListener('change', (e) => { state.settings.showDone = e.target.checked; commit(); });

  const content = $('#content');
  content.addEventListener('pointerdown', onPointerDown);

  // Inline table edits. Rendering is deferred a frame so focus can move to the next cell first.
  content.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.ui === 'groupBy') { ui.groupBy = el.value; render(); return; }
    const { field, id } = el.dataset;
    const t = field && id && getTask(id);
    if (!t) return;
    const v = el.value;
    const patch = {};
    switch (field) {
      case 'title': if (!v.trim()) { el.value = t.title; return; } patch.title = v.trim(); break;
      case 'project': patch.project = v; break;
      case 'priority': patch.priority = Number(v); break;
      case 'due': patch.due = v || null; break;
      case 'time': patch.time = v || null; break;
      case 'duration': patch.duration = Number(v) || null; break;
      case 'deadline': patch.deadline = v || null; break;
      case 'labels': patch.labels = parseLabels(v); break;
      default: return;
    }
    Object.assign(t, patch, normTask({ ...t, ...patch }, projectIds()));
    save();
    requestAnimationFrame(render);
  });

  // HTML5 drag & drop for the month calendar.
  content.addEventListener('dragstart', (e) => {
    const el = e.target.closest?.('[data-drag]');
    if (!el) return;
    e.dataTransfer.setData('text/plain', el.dataset.drag);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  const clearDropMarks = () => content.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
  content.addEventListener('dragend', (e) => { e.target.closest?.('[data-drag]')?.classList.remove('dragging'); clearDropMarks(); });
  content.addEventListener('dragover', (e) => {
    const zone = e.target.closest('[data-drop-date]');
    if (!zone) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!zone.classList.contains('drop-over')) { clearDropMarks(); zone.classList.add('drop-over'); }
  });
  content.addEventListener('drop', (e) => {
    const zone = e.target.closest('[data-drop-date]');
    if (!zone) return;
    e.preventDefault();
    clearDropMarks();
    const data = e.dataTransfer.getData('text/plain');
    const i = data.indexOf(':');
    const kind = data.slice(0, i), id = data.slice(i + 1);
    const date = zone.dataset.dropDate || null;
    if (kind === 'task') updateTask(id, { due: date });
    else if (kind === 'deadline' && date) updateTask(id, { deadline: date });
  });

  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.tasks)) throw new Error('File has no "tasks" list.');
      if (!confirm(`Replace your current data with ${data.tasks.length} imported tasks?`)) return;
      state = normalize({ ...data, settings: state.settings });
      commit();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'q') { e.preventDefault(); quickInput.focus(); }
    else if (['1', '2', '3', '4'].includes(k)) setLayout(LAYOUTS[Number(k) - 1]);
  });

  window.addEventListener('hashchange', () => { const l = location.hash.slice(1); if (l !== state.settings.layout) setLayout(l); });
  window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { state = load(); render(); } });

  // Keep the "now" line current.
  setInterval(() => {
    const line = $('.tb-now');
    if (line && !drag) line.style.top = `${(nowMinute() / 60) * HOUR_PX}px`;
  }, 60000);

  const fromHash = location.hash.slice(1);
  if (LAYOUTS.includes(fromHash)) state.settings.layout = fromHash;
  render();
})();
