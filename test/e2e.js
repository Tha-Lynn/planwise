// End-to-end browser test for Planwise.
// Usage: node test/e2e.js [app-dir] [screenshot-dir]
//   app-dir         defaults to the repo root
//   screenshot-dir  defaults to test-results/screenshots (gitignored)
// Chrome is taken from the CHROME_PATH env var, falling back to common install paths.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.resolve(process.argv[2] || ROOT);
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'test-results', 'screenshots'));
const APP = require('url').pathToFileURL(path.join(APP_DIR, 'index.html')).href;

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const env = process.env;
  const candidates = {
    win32: [
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
      env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Chromium/Application/chrome.exe'),
      env['PROGRAMFILES(X86)'] && path.join(env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
    ],
  }[process.platform] || [];
  const found = candidates.filter(Boolean).find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.');
  return found;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(APP + '#list');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const tasks = () => page.evaluate(() => JSON.parse(localStorage.getItem('planwise.v1') || '{"tasks":[]}').tasks);
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

  // List / Today
  assert.ok(await page.$('.task'), 'list renders tasks');
  await shot('1-list-today');

  // Quick add
  await page.type('#quickInput', 'Write proposal tomorrow 2-4pm p1 #Clients @deep by fri');
  const preview = await page.$eval('#quickPreview', (e) => e.textContent);
  assert.match(preview, /Write proposal/);
  await page.keyboard.press('Enter');
  let t = (await tasks()).find((x) => x.title === 'Write proposal');
  assert.ok(t, 'quick add created'); assert.equal(t.time, '14:00'); assert.equal(t.duration, 120); assert.equal(t.priority, 1); assert.ok(t.deadline); assert.deepEqual(t.labels, ['deep']);
  console.log('quick add ok', t.due, t.deadline);

  // Deadlines scope
  await page.click('[data-scope="deadlines"]');
  await shot('2-list-deadlines');

  // Calendar
  await page.click('[data-scope="all"]');
  await page.click('[data-layout="calendar"]');
  assert.ok(await page.$('.cal-cell.today'));
  await shot('3-calendar');
  // HTML5 drop: move first undated tray task onto a day
  const moved = await page.evaluate(() => {
    const item = document.querySelector('.side-tray .tray-item');
    const cell = document.querySelectorAll('.cal-cell:not(.other)')[20];
    const dt = new DataTransfer();
    item.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    cell.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    cell.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { id: item.dataset.id, date: cell.dataset.dropDate };
  });
  t = (await tasks()).find((x) => x.id === moved.id);
  assert.equal(t.due, moved.date); console.log('calendar drop ok', t.title, '->', t.due);

  // Time blocks
  await page.click('[data-layout="timeblock"]');
  assert.ok(await page.$('.tb-block'));
  await shot('4-timeblock');
  const box = async (sel) => (await page.$(sel)).boundingBox();
  // Move "Team sync" block down 1 hour
  const sync = (await tasks()).find((x) => x.title === 'Team sync');
  let b = await box(`.tb-block[data-id="${sync.id}"]`);
  await page.mouse.move(b.x + b.width / 2, b.y + 8); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 30, { steps: 4 }); await page.mouse.move(b.x + b.width / 2, b.y + 8 + 48, { steps: 4 });
  await page.mouse.up();
  t = (await tasks()).find((x) => x.id === sync.id); assert.equal(t.time, '12:00'); console.log('block move ok', t.time);
  // Resize to 60 min
  b = await box(`.tb-block[data-id="${sync.id}"] .tb-resize`);
  await page.mouse.move(b.x + b.width / 2, b.y + 3); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 3 + 24, { steps: 5 }); await page.mouse.up();
  t = (await tasks()).find((x) => x.id === sync.id); assert.equal(t.duration, 60); console.log('resize ok', t.duration);
  // Drag tray item onto grid (tomorrow column 3pm)
  const tray = await page.$eval('[data-tray] .tray-item', (e) => e.dataset.id);
  const colX = await page.evaluate(() => { document.querySelector('.tb-scroll').scrollTop = 12 * 48; const c = document.querySelector('.tb-col.today'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top }; });
  b = await box(`[data-tray] .tray-item[data-id="${tray}"]`);
  await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down();
  await page.mouse.move(colX.x, colX.top + 15 * 48, { steps: 10 }); await page.mouse.up();
  t = (await tasks()).find((x) => x.id === tray); assert.equal(t.time, '15:00'); console.log('tray -> grid ok', t.title, t.due, t.time);
  // Draw-to-create: 16:00 -> 17:30 today
  await page.mouse.move(colX.x, colX.top + 16 * 48 + 2); await page.mouse.down();
  await page.mouse.move(colX.x, colX.top + 17.5 * 48, { steps: 6 }); await page.mouse.up();
  assert.ok(await page.$eval('#taskDialog', (d) => d.open), 'dialog opens');
  assert.equal(await page.$eval('[name=time]', (e) => e.value), '16:00');
  assert.equal(await page.$eval('[name=duration]', (e) => e.value), '90');
  await page.type('[name=title]', 'Focus block');
  await page.keyboard.press('Enter');
  t = (await tasks()).find((x) => x.title === 'Focus block'); assert.equal(t.duration, 90); console.log('draw-create ok');
  await shot('5-timeblock-after');
  // Unschedule by dropping a block onto the tray
  b = await box(`.tb-block[data-id="${t.id}"]`);
  const tb = await box('[data-tray]');
  await page.mouse.move(b.x + b.width / 2, b.y + 10); await page.mouse.down();
  await page.mouse.move(tb.x + 60, tb.y + 200, { steps: 10 }); await page.mouse.up();
  t = (await tasks()).find((x) => x.title === 'Focus block'); assert.equal(t.time, null); console.log('unschedule ok');

  // Table
  await page.click('[data-layout="table"]');
  await shot('6-table');
  await page.click('[data-action="sort"][data-key="deadline"]');
  const firstTitle = await page.$eval('tbody tr input[data-field=title]', (e) => e.value);
  console.log('sorted by deadline, first:', firstTitle);
  const input = await page.$('tbody tr input[data-field=title]');
  await input.click({ clickCount: 3 }); await page.keyboard.type('Renamed inline'); await page.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok((await tasks()).some((x) => x.title === 'Renamed inline'), 'inline edit');
  const focused = await page.evaluate(() => document.activeElement?.dataset?.field);
  console.log('inline edit ok, focus now on:', focused);
  await page.select('[data-ui=groupBy]', 'project');
  await shot('7-table-grouped');

  await browser.close();
  if (errors.length) throw new Error('console errors:\n' + errors.join('\n'));
  console.log('no console errors');
  console.log('screenshots written to', OUT);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
