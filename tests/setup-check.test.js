// Camera setup tips: the pure check behind the three lights under the video.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSetup, MIN_FPS } from '../src/setup-check.js';
import { MIN_FPS as TEST_MIN_FPS } from '../src/tests/trigger-panel.js';

// A hand as 21 points spread over a box in the picture (0 to 1 in both directions).
const hand = (x0, y0, x1, y1) => Array.from({ length: 21 }, (_, i) => ({ x: x0 + ((x1 - x0) * (i % 5)) / 4, y: y0 + ((y1 - y0) * Math.floor(i / 5)) / 4 }));

test('a well-placed hand at a good frame rate is ready', () => {
  const c = checkSetup(hand(0.3, 0.2, 0.7, 0.8), 60);
  assert.deepEqual([c.hand.ok, c.framing.ok, c.speed.ok, c.ready], [true, true, true, true]);
});

test('no hand, a cut-off hand, a far hand and a slow camera each get their own tip', () => {
  assert.match(checkSetup(null, 60).hand.hint, /No hand found/);
  assert.match(checkSetup(hand(0.0, 0.2, 0.5, 0.8), 60).framing.hint, /edge/);
  assert.match(checkSetup(hand(0.45, 0.45, 0.6, 0.6), 60).framing.hint, /closer/);
  const slow = checkSetup(hand(0.3, 0.2, 0.7, 0.8), 16);
  assert.equal(slow.ready, false);
  assert.match(slow.speed.hint, /16 frames per second/);
});

test('the tip uses the same frame rate the timed test needs', () => {
  assert.equal(MIN_FPS, TEST_MIN_FPS);
});

test('the results file the website reads is valid JSON and has what the page shows', () => {
  const r = JSON.parse(readFileSync(new URL('../docs/validation/report-02-pilot/data/trigger/results.json', import.meta.url), 'utf8'));
  for (const k of ['people', 'pairs', 'runs']) assert.ok(Number.isInteger(r.counts[k]), k);
  for (const id of ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5', 'AC-6']) {
    assert.equal(typeof r.checks[id].result, 'string');
    assert.ok([true, false, null].includes(r.checks[id].pass));
  }
});
