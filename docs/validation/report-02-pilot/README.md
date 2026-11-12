# Report 02: pilot (in progress)

Protocol: [VP-TF-001](../protocol-trigger-finger.md) v1.1. Raynaud's part not started.

## Session log

| Date | Who | What | App build | Notes |
| --- | --- | --- | --- | --- |
| 11 Nov 2026 | P01 (author) | Still angles, middle finger, 8 positions | live site, commit c74e3a4 | 180°-type goniometer, read by the author. Position 4: app value unreadable on the sheet, left out. |
| 11 Nov 2026 | P01 | Smooth fists and deliberate catches, 2 runs | c74e3a4 | Neither run scored: the countdown did not start on the first tries, then 9 and 7 of 10 fists were counted. Cause and fix below. |
| 12 Nov 2026 | P01 | Run 3 smooth fists, run 4 catches on fists 3, 6 and 9 | c9727ef | Both scored, 60 fps. Open hand read 146° and 151°. Middle finger: 0 false catches, 3 of 3 deliberate catches found. Thumb and little finger flagged held fists as catches; fixed below. |

## What the first session found

**Still angles (7 pairs, `data/trigger/static_angles.csv`):** with the finger bent, the app agreed with the goniometer within 7° (bias −2.8°, 6 pairs). With the finger straight, the app read 152° while the goniometer read straight (175° on its 180° scale): 23° short.

**Why the fist test failed:** the app needed a straight finger to read above 150° to start the countdown and to count each fist as opened. This hand read 146° to 155° when fully open, so the countdown kept restarting and opened fists were missed. A half-bend catch also never counted as a fist.

**Fix (next build):** the countdown now records the person's own open-hand angle, and fists are counted relative to it; short dips under the start line no longer restart the countdown; "cannot straighten" compares a finger with the same hand's other fingers. The lines are never stricter than before. A browser test with a hand that reads about 150° when open failed on the old build and passes on the new one.

## Second session: fist test works, thumb false alarms found

**Middle finger (the protocol's finger):** run 3, 10 smooth fists, no catches. Run 4, catches made on fists 3, 6 and 9, found at exactly those fists (5.0 s, 10.4 s, 15.5 s). Rows in `data/trigger/fists.csv` and `runs.csv`.

**Other fingers:** in the smooth run the thumb showed 6 catches and the little finger 1. In the catch run the little finger showed 9. Each of these was a held fist followed by a quick opening. These fingers' fists read 100° to 130°, inside the 100° to 165° "mid-bend" range, so the fist itself looked like a pause. The screening result for the smooth run was therefore "catching present", which is wrong.

**Fix:** a pause now counts only if it sits at least 15° above the bottom of the fist in the 1.5 s before it, so it has to be on the way out. Unit tests cover a held fist at 120° (not a catch) and a pause 15° above an 85° fist (a catch). The 50-person simulation gives the same numbers as before: its simulated hands never had a fist reading inside the mid-bend range, which is why it missed this.

**Expected and not a bug:** in the catch run, index and ring also paused on fists 3, 6 and 9, because the whole hand paused. A real trigger finger catches one finger. The protocol scores the middle finger only.

**Provisional pass or fail (1 person, 1 session, middle finger):**

| ID | Rule | Result | |
| --- | --- | --- | --- |
| AC-1 | Bias within ±5° | +0.9° (7 pairs) | PASS |
| AC-2 | Limits within ±15° | −19.8° to +21.5° | FAIL: the straight finger reads 23° short |
| AC-3 | ICC 0.75 or higher | needs 3 sessions | not yet |
| AC-4 | 80% or more catches found | 3 of 3 | PASS |
| AC-5 | 10% or fewer false alarms | 0 of 17 | PASS (but see thumb above) |
| AC-6 | Fewer than 1 in 5 not scored | 0 of 2 | PASS |

## Still to do

- Redo one smooth-fist run on the build with the thumb fix and check the thumb shows 0 catches.
- Raynaud's part.
- Two more volunteers.

Data rows go in `data/`; the analysis command is in the protocol.
