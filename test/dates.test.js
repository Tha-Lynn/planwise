// Run: node test/dates.test.js
const assert = require('node:assert/strict');
const PW = require('../dates.js');
const base = new Date(2026, 10, 3); // Tue Nov 3 2026
const q = (s) => PW.parseQuickAdd(s, base);
let n = 0;
const t = (name, fn) => { fn(); n++; };

t('full example', () => {
  const r = q('Draft report tomorrow 2pm for 90m p1 #Work @writing deadline fri');
  assert.deepEqual(r, { title: 'Draft report', due: '2026-11-04', time: '14:00', duration: 90, deadline: '2026-11-06', priority: 1, project: 'Work', labels: ['writing'] });
});
t('by = deadline', () => { const r = q('Finish essay by friday'); assert.equal(r.deadline, '2026-11-06'); assert.equal(r.due, null); assert.equal(r.title, 'Finish essay'); });
t('braces deadline', () => assert.equal(q('Taxes {dec 15}').deadline, '2026-12-15'));
t('time range', () => { const r = q('Deep work 9:30-11am'); assert.equal(r.time, '09:30'); assert.equal(r.duration, 90); });
t('ambiguous range', () => { const r = q('Lunch 11-1pm'); assert.equal(r.time, '11:00'); assert.equal(r.duration, 120); });
t('24h range', () => { const r = q('Gym 18:00-19:15 today'); assert.equal(r.time, '18:00'); assert.equal(r.duration, 75); assert.equal(r.due, '2026-11-03'); });
t('weekday same day -> next week', () => assert.equal(q('Standup tuesday').due, '2026-11-10'));
t('month rollover', () => assert.equal(q('Party oct 1').due, '2027-10-01'));
t('in N weeks', () => assert.equal(q('Review in 2 weeks').due, '2026-11-17'));
t('us slash', () => assert.equal(q('x 12/25').due, '2026-12-25'));
t('invalid date ignored', () => { const r = q('x 2026-02-30'); assert.equal(r.due, null); assert.equal(r.title, 'x 2026-02-30'); });
t('hours fractional', () => assert.equal(q('Read for 1.5h').duration, 90));
t('h + m', () => assert.equal(q('Read for 1h 15m').duration, 75));
t('multiple labels', () => assert.deepEqual(q('a @x @y @x').labels, ['x', 'y']));
t('no false positives', () => { const r = q('Satisfy the brief'); assert.equal(r.due, null); assert.equal(r.title, 'Satisfy the brief'); });
t('12am', () => assert.equal(q('x at 12am').time, '00:00'));
t('fmtTime', () => { assert.equal(PW.fmtTime('13:30'), '1:30pm'); assert.equal(PW.fmtClock(1440), '12am'); });
t('fmtDuration', () => assert.equal(PW.fmtDuration(135), '2h 15m'));
t('startOfWeek monday', () => assert.equal(PW.toISO(PW.startOfWeek(base)), '2026-11-02'));
console.log(`ok - ${n} tests passed`);
