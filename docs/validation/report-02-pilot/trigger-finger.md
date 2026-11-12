# Report VR-TF-02: Trigger finger, pilot

| | |
| --- | --- |
| Protocol | [VP-TF-001](../protocol-trigger-finger.md) v1.2 |
| Data | Real measurements of healthy adults. Nothing simulated. |
| Author | Samuel Koo (also participant P01 and the person who reads the goniometer) |
| Result | Draft, provisional. Numbers update from the CSV files; the written parts are dated. |

How this file works: the tables and figures between the `auto` markers are rebuilt from the CSV files by `analysis/validation/make_report.py`. When a volunteer's data is added, run it again and every number updates. The text around the tables was written on the dates shown and is not touched.

## 1. Where things stand

<!-- auto:status -->
| | |
| --- | --- |
| People | 1 (P01) |
| Person-sessions | 1 |
| Still-angle pairs | 8 (middle finger) |
| Runs | 5 (3 scored) |
| App builds | c74e3a4, c9727ef, d75db24 |
| Updated | 12 Nov 2026 |
| Status | Provisional: 1 person, healthy volunteers. Too few to decide pass or fail; the numbers show what to fix. |
<!-- /auto:status -->

## 2. What was tested

Whether the finger-color trigger finger test measures how far the middle finger bends, compared with a goniometer, and whether it finds a deliberate catch without flagging smooth fists. The healthy volunteers cannot show whether the app detects trigger finger. See the [protocol](../protocol-trigger-finger.md) for the steps and the pass or fail rules, which were fixed before any data was taken.

- **Camera and hand:** laptop camera, palm toward it, 30 to 40 cm away.
- **Reference:** a 180°-type goniometer on the back of the finger over the middle joint. It reads 180° when the finger is straight, so the bend is 180° minus the reading.
- **Bend in the app:** 180° minus the app's angle, the same way.
- **Who read what:** the author read the app and the goniometer for every pair. Volunteers held the positions.

## 3. Results

### 3.1 Pass or fail table

<!-- auto:checks -->
| ID | Rule | Result | Pass |
| --- | --- | --- | --- |
| AC-1 | Bias within ±5° | Bias +1.5° | PASS |
| AC-2 | Both 95% limits within ±15° | -17.9° to +20.9° | FAIL |
| AC-3 | ICC 0.75 or higher | Not assessed: needs 2+ sessions and 2+ people | NOT ASSESSED |
| AC-4 | 80% or more of deliberate catches found | 3 of 3 (100%) | PASS |
| AC-5 | 10% or fewer smooth fists flagged | 0 of 27 (0%) | PASS |
| AC-6 | Fewer than 1 in 5 runs not scored | 2 of 5 (40%) | FAIL |
<!-- /auto:checks -->

AC-3 (repeatability) needs the same people on at least two days. The pilot has one session each, so it is marked not assessed rather than failed. AC-6 counts every run, including those on the first build (see section 4); the table below splits them out.

### 3.2 Runs

<!-- auto:runs -->
| Person | Run | Scored | fps | Build |
| --- | --- | --- | --- | --- |
| P01 | 1 | no | not saved | c74e3a4 |
| P01 | 2 | no | not saved | c74e3a4 |
| P01 | 3 | yes | 60 | c9727ef |
| P01 | 4 | yes | 60 | c9727ef |
| P01 | 5 | yes | 59 | d75db24 |

- Build c74e3a4: 2 of 2 runs not scored.
- Build c9727ef: 0 of 2 runs not scored.
- Build d75db24: 0 of 1 runs not scored.
<!-- /auto:runs -->

### 3.3 Still angles: app against goniometer

<!-- auto:agreement -->
| Set | Pairs | Bias | 95% limits |
| --- | --- | --- | --- |
| All positions | 8 | +1.5° | -17.9° to +20.9° |
| Bent positions only (not fully straight) | 7 | -1.6° | -11.7° to +8.5° |

