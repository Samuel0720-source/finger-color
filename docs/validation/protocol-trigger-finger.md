# Protocol VP-TF-001: Trigger finger angle and catch measurement

| | |
| --- | --- |
| Version | 1.0, 10 Nov 2026 |
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
- Finger goniometer with 1° marks.

The app reads 180° for a straight finger and the goniometer reads 0°, so the analysis uses app bend = 180° − app angle.

## Who takes part

Adults (18+) with no hand injury, ideally with a mix of skin tones and hand sizes. Each person reads a one-paragraph description and agrees before starting, and can stop at any time. Stop if anything hurts.

## Steps

Hand 30 to 40 cm from the camera, palm facing it, plain background, normal room light.

1. **Still angles.** The person holds the middle finger straight, at about 45°, at about 90° and fully bent. At each position, write down the app's live angle and the goniometer reading at the middle joint (PIP). Repeat with the index finger.
2. **Smooth fists.** Run the app's trigger finger test: 10 slow, smooth fists. Write down whether it was scored, how many catches it found (should be 0), and the frames per second.
3. **Deliberate catches.** Run the test again. On fists 3, 6 and 9, pause halfway for about half a second, then snap the finger open. Write down which fists were flagged.
4. **Repeat** steps 1 and 2 on two more days (3 sessions in total).
5. **Light.** For 3 people, repeat step 1 in dim light and in bright window light.

## Data

Participant codes only (P01, P02, ...). Names stay on paper and are never uploaded. No video is kept. Skin tone is recorded only as light, medium or dark, with the person's agreement.

Three CSV files go in the report's `data/trigger/` folder:

```
static_angles.csv  participant,session,finger,position,app_deg,gonio_deg,light,skin_group
fists.csv          participant,session,run,fist,scripted_catch,app_flagged,light
runs.csv           participant,session,run,scored,fps,light
```

`position` is `straight`, `45`, `90` or `108` (full bend). `light` is `normal`, `dim` or `bright`.

## Analysis

```
python analysis/validation/trigger.py docs/validation/<report>/data/trigger --figures docs/validation/<report>/figures
```

The script prints the pass or fail table and writes `results.json` and a Bland-Altman plot. The calculations are in `analysis/validation/stats.py`: average difference (bias), 95% limits of agreement (bias ± 1.96 × SD), ICC(2,1) on the middle finger at 90°, and simple counts for AC-4 to AC-6.

No data point is removed unless the report says which one and why.

## References

- Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *Lancet*, 1986.
- Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *Journal of Chiropractic Medicine*, 2016.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. *Psychological Bulletin*, 1979.
