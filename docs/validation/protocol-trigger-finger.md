# Protocol VP-TF-001: Trigger finger angle and catch measurement

| | |
| --- | --- |
| Version | 1.2, 12 Nov 2026 (changes at the end) |
| Author | Samuel Koo |
| Applies to | Reports 01 (dry run), 02 (pilot) and 03 (full study) |

This protocol stays fixed across all three reports. If it has to change, the version number goes up and the report that follows says what changed.

## What is being tested

Whether the finger-color trigger finger test:

1. measures how far a finger bends, compared with a goniometer;
2. gives the same answer when the same hand is measured on different days;
3. finds a catch (a pause mid-bend, then a quick snap open) without flagging smooth fists.

It does not test whether the app can diagnose trigger finger. Volunteers are healthy, so this checks the measurement, not the medical result.

## Pass or fail rules

Set before any data is collected.

| ID | Measure | Pass if | Why |
| --- | --- | --- | --- |
| AC-1 | Average difference, app minus goniometer | Within ±5° | About the spread between two people using a goniometer |
| AC-2 | 95% limits of agreement | Both within ±15° | The app's own decision lines are 25° to 50° from normal (`src/assess/trigger.js`), so ±15° cannot flip a result |
| AC-3 | Repeatability, ICC over 3 sessions | 0.75 or higher | Usual cut-off for good reliability (Koo and Li, 2016) |
| AC-4 | Deliberate catches found | 80% or more | A missed catch leaves a "see a doctor soon" result unreached |
| AC-5 | Smooth fists flagged as catches | 10% or fewer | A false catch raises the result to "see a doctor soon" |
| AC-6 | Runs the app refuses to score | Fewer than 1 in 5 | A test people cannot finish is not useful |

## Equipment

- finger-color web app; record the Git commit and the browser.
- One laptop or phone camera, the same one for every session.
- Goniometer, placed on the back of the finger. Write down whether it reads 0° or 180° for a straight finger and the size of its marks.

The app reads 180° for a straight finger and the goniometer reads 0°, so the analysis uses app bend = 180° − app angle.

## Who takes part

Adults (18+) with no hand injury, ideally with a mix of skin tones and hand sizes. Each person reads a one-paragraph description and agrees before starting, and can stop at any time. Stop if anything hurts.

## Steps

Hand 30 to 40 cm from the camera, palm facing it, plain background, normal room light.

1. **Still angles.** Start the camera only (not the test). The person holds the middle finger in at least 8 positions from fully straight to fully bent. At each position, read the app's live "Middle finger" angle three times about a second apart and keep the middle value, then place the goniometer on the back of the finger over the middle joint (PIP) and read it. Exact angles do not matter; a spread from straight to fully bent does.
2. **Smooth fists.** Run the app's trigger finger test: 10 slow, smooth fists. Write down whether it was scored, the frames per second, and for each of the five fingers the number of cycles and catches (the middle finger should have 0 catches). Also write the open-hand angle from the fine print ("Your open hand read ...").
3. **Deliberate catches.** Run the test again. On fists 3, 6 and 9, make a full fist, open halfway, pause for about half a second, then snap the finger open. (A real trigger finger usually catches on the way out of a fist. A half-bend that never reaches a fist is not counted as a fist.) Write down the same numbers and the catch lines the app lists. Only the middle finger is scored; the others often pause with the hand.
4. **Repeat** steps 1 and 2 on two more days (3 sessions in total).
5. **Light.** For 3 people, repeat step 1 in dim light and in bright window light.

## Data

Participant codes only (P01, P02, ...). Names stay on paper and are never uploaded. No video is kept. Skin tone is recorded only as light, medium or dark, with the person's agreement.

Four CSV files go in the report's `data/trigger/` folder:

```
static_angles.csv  participant,session,finger,position,app_deg,gonio_deg,light,skin_group
fists.csv          participant,session,run,fist,scripted_catch,app_flagged,light
runs.csv           participant,session,run,scored,fps,light,build
finger_catches.csv participant,session,run,kind,build,open_ref_deg,finger,cycles,catches
```

`position` is `straight`, `45`, `90` or `108` (full bend). `light` is `normal`, `dim` or `bright`. `build` is the app's Git commit. `kind` is `smooth` or `catch`. Every run is written to `runs.csv`, scored or not; only scored runs have catch counts.

## Analysis

```
python analysis/validation/trigger.py docs/validation/<report>/data/trigger --figures docs/validation/<report>/figures
```

The script prints the pass or fail table and writes `results.json` and a Bland-Altman plot. `analysis/validation/make_report.py` then rebuilds the tables and figures in the report from the same files. The calculations are in `analysis/validation/stats.py`: average difference (bias), 95% limits of agreement (bias ± 1.96 × SD), ICC(2,1) on the middle finger at 90°, and simple counts for AC-4 to AC-6.

No data point is removed unless the report says which one and why.

## References

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *Lancet*, 1986.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *Journal of Chiropractic Medicine*, 2016.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. *Psychological Bulletin*, 1979.

## Changes

| Version | Date | Change | Why |
| --- | --- | --- | --- |
| 1.2 | 12 Nov 2026 | Record all five fingers' cycles and catches and the open-hand angle (`finger_catches.csv`); add `build` to `runs.csv`; record unscored runs too. Pass or fail rules unchanged. | Pilot P01: the thumb and little finger produced false catches that the middle-finger-only data hid; unscored runs on an older build were left out of the first CSV. |
| 1.1 | 11 Nov 2026 | Still angles: middle finger only, at least 8 positions, three readings per position. Catch step: full fist first, then pause on the way out. Goniometer type recorded. | Pilot P01: the app shows a live angle for the middle finger only; a half-bend catch was not counted as a fist; the goniometer used reads 180° for straight. |
| 1.0 | 10 Nov 2026 | First version | |
