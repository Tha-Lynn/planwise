// Pure date helpers + natural-language quick-add parser.
// Loaded by the browser (window.PW) and by Node tests (module.exports).
(function (global) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const todayISO = () => toISO(new Date());
  // Math.round absorbs 23h/25h DST days.
  const daysBetween = (aISO, bISO) => Math.round((fromISO(bISO) - fromISO(aISO)) / 86400000);
  const startOfWeek = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -((x.getDay() + 6) % 7)); };
  const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const timeToMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s;
  const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function fmtClock(min) {
    const h = Math.floor(min / 60) % 24, mm = min % 60;
    const ap = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return mm ? `${h12}:${pad(mm)}${ap}` : `${h12}${ap}`;
  }
  const fmtTime = (t) => (t ? fmtClock(timeToMin(t)) : '');
  function fmtDuration(m) {
    if (!m) return '';
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  }
  function fmtDate(iso, base = todayISO()) {
    const d = fromISO(iso);
    const diff = daysBetween(base, iso);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return DOW[d.getDay()];
    const sameYear = d.getFullYear() === fromISO(base).getFullYear();
    return `${MON[d.getMonth()]} ${d.getDate()}${sameYear ? '' : ' ' + d.getFullYear()}`;
  }

  // ---------- natural language dates ----------
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const MONTH_RE = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?`;
  const DATE_SRC = [
    String.raw`today|tod|tomorrow|tmrw?`,
    String.raw`(?:next\s+|this\s+)?(?:mon|tues?|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?`,
    String.raw`in\s+\d+\s+(?:days?|weeks?|d|w)`,
    String.raw`\d{4}-\d{1,2}-\d{1,2}`,
    String.raw`\d{1,2}\/\d{1,2}(?:\/\d{2,4})?`,
    String.raw`${MONTH_RE}\s+\d{1,2}(?:st|nd|rd|th)?`,
    String.raw`\d{1,2}(?:st|nd|rd|th)?\s+${MONTH_RE}`,
  ].map((s) => `(?:${s})`).join('|');

  function validYMD(y, mo, d) {
    if (!mo || mo < 1 || mo > 12 || !d) return null;
    const dt = new Date(y, mo - 1, d);
    return dt.getMonth() === mo - 1 && dt.getDate() === d ? toISO(dt) : null;
  }
  // Month/day without a year: pick the next occurrence (this year, or next year if already past).
  function withRollover(mo, d, y, base) {
    if (y) return validYMD(y, mo, d);
    let r = validYMD(base.getFullYear(), mo, d);
    if (r && r < toISO(base)) r = validYMD(base.getFullYear() + 1, mo, d);
    return r;
  }
  const monthIdx = (s) => { const i = MONTHS.indexOf(s.slice(0, 3)); return i < 0 ? null : i + 1; };

  function resolveDate(phrase, baseDate = new Date()) {
    const p = phrase.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const b = new Date(baseDate); b.setHours(0, 0, 0, 0);
    let m;
    if (p === 'today' || p === 'tod') return toISO(b);
    if (p === 'tomorrow' || p === 'tmr' || p === 'tmrw') return toISO(addDays(b, 1));
    if ((m = p.match(/^(?:next |this )?(mon|tue|wed|thu|fri|sat|sun)/))) {
      // Always the soonest upcoming day, never today ("friday" on a Friday = next week).
      const diff = (WEEKDAYS.indexOf(m[1]) - b.getDay() + 7) % 7 || 7;
      return toISO(addDays(b, diff));
    }
    if ((m = p.match(/^in (\d+) (days?|d|weeks?|w)$/))) return toISO(addDays(b, m[2][0] === 'w' ? +m[1] * 7 : +m[1]));
    if ((m = p.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return validYMD(+m[1], +m[2], +m[3]);
    if ((m = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      let y = m[3] ? +m[3] : null;
      if (y !== null && y < 100) y += 2000;
      return withRollover(+m[1], +m[2], y, b); // US order: month/day
    }
    if ((m = p.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?$/))) return withRollover(monthIdx(m[1]), +m[2], null, b);
    if ((m = p.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)$/))) return withRollover(monthIdx(m[2]), +m[1], null, b);
    return null;
  }

  function clock(h, m, ap) {
    h = +h; m = +(m || 0);
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    return h < 24 && m < 60 ? h * 60 + m : null;
  }

  /**
   * Parse a quick-add line, e.g.
   *   "Draft report tomorrow 2pm for 90m p1 #Work @writing deadline fri"
   * Recognised tokens are removed from the title.
   */
  function parseQuickAdd(input, baseDate = new Date()) {
    let text = ` ${input} `;
    const out = { title: '', due: null, time: null, duration: null, deadline: null, priority: null, project: null, labels: [] };
    // Replace the first match of `re`; the callback returns false to leave the text untouched.
    const take = (re, fn) => {
      let done = false;
      text = text.replace(re, (...a) => {
        if (done) return a[0];
        if (fn(...a) === false) return a[0];
        done = true;
        return ' ';
      });
    };
    const B = String.raw`(?=\s)`; // token must end at whitespace

    // Deadline first so "by friday" isn't read as the scheduled date.
    take(new RegExp(String.raw`\s(?:deadline|dl|due by|by)\s+(${DATE_SRC})${B}`, 'i'), (_, d) => {
      const r = resolveDate(d, baseDate); if (!r) return false; out.deadline = r;
    });
    if (!out.deadline) take(new RegExp(String.raw`\s\{(${DATE_SRC})\}${B}`, 'i'), (_, d) => {
      const r = resolveDate(d, baseDate); if (!r) return false; out.deadline = r;
    });

    // Durations: "for 45m", "for 1h", "for 1.5h", "for 1h 30m"
    take(new RegExp(String.raw`\sfor\s+(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|m|mins?|minutes?)(?:\s*(\d+)\s*(?:m|mins?|minutes?))?${B}`, 'i'), (_, n, unit, extra) => {
      let mins = unit[0].toLowerCase() === 'h' ? Math.round(+n * 60) : Math.round(+n);
      if (extra) mins += +extra;
      if (!mins || mins > 24 * 60) return false;
      out.duration = mins;
    });

    // Time ranges: "2pm-4pm", "11-1pm", "from 9:30 to 11am", "14:00-15:30"
    take(new RegExp(String.raw`\s(?:from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)${B}`, 'i'), (_, h1, m1, ap1, h2, m2, ap2) => {
      ap2 = ap2.toLowerCase();
      const e = clock(h2, m2, ap2);
      let s = clock(h1, m1, ap1 ? ap1.toLowerCase() : ap2);
      if (!ap1 && s !== null && e !== null && s >= e) s = clock(h1, m1, ap2 === 'pm' ? 'am' : 'pm');
      if (s === null || e === null || e <= s) return false;
      out.time = minToTime(s); out.duration = e - s;
    });
    if (!out.time) take(new RegExp(String.raw`\s(?:from\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to)\s*([01]?\d|2[0-3]):([0-5]\d)${B}`, 'i'), (_, h1, m1, h2, m2) => {
      const s = clock(h1, m1), e = clock(h2, m2);
      if (e <= s) return false;
      out.time = minToTime(s); out.duration = e - s;
    });
    // Single times: "3pm", "at 3:30pm", "15:00"
    if (!out.time) take(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s)/i, (_, h, m, ap) => {
      const c = clock(h, m, ap.toLowerCase()); if (c === null) return false; out.time = minToTime(c);
    });
    if (!out.time) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/i, (_, h, m) => { out.time = minToTime(clock(h, m)); });

    // Scheduled date
    take(new RegExp(String.raw`\s(?:on\s+|due\s+)?(${DATE_SRC})${B}`, 'i'), (_, d) => {
      const r = resolveDate(d, baseDate); if (!r) return false; out.due = r;
    });

    take(/\sp([1-4])(?=\s)/i, (_, n) => { out.priority = +n; });
    take(/\s#([^\s#@]+)(?=\s)/, (_, name) => { out.project = name; });
    text = text.replace(/\s@([^\s#@]+)(?=\s)/g, (_, l) => { if (!out.labels.includes(l)) out.labels.push(l); return ' '; });

    out.title = text.replace(/\s+/g, ' ').trim();
    return out;
  }

  const api = {
    pad, toISO, fromISO, addDays, todayISO, daysBetween, startOfWeek, monthStart, timeToMin, minToTime,
    isISODate, isTime, fmtClock, fmtTime, fmtDuration, fmtDate, resolveDate, parseQuickAdd, DOW, MON, MONTH_LONG,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else global.PW = api;
})(typeof window !== 'undefined' ? window : globalThis);