Fully straight finger (1 pair): the app read +23.0° more bend than the goniometer on average (range +23° to +23°). Bend = 180° minus the app angle.
<!-- /auto:agreement -->

![App bend against goniometer bend](figures/trigger-app-vs-goniometer.png)

![Bland-Altman plot](figures/trigger-bland-altman.png)

The first figure shows each pair against the line of perfect agreement. The second shows the difference for each pair; dashed lines are the 95% limits and the shaded band is the ±15° target.

### 3.4 Per person

<!-- auto:people -->
| Person | Pairs | Bias, all | Bias, bent only | Runs scored | False catches, middle | Deliberate catches found |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | 8 | +1.5° | -1.6° | 3 of 5 | 0 of 27 | 3 of 3 |
<!-- /auto:people -->

### 3.5 Catches by finger

The protocol scores the middle finger only. The app reports all five, so the others are shown here to find problems.

<!-- auto:fingers -->
**Smooth fists (every count should be 0)**

| Build | Finger | Runs | Catches in total | Runs with a catch |
| --- | --- | --- | --- | --- |
| c9727ef | Thumb | 1 | 6 | 1 |
| c9727ef | Index | 1 | 0 | 0 |
| c9727ef | Middle | 1 | 0 | 0 |
| c9727ef | Ring | 1 | 0 | 0 |
| c9727ef | Little | 1 | 1 | 1 |
| d75db24 | Thumb | 1 | 2 | 1 |
| d75db24 | Index | 1 | 0 | 0 |
| d75db24 | Middle | 1 | 0 | 0 |
| d75db24 | Ring | 1 | 0 | 0 |
| d75db24 | Little | 1 | 0 | 0 |

**Deliberate catches (the middle finger should show the scripted ones; the other fingers paused with the hand)**

| Build | Finger | Runs | Catches in total | Runs with a catch |
| --- | --- | --- | --- | --- |
| c9727ef | Thumb | 1 | 3 | 1 |
| c9727ef | Index | 1 | 3 | 1 |
| c9727ef | Middle | 1 | 3 | 1 |
| c9727ef | Ring | 1 | 5 | 1 |
| c9727ef | Little | 1 | 9 | 1 |
<!-- /auto:fingers -->

## 4. What went wrong, and what changed

Each item says what happened, why, and what was done. Nothing was removed from the data.

