// Production smoke test: the BUILT site, served with the same headers as Vercel (vite.config.js reads
// vercel.json), loads the real MediaPipe WASM and hand model from a fake camera, opens the assistant and
// makes a PDF, with zero Content-Security-Policy violations and zero page errors.
// The main e2e test (run.mjs) replaces hand.js and runs on the dev server, so it cannot catch these.
//   npm run build && npm run smoke     (needs internet: the hand model comes from storage.googleapis.com)
import { chromium } from 'playwright';
import { preview } from 'vite';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeBlankVideo } from './video.mjs';

const video = join(mkdtempSync(join(tmpdir(), 'finger-color-smoke-')), 'blank.y4m');
writeBlankVideo(video);

const server = await preview({ preview: { port: 5299, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
const URL = 'https://127.0.0.1:5299/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
});
let failed = false;
let errorsSeen = [];
try {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  await ctx.grantPermissions(['camera']);
  const page = await ctx.newPage();
  const errors = (errorsSeen = []);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // A failed load shows up twice: as a response here (with its URL) and as a console line (without one).
  // Only /api/chat may fail: it does not exist under `vite preview`.
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/api/chat') && errors.push(`http ${r.status()}: ${r.url()}`));
  page.on('requestfailed', (r) => errors.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('console', (m) => m.type() === 'error' && !/^Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });

  const res = await page.goto(URL, { waitUntil: 'networkidle' });
  const headers = res.headers();
  assert.match(headers['content-security-policy'] || '', /default-src 'self'/, 'the CSP header is served');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(await page.textContent('#build-id'), /\w{7}/, 'the footer shows the build');

  // 1. Real camera path: WASM + 8 MB model from Google, under the CSP.
  await page.click('#tab-measure');
  await page.click('#btn-camera-start');
  // The fps text appears after the model has run on real frames (slow on a CPU-only CI machine).
  await page.waitForFunction(() => /fps/.test(document.querySelector('#tracking-state').textContent), null, { timeout: 120000 });
  console.log('ok   camera + hand model:', await page.textContent('#tracking-state'));
  // Turn the camera off again: on a machine without a GPU the model keeps the page too busy for the steps below.
  await page.click('#btn-camera');

  // 2. A PDF (jsPDF, loaded on demand) can be made under the CSP.
  await page.click('#tab-symptoms');
  await page.click('#q-raynaud button[data-v="yes"] >> nth=0');
  await page.click('#tab-result');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#result-raynaud .report-btn')]);
  assert.match(download.suggestedFilename(), /\.pdf$/);
  console.log('ok   pdf:', download.suggestedFilename());

  // 3. The assistant panel (loaded on first use) opens and answers from its built-in list.
  await page.click('#assist-launcher');
  await page.waitForSelector('#assist-panel:not(.hidden)');
  await page.click('.assist-chip >> nth=0');
  await page.waitForFunction(() => document.querySelectorAll('.assist-bot').length >= 2);
  console.log('ok   assistant');
  await page.keyboard.press('Escape');

  const csp = await page.evaluate(() => window.__csp);
  assert.deepEqual(csp, [], 'no Content-Security-Policy violations');
  assert.deepEqual(errors, [], 'no page errors and no failed loads');
  console.log('ok   no CSP violations, no page errors');
} catch (e) {
  failed = true;
  console.log('FAIL', e.message);
  const p = browser.contexts()[0]?.pages()[0];
  console.log('csp:', await p?.evaluate(() => window.__csp).catch(() => '?'), 'status:', await p?.textContent('#status').catch(() => '?'), 'errors:', errorsSeen);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
