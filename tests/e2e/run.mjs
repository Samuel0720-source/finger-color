// End-to-end test: runs the real app in Chrome with a fake camera video and a fake hand model,
// answers the questions like a user would, and checks the final result and PDF for all three conditions.
//   npm run e2e         (about 2.5 minutes: the Raynaud's recording runs in real time)
//   npm run e2e -- assistant   (only the assistant checks, a few seconds)
import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeEpisodeVideo, writeBlankVideo } from './video.mjs';
import { colorHand, triggerHand, pilotHand, reachHand } from './fake-hands.mjs';

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
    executablePath: process.env.CHROME_PATH || undefined, // set this to use a Chrome that is already installed
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

// The check is three steps with one on screen at a time, so open a step before using what is in it.
const step = (page, name) => page.click('#tab-' + name);

async function pdf(page, m) {
  await step(page, 'result');
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
  await step(page, 'measure');
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

async function triggerTest(hand = triggerHand) {
  const { browser, page, errors } = await openApp(blank, hand, '#trigger');
  await answer(page, 'trigger', [['catching', 'yes'], ['fingers', 'ring'], ['fingers', 'pinky'], ['needHelp', 'no'], ['cantBend', 'no'], ['stuckBent', 'no'], ['morning', 'yes'], ['duration', 'lt6w'], ['pressTender', 'yes'], ['infection', 'no'], ['injury', 'no'], ['diabetes', 'no']]);
  await step(page, 'measure');
  await page.click('[data-hand="Left"]');
  await page.click('#btn-camera-start');
  await page.waitForTimeout(1500);
  // The app refuses to score a run with any frame gap over 100 ms. A shared CI machine sometimes
  // stalls for one frame, so, like a real user, press Start again once if the run was not scored.
  let quality = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.evaluate(() => (window.__go = undefined)); // fake hand held open during the countdown
    await page.click('#trig-start');
    await page.waitForTimeout(3300);
    await page.evaluate(() => (window.__go = performance.now()));
    await page.waitForTimeout(22500);
    quality = clean(await page.textContent('#trig-detail .quality-note').catch(() => ''));
    if (!quality) break;
    console.log(`note trigger: attempt ${attempt} not scored (${quality.match(/This attempt: [^.]*/)?.[0] || quality})`);
  }
  const r = await result(page, 'trigger');
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
  await step(page, 'measure');
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

// The assistant: built-in answers with no AI, then a pretend AI to check that only allowlisted
// actions become buttons, that a result is never sent without the user pressing the button, and
// that the chat still answers when the AI fails.
async function assistantTest() {
  const { browser, page, errors } = await openApp(blank, reachHand, '#carpal');
  const sent = [];
  await page.route('**/api/chat', (r) => {
    sent.push(JSON.parse(r.request().postData()));
    return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"ai_off"}' });
  });
  const lastBot = async () => clean(await page.locator('.assist-bot .assist-text').last().textContent());
  const say = async (text) => {
    await page.fill('#assist-input', text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  };
  await page.click('#assist-launcher');
  await page.waitForSelector('#assist-panel:not(.hidden)');
  // 1. A suggested question is answered on the device: no request at all.
  await page.click('.assist-chip >> nth=3');
  assert.match(await lastBot(), /allow camera access/);
  assert.equal(sent.length, 0, 'a suggested question should not use the network');
  // 2. Urgent wording gets the fixed safety text and is not sent anywhere.
  await say('my fingertip turned black');
  assert.match(await lastBot(), /today/);
  assert.equal(sent.length, 0, 'urgent text is answered on the device');
  // 3. Nothing to explain yet.
  await say('Can you explain my results?');
  assert.match(await lastBot(), /no result to explain yet/);
  assert.equal(sent.length, 0);
  // 4. The server has no key: the chat tries once, then answers from its own list. Korean in, Korean out.
  await say('카메라가 내 손을 인식 못 해');
  assert.match(await lastBot(), /카메라 사용을 허용/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].lang, 'ko');
  // 5. After that it stops asking the server, and says so when it has no answer of its own.
  await say('Can I do this with gloves on, and does hand size matter here?');
  assert.equal(sent.length, 1);
  assert.match(await lastBot(), /not available right now/);
  await browser.close();

  // 6. With a (pretend) AI: text is shown as text, unknown actions are dropped, and the button works.
  const second = await openApp(blank, reachHand, '#carpal');
  const p2 = second.page;
  const sent2 = [];
  await p2.route('**/api/chat', (r) => {
    sent2.push(JSON.parse(r.request().postData()));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ reply: '<img src=x onerror="window.__xss=1"> Pretend answer.', actions: ['go_measure', 'javascript:alert(1)'], source: 'ai' }) });
  });
  await answer(p2, 'carpal', [['numb', 'yes'], ['numbFingers', 'thumb'], ['numbFingers', 'index'], ['numbFingers', 'middle'], ['night', 'yes'], ['flick', 'yes'], ['thenar', 'no'], ['duration', '3m6m'], ['constant', 'no'], ['acute', 'no'], ['neck', 'no'], ['feet', 'no']]);
  await p2.click('#assist-launcher');
  await p2.waitForSelector('#assist-panel:not(.hidden)');
  await p2.fill('#assist-input', 'Can I do this with gloves on, and does hand size matter here?');
  await p2.keyboard.press('Enter');
  await p2.waitForSelector('.assist-bot .assist-action');
  assert.equal(await p2.evaluate(() => window.__xss), undefined, 'model text must never run as HTML');
  assert.deepEqual(await p2.$$eval('.assist-bot .assist-action', (n) => n.map((x) => x.textContent)), ['Go to Measure']);
  assert.deepEqual(Object.keys(sent2[0]).sort(), ['context', 'lang', 'messages'], 'no result may be sent with an ordinary question');
  assert.equal(sent2[0].context.mode, 'carpal');
  // 7. Explaining a result asks first, and "on this device" sends nothing.
  await p2.fill('#assist-input', 'Can you explain my results?');
  await p2.keyboard.press('Enter');
  await p2.waitForSelector('.assist-consent');
  assert.equal(sent2.length, 1, 'asking to explain must not send the result by itself');
  await p2.click('.assist-consent .assist-action >> nth=0');
  await p2.waitForTimeout(300);
  assert.equal(sent2.length, 1);
  assert.match(clean(await p2.locator('.assist-bot .assist-text').last().textContent()), /not a diagnosis/);
  // 7b. A later ordinary question must not carry that on-device explanation to the AI.
  const before = await p2.locator('.assist-bot').count();
  await p2.fill('#assist-input', 'Does the room temperature matter for this test?');
  await p2.keyboard.press('Enter');
  await p2.waitForFunction((n) => document.querySelectorAll('.assist-bot').length > n, before);
  assert.equal(sent2.length, 2);
  assert.ok(!sent2[1].messages.some((m) => /not a diagnosis/.test(m.text)), 'the on-device explanation must stay on the device');
  // 8. The action button moves to the Measure step.
  await p2.click('.assist-bot .assist-action >> nth=0');
  assert.equal(await p2.getAttribute('#tab-measure', 'aria-selected'), 'true');
  // 9. Escape closes the panel and gives focus back to the launcher.
  await p2.focus('#assist-input');
  await p2.keyboard.press('Escape');
  assert.equal(await p2.evaluate(() => document.activeElement.id), 'assist-launcher');
  await second.browser.close();
  assert.deepEqual([...errors, ...second.errors].filter((e) => !/503|502|Failed to load resource/.test(e)), []);
  return { level: 'ok', score: `${sent.length + sent2.length} requests in 9 checks` };
}

