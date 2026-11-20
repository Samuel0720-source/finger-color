# Report 02: pilot (in progress)

**Trigger finger report:** [trigger-finger.md](trigger-finger.md) (tables and figures rebuild from the CSV files). **For volunteers:** [volunteer-guide.md](volunteer-guide.md). This page is the session log.

Protocol: [VP-TF-001](../protocol-trigger-finger.md) v1.2. Raynaud's part not started.

## Session log

| Date | Who | What | App build | Notes |
| --- | --- | --- | --- | --- |
| 11 Nov 2026 | P01 (author) | Still angles, middle finger, 8 positions | live site, commit c74e3a4 | 180°-type goniometer, read by the author. Position 4: app value unreadable on the sheet; the author recalled 122° on 12 Nov and it was added. |
| 11 Nov 2026 | P01 | Smooth fists and deliberate catches, 2 runs | c74e3a4 | Neither run scored: the countdown did not start on the first tries, then 9 and 7 of 10 fists were counted. Cause and fix below. |
| 12 Nov 2026 | P02 (friend of the author) | Run 1 smooth fists | d75db24 | Scored on the first try, 60 fps, open middle finger read 141°. Middle 0 catches; thumb 3 (false). Raw CSV saved. No still angles or catch run yet. |
| 12 Nov 2026 | P01 | Run 5 smooth fists, after the thumb fix | d75db24 | Scored, 59 fps, open hand 154°. Middle 0 catches. Thumb 2 (was 6), all other fingers 0. |
| 12 Nov 2026 | P01, P02 | P01 run 6 and P02 run 2: deliberate catches on fists 3, 6, 9 (raw CSVs); a second sheet of 8 still-angle pairs (entered as P01 session 2) | not recorded | Replay finds 3 of 3 middle-finger catches in each run. Bent pairs within 5° of the goniometer; straight pair 21° short. The thumb rule tested on these runs failed, so it was not added. |
| 20 Nov 2026 | P02 | 8 still-angle pairs (middle finger) | not recorded | Within −10.6° to +9.6° of the goniometer; the straight finger read 8° of bend against 2°. |
| 20 Nov 2026 | P03 | Run 1 smooth fists, run 2 deliberate catches (raw and summary CSVs) | caff658 | Both scored, 60 and 59 fps, open middle finger 141° and 142°. Middle: 0 false catches, but 0 of 3 deliberate catches found (made from an open hand; see the report). Thumb: 3 false catches in the smooth run. |
| 12 Nov 2026 | P01 | Run 3 smooth fists, run 4 catches on fists 3, 6 and 9 | c9727ef | Both scored, 60 fps. Open hand read 146° and 151°. Middle finger: 0 false catches, 3 of 3 deliberate catches found. Thumb and little finger flagged held fists as catches; fixed below. |

## What the first session found

**Still angles (8 pairs, `data/trigger/static_angles.csv`):** with the finger bent, the app agreed with the goniometer (bias −1.6°, limits −11.7° to +8.5°, 7 pairs). With the finger straight, the app read 152° while the goniometer read straight (175° on its 180° scale): 23° short.

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
| AC-1 | Bias within ±5° | +1.5° (8 pairs) | PASS |
| AC-2 | Limits within ±15° | −17.9° to +20.9° | FAIL: the straight finger reads 23° short |
| AC-3 | ICC 0.75 or higher | needs 3 sessions | not yet |
| AC-4 | 80% or more catches found | 3 of 3 | PASS |
| AC-5 | 10% or fewer false alarms | 0 of 27 | PASS (but see thumb below) |
| AC-6 | Fewer than 1 in 5 not scored | 2 of 5 (both on the first build, 0 of 3 since) | FAIL as counted |

**After the fix (run 5):** thumb false catches fell from 6 to 2; the little finger went to 0. The two left are the thumb lifting slightly inside a held fist and then opening. The thumb moves sideways to the camera and folds differently from the fingers, so one rule may not fit both. Not tuned further on one person's runs: next step is to save the raw CSV of smooth runs and test any thumb rule on those recordings.

## Still to do

- Save raw CSVs of smooth runs (all volunteers) to test a thumb-specific catch rule on real recordings.
- Raynaud's part.
- Two more volunteers.

Data rows go in `data/`; the analysis command is in the protocol.
