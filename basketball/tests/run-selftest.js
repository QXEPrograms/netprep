// Headless run of the in-game self-test (index.html?selftest).
// usage: node basketball/tests/run-selftest.js   (needs Playwright + Chromium)
// Exit code 0 = all passed.
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?selftest');
  await page.waitForFunction(() => window.__SELFTEST, null, { timeout: 600000, polling: 1000 });
  const r = await page.evaluate(() => window.__SELFTEST);
  for (const t of r.results) console.log(`${t.ok ? 'PASS' : 'FAIL'}  ${t.name}  ${t.info}`);
  console.log(`\n${r.passed} passed, ${r.failed} failed (${r.seconds}s)`);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
  process.exit(r.failed || errors.length ? 1 : 0);
})();