| Date | What happened | Cause | What was done |
| --- | --- | --- | --- |
| 11 Nov | Runs 1 and 2 were not scored (build c74e3a4). The countdown would not start with the hand held open, then 9 and 7 of 10 fists were counted. | The app wanted a straight finger to read above 150°. P01's open hand read 146° to 155°, so the countdown kept restarting and opened fists were missed. | Fixed in c9727ef ([PR #7](https://github.com/Samuel0720-source/finger-color/pull/7)): fists are counted against the person's own open-hand angle, which is measured during the countdown. The lines are never stricter than before. |
| 11 Nov | A half-bend catch was not counted as a fist. | A half-bend never reaches the fist line, so the catch had no fist to belong to. | Protocol v1.1: make a full fist, open halfway, pause about half a second, snap open. |
| 11 Nov | The straight finger read 152° in the app; the goniometer read straight. | With the palm toward the camera, depth is hard to estimate for a straight finger. A limit of the method, not a bug. | Reported as is. A side-view mode is a candidate fix for a later version; it was not tuned on one person. |
| 12 Nov | Thumb counted 6 catches on smooth fists (run 3), the little finger 1, and the screening said "catching present". | Thumb fists read 100° to 130°, inside the 100° to 165° mid-bend range, so a held fist followed by a quick opening looked like a catch. | Fixed in d75db24 ([PR #8](https://github.com/Samuel0720-source/finger-color/pull/8)): a pause must sit at least 15° above the bottom of the fist in the 1.5 s before it. Unit tests added. |
| 12 Nov | After that fix the thumb still showed 2 catches on smooth run 5. | The thumb lifts slightly inside a held fist, then opens. | Not changed. A number tuned on one person's two recordings could miss real thumb catches in others. The raw data from the other volunteers will be used to test any thumb rule. |
| 12 Nov | Still-angle pair 4 had no app value on the sheet. | The app number was written unclearly. | The author recalled 122° the next day and it was added. This is a memory, not a reading from the sheet. Without it, the bent-position bias for P01 is −2.8° (6 pairs). |
| 12 Nov | Run 4 (deliberate catches) was done on c9727ef, before the thumb fix. | The fix was made after run 4. | The middle finger rule did not change for pauses well above the fist, but this recording was not re-tested on d75db24. Run 4 will be repeated on the current build. |
| 12 Nov | Per-finger counts were not in the protocol's CSV files. | Protocol v1.1 only recorded the middle finger. | Protocol v1.2 adds `finger_catches.csv` and a `build` column in `runs.csv`. Counts are typed from the app's result screen. |

## 5. Limits

- **Few people, one rater.** The author is both a participant and the only reader of the app and the goniometer, so nothing was blinded.
- **Healthy hands only.** This does not show that the app detects trigger finger.
- **One camera, one room.** Light and skin-tone checks (protocol step 5) are not done yet.
- **Goniometer error.** Two people reading the same finger with a goniometer typically differ by about 5°. That is why AC-1 uses ±5°.
- **Straight finger.** The app reads about 150° to 155° for a finger the goniometer calls straight. This is the main reason the 95% limits are wider than ±15°.
- **Not a medical device.** The camera features use engineering thresholds that have not been validated on patients.

## 6. Next

- [ ] Repeat run 4 (deliberate catches) on the current build, P01.
- [ ] Volunteers P02 to P04: one session each, steps 1 to 3. Guide: [volunteer-guide.md](volunteer-guide.md). Add their rows to `data/trigger/` and run the report script.
- [ ] Save the raw CSV of every smooth run (the "Raw data for analysis" button) and use them to test a thumb-specific catch rule.
- [ ] Write section 7 once the volunteers' data is in.
- [ ] Report 03: 10 people, 3 sessions, two light conditions (this is where AC-3 is measured).

## 7. Findings from all volunteers

To be written when the volunteers' data has been added. It should answer, with the numbers from section 3: which acceptance rules pass, which fail, whether the thumb false catches appear in other hands, and what changes before Report 03.

## Appendix A: every still-angle pair

<!-- auto:pairs -->
| Person | Session | Position | App angle | App bend | Goniometer bend | App minus goniometer |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | 1 | straight | 152° | 28° | 5° | +23° |
| P01 | 1 | 45 | 147° | 33° | 35° | -2° |
| P01 | 1 | 45 | 136° | 44° | 50° | -6° |
| P01 | 1 | 45 | 122° | 58° | 52° | +6° |
| P01 | 1 | 45 | 115° | 65° | 61° | +4° |
| P01 | 1 | 90 | 110° | 70° | 70° | +0° |
| P01 | 1 | 90 | 100° | 80° | 87° | -7° |
| P01 | 1 | 90 | 96° | 84° | 90° | -6° |
<!-- /auto:pairs -->

## Appendix B: repeat it

```
python analysis/validation/trigger.py docs/validation/report-02-pilot/data/trigger
python analysis/validation/make_report.py docs/validation/report-02-pilot
```

The first prints the pass or fail table and writes `results.json`. The second rebuilds every table and figure in this file.

| File in `data/trigger/` | Holds |
| --- | --- |
| `static_angles.csv` | One row per still-angle pair |
| `fists.csv` | One row per fist of every scored run (scripted catch or not, flagged or not), middle finger |
| `runs.csv` | One row per run: scored or not, fps, app build |
| `finger_catches.csv` | Cycles and catches for all five fingers, per scored run, with the open-hand angle |

## References

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *Lancet*, 1986.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *Journal of Chiropractic Medicine*, 2016.
