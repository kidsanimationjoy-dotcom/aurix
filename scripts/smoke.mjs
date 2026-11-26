// Browser smoke test. Requires: playwright + chromium (npx playwright install chromium).
// Usage: npm run build && npm run preview, then in another shell: AURIX_URL=http://localhost:4173 npm run smoke
import { chromium } from 'playwright';

const URL_ = process.env.AURIX_URL ?? 'http://localhost:4173';
const SHOTS = process.env.AURIX_SHOTS ?? '';
const ROUTES = ['/', '/projects', '/coding', '/research', '/media', '/3d', '/agents', '/skills', '/plugins', '/mcp', '/memory', '/assets', '/usage', '/activity', '/settings'];
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION)/.test(m.text() + (m.location().url ?? ''))) problems.push(`console: ${m.text()}`); });

await page.goto(URL_ + '/#/');
await page.waitForSelector('nav a');
check('shell renders with 15 nav links', (await page.locator('nav a').count()) === 15);
check('provider ledger is honest (0 of 6)', await page.getByText('0 of 6 providers connected').isVisible());

for (const r of ROUTES) {
  await page.goto(`${URL_}/#${r}`);
  await page.waitForSelector('h1');
  const h1 = await page.locator('h1').first().innerText();
  check(`route ${r} renders "${h1}"`, h1.length > 0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/route${r === '/' ? '-home' : r.replace('/', '-')}.png` });
}

// Projects: create + persistence across reload
await page.goto(`${URL_}/#/projects`);
await page.getByPlaceholder('Customer portal').fill('Smoke project');
await page.getByRole('button', { name: 'Create project' }).click();
await page.getByRole('heading', { name: /Smoke project/ }).waitFor();
await page.reload();
await page.waitForSelector('h1');
check('project persists after reload (IndexedDB)', await page.getByRole('heading', { name: /Smoke project/ }).isVisible());

// Chat: message is saved locally and NOT claimed as delivered
await page.goto(`${URL_}/#/`);
await page.getByLabel('Message').fill('Build me a todo app');
await page.getByRole('button', { name: 'Send' }).click();
await page.getByText('saved locally, not sent').waitFor();
check('chat message is marked saved locally, not sent', true);
check('chat explains that no provider answered', await page.getByText(/Not sent to any provider/).isVisible());
await page.reload(); await page.waitForSelector('h1');
check('conversation persists after reload', await page.getByText('Build me a todo app').first().isVisible());

// Coding: file create, edit, diff, save
await page.goto(`${URL_}/#/coding`);
await page.getByLabel('New file path').fill('src/app.ts');
await page.getByRole('button', { name: 'Create file' }).click();
await page.getByLabel('Editing src/app.ts').fill('const a = 1;\n');
check('diff shows unsaved additions', await page.getByLabel('Diff of unsaved changes').getByText('const a = 1;').isVisible());
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByText('Saved', { exact: true }).waitFor({ timeout: 5000 }).catch(() => {});
check('file saved', await page.getByText('Saved', { exact: true }).isVisible());
await page.getByRole('tab', { name: 'Terminal' }).click();
check('terminal is gated, not simulated', await page.getByText(/needs the local companion/).first().isVisible());
await page.getByLabel('New file path').fill('../etc/passwd');
await page.getByRole('button', { name: 'Create file' }).click();
check('path traversal rejected', await page.getByText(/cannot contain/).isVisible());

// Audit trail captured the actions
await page.goto(`${URL_}/#/activity`);
await page.waitForSelector('table');
await page.waitForTimeout(300);
const log = await page.locator('table').innerText();
const wanted = ['project.create', 'chat.not_sent', 'file.create', 'file.save'];
const missing = wanted.filter((a) => !log.includes(a));
check('audit log recorded project, chat and file actions', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');

// Media: generate disabled
await page.goto(`${URL_}/#/media`);
check('Media generate button is disabled while disconnected', await page.getByRole('button', { name: /Generate video/ }).isDisabled());

// Mobile layout
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(`${URL_}/#/`);
await page.waitForSelector('h1');
check('mobile: menu button visible', await page.getByRole('button', { name: 'Open menu' }).isVisible());
await page.getByRole('button', { name: 'Open menu' }).click();
check('mobile: drawer navigates', await page.getByRole('link', { name: 'Settings' }).isVisible());
for (const r of ROUTES) {
  await page.goto(`${URL_}/#${r}`);
  await page.waitForSelector('h1');
  await page.waitForTimeout(350); // let the drawer transition settle
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`mobile: no horizontal overflow on ${r}`, over <= 1, over > 1 ? `by ${over}px` : '');
}
await page.goto(`${URL_}/#/`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile-home.png` });

check('no page errors or console errors', problems.length === 0, problems.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll smoke checks passed');
process.exit(failed ? 1 : 0);