let failed = 0;
const names = ['raynaud', 'trigger', 'trigger, pilot-like hand', 'carpal', 'assistant'];
const only = process.argv[2]; // e.g. "assistant" runs just that one
const skipped = { status: 'fulfilled', value: { level: 'skipped', score: '' } };
const run = async (name, fn) => (only && only !== name ? skipped : (await Promise.allSettled([fn()]))[0]);
// The trigger tests need 25+ camera frames per second. Run them alone first, one at a time: sharing a
// small CI machine with other browsers dropped it to 16 fps, and the app (correctly) refused to score it.
// The pilot-like hand reads only ~150° when open, as a real hand did on 11 Nov 2026.
const triggerOutcome = await run('trigger', () => triggerTest());
const pilotOutcome = await run('trigger', () => triggerTest(pilotHand));
const [raynaudOutcome, carpalOutcome] = await Promise.all([run('raynaud', raynaudTest), run('carpal', carpalTest)]);
const assistantOutcome = await run('assistant', assistantTest);
const outcomes = [raynaudOutcome, triggerOutcome, pilotOutcome, carpalOutcome, assistantOutcome];
names.forEach((name, i) => {
  const o = outcomes[i];
  if (o.status === 'fulfilled') console.log(`ok   ${name}: ${o.value.level} | ${o.value.score}`);
  else {
    failed++;
    console.log(`FAIL ${name}: ${o.reason?.message}`);
  }
});
await server.close();
process.exit(failed ? 1 : 0);
