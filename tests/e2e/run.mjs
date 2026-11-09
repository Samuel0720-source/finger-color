// End-to-end test: runs the real app in Chrome with a fake camera video and a fake hand model,
// answers the questions like a user would, and checks the final result and PDF for all three conditions.
//   npm run e2e         (about 2.5 minutes: the Raynaud's recording runs in real time)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEpisodeVideo, writeBlankVideo } from './video.mjs';
import { colorHand, triggerHand, reachHand } from './fake-hands.mjs';

const dir = mkdtempSync(join(tmpdir(), 'finger-color-e2e-'));
const episode = join(dir, 'episode.y4m');
const blank = join(dir, 'blank.y4m');
writeEpisodeVideo(episode);
writeBlankVideo(blank);

const server = await createServer({ server: { port: 5199, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
await server.listen();
const URL = 'https://127.0.0.1:5199/';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function openApp(video, fakeHand, hash) {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, acceptDownloads: true });
  await ctx.grantPermissions(['camera']);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('**/src/hand.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: fakeHand }));
  await page.goto(URL + hash, { waitUntil: 'networkidle' });
  return { browser, page, errors };
}

async function answer(page, form, list) {
  for (const [id, v] of list) await page.click(`#q-${form} button[data-q="${id}"][data-v="${v}"]`);
}

async function result(page, m) {
  return {
    verdict: clean(await page.textContent(`#result-${m} .verdict-main`)),
    score: clean(await page.textContent(`#result-${m} .score`)),
    level: await page.$eval(`.cond[data-mode="${m}"]`, (e) => e.dataset.level),
  };
}

async function pdf(page, m) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(`#result-${m} .report-btn`)]);
  const file = join(dir, d.suggestedFilename());
  await d.saveAs(file);
  const bytes = readFileSync(file);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-', `${m}: download is not a PDF`);
  return bytes.length;
}

async function raynaudTest() {
  const { browser, page, errors } = await openApp(episode, colorHand, '#raynaud');
  await answer(page, 'raynaud', [['cold', 'yes'], ['white', 'yes'], ['blue', 'unsure'], ['bothHands', 'yes'], ['numb', 'yes'], ['otherTriggers', 'no'], ['otherSites', 'no'], ['photos', 'no'], ['after40', 'no'], ['oneSide', 'no'], ['severePain', 'no'], ['sores', 'no'], ['otherSymptoms', 'no'], ['deadTissue', 'no']]);
  await page.click('[data-hand="Right"]');
  const t0 = Date.now();
  const at = (s) => page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  await page.click('#btn-camera-start');
  await at(1.5);
  await page.click('#btn-record');
  await at(45);
  await page.click('#btn-warm');
  await at(130);
  await page.click('#btn-record');
  await page.waitForTimeout(1000);
  const r = await result(page, 'raynaud');
  const detail = clean(await page.textContent('#color-detail'));
  const size = await pdf(page, 'raynaud');
  await browser.close();
  assert.equal(r.level, 'routine', r.verdict);
  assert.match(r.verdict, /white \(pale\) phase \(index, middle, ring\)/);
  assert.match(r.verdict, /thumb spared/);
  assert.match(detail, /last 10 seconds/);
  assert.ok(size > 3000, 'PDF is almost empty');
  assert.deepEqual(errors, []);
  return r;
}

async function triggerTest() {
  const { browser, page, errors } = await openApp(blank, triggerHand, '#trigger');
  await answer(page, 'trigger', [['catching', 'yes'], ['fingers', 'ring'], ['fingers', 'pinky'], ['needHelp', 'no'], ['cantBend', 'no'], ['stuckBent', 'no'], ['morning', 'yes'], ['duration', 'lt6w'], ['pressTender', 'yes'], ['infection', 'no'], ['injury', 'no'], ['diabetes', 'no']]);
  await page.click('[data-hand="Left"]');
  await page.click('#btn-camera-start');
  await page.waitForTimeout(1500);
  await page.click('#trig-start');
  await page.waitForTimeout(3300);
  await page.evaluate(() => (window.__go = performance.now()));
  await page.waitForTimeout(22500);
  const r = await result(page, 'trigger');
  const quality = clean(await page.textContent('#trig-detail .quality-note').catch(() => ''));
  const size = await pdf(page, 'trigger');
  await browser.close();
  assert.equal(r.level, 'soon', quality ? `camera test not scored: ${quality}` : r.verdict);
  assert.match(r.score, /III/);
  assert.match(r.verdict, /catching or snapping \(ring\)/);
  assert.ok(size > 3000, 'PDF is almost empty');
  assert.deepEqual(errors, []);
  return r;
}

async function carpalTest() {
  const { browser, page, errors } = await openApp(blank, reachHand, '#carpal');
  await answer(page, 'carpal', [['numb', 'yes'], ['numbFingers', 'thumb'], ['numbFingers', 'index'], ['numbFingers', 'middle'], ['night', 'yes'], ['flick', 'yes'], ['thenar', 'no'], ['duration', '3m6m'], ['constant', 'no'], ['acute', 'no'], ['neck', 'no'], ['feet', 'no']]);
  assert.match((await result(page, 'carpal')).score, /7\.5/);
  await page.click('#phalen-start');
  await page.waitForTimeout(2100);
  await page.click('#phalen-onset');
  assert.match((await result(page, 'carpal')).score, /12\.5/, 'Phalen should update the score at once');
  await page.click('#g-tinel .seg[data-v="no"]');
  await page.click('#g-twoPoint .seg[data-v="no"]');
  await page.click('[data-hand="Right"]');
  await page.click('#btn-camera-start');
  await page.waitForTimeout(1500);
  await page.click('#reach-start');
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window.__go = performance.now()));
  await page.waitForTimeout(12500);
  const r = await result(page, 'carpal');
  const size = await pdf(page, 'carpal');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  await browser.close();
  assert.equal(r.level, 'soon', r.verdict);
  assert.match(r.score, /17\.5/);
  assert.ok(size > 3000, 'PDF is almost empty');
  assert.ok(scrollWidth <= 390, `page scrolls sideways on a phone (${scrollWidth}px)`);
  assert.deepEqual(errors, []);
  return r;
}

let failed = 0;
const tests = { raynaud: raynaudTest, trigger: triggerTest, carpal: carpalTest };
// The trigger test needs 25+ camera frames per second. Run it alone first: sharing a small CI machine
// with the other two browsers dropped it to 16 fps, and the app (correctly) refused to score it.
const [triggerOutcome] = await Promise.allSettled([triggerTest()]);
const [raynaudOutcome, carpalOutcome] = await Promise.allSettled([raynaudTest(), carpalTest()]);
const outcomes = [raynaudOutcome, triggerOutcome, carpalOutcome];
Object.keys(tests).forEach((name, i) => {
  const o = outcomes[i];
  if (o.status === 'fulfilled') console.log(`ok   ${name}: ${o.value.level} | ${o.value.score}`);
  else {
    failed++;
    console.log(`FAIL ${name}: ${o.reason?.message}`);
  }
});
await server.close();
process.exit(failed ? 1 : 0);
