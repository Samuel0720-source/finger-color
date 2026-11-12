# Report 02: pilot (in progress)

Protocol: [VP-TF-001](../protocol-trigger-finger.md) v1.1. Raynaud's part not started.

## Session log

| Date | Who | What | App build | Notes |
| --- | --- | --- | --- | --- |
| 11 Nov 2026 | P01 (author) | Still angles, middle finger, 8 positions | live site, commit c74e3a4 | 180°-type goniometer, read by the author. Position 4: app value unreadable on the sheet, left out. |
| 11 Nov 2026 | P01 | Smooth fists and deliberate catches, 2 runs | c74e3a4 | Neither run scored: the countdown did not start on the first tries, then 9 and 7 of 10 fists were counted. Cause and fix below. |

## What the first session found

**Still angles (7 pairs, `data/trigger/static_angles.csv`):** with the finger bent, the app agreed with the goniometer within 7° (bias −2.8°, 6 pairs). With the finger straight, the app read 152° while the goniometer read straight (175° on its 180° scale): 23° short.

**Why the fist test failed:** the app needed a straight finger to read above 150° to start the countdown and to count each fist as opened. This hand read 146° to 155° when fully open, so the countdown kept restarting and opened fists were missed. A half-bend catch also never counted as a fist.

**Fix (next build):** the countdown now records the person's own open-hand angle, and fists are counted relative to it; short dips under the start line no longer restart the countdown; "cannot straighten" compares a finger with the same hand's other fingers. The lines are never stricter than before. A browser test with a hand that reads about 150° when open failed on the old build and passes on the new one.

## Still to do

- Redo the smooth-fist and catch runs (steps 2 and 3) on the new build.
- Raynaud's part.
- Two more volunteers.

Data rows go in `data/`; the analysis command is in the protocol.
