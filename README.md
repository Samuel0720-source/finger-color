# finger-color: should you see a doctor about your hands?

**Live app:** https://finger-color.vercel.app

A browser app that compares a person's hand symptoms with the hallmark features of three common conditions, using published clinical criteria, guided self-tests and a phone camera. It ends with a clear next step (from "unlikely" to "get care today") and a PDF report to bring to an appointment.

> Student research project. Not a medical device. It does not diagnose any condition. Camera thresholds are engineering values that have not been validated on patients.

## How a check works

Every condition follows the same three steps:

1. **Your symptoms.** Questions taken from the clinical criteria, plus warning signs that change the advice.
2. **Measure.** The camera (and, for carpal tunnel, three guided tests) checks the features it can.
3. **Result.** Each feature is marked *present*, *absent* or *not checked*, with how it was checked (your answer, guided test, or camera). The criteria then set one of five levels:

| Level | Meaning |
| --- | --- |
| Unlikely | Few or no hallmark features |
| Self-care | Mild pattern; self-care first, see a doctor if it does not improve |
| Routine appointment | Criteria met; book a normal appointment |
| See a doctor soon | Signs of more severe or secondary disease; within 1 to 2 weeks |
| Get care today | Red-flag sign (for example a black fingertip or a hot, swollen finger) |

The summary is generated from the table, for example: *"5 of 7 carpal tunnel features are present. Measured by camera: thumb could not reach the little finger. Guided test: Phalen test reproduces tingling (after 3 s). You reported: numbness at night ..."*

## The three conditions

| Condition | Criteria used | What the camera measures |
| --- | --- | --- |
| Raynaud's phenomenon | International consensus criteria (Maverakis et al. 2014): cold sensitivity + white/blue color change, then at least 3 of 7 supporting features. Secondary-cause signs from the Merck Manual. | Color phases (white, blue, red) per finger, number of fingers involved, whether the thumb is spared, whether the border is sharp (tip changes, finger base does not), and recovery time after rewarming |
| Trigger finger | Green grades I to IV | Catching (a stop then a snap while opening the fist), whether each finger and the thumb fully straighten and fully bend (largest and smallest joint angle) |
| Carpal tunnel syndrome | CTS-6 (score of 12 or more of 26 = likely) and NHS urgent signs | Thumb reach (opposition) test: can the thumb touch each fingertip. Phalen, Tinel and two-point tests are guided self-tests. |

## Camera methods

**Finding the hand.** MediaPipe Hand Landmarker returns 21 landmarks per frame, both in image pixels and as 3D points in meters (world landmarks).

**Color (Raynaud's).** Boxes on each fingertip, on each finger base and on the palm are averaged and converted sRGB → linear RGB → CIE XYZ → **CIELAB**. Each finger is compared with the palm in the same frame to reduce lighting effects. The change score is the CIELAB distance (ΔE) from a reference.

- Reference: a saved "normal color" baseline, or, in episode mode, the last 10 s of the recording (when the hand has warmed back up).
- A phase (white, blue, red) counts when ΔE is 6 or more in 2 of 3 consecutive samples. Red only counts after warming starts.
- Sharp border: the finger base changed less than 40% as much as the tip.
- Recovery: trailing 10 s average must stay below threshold for 30 s, at least 60 s after warming.

**Joint angles (trigger finger).** The angle at each middle (PIP) joint, and at the thumb's IP joint, from 3D vectors (`src/angles.js`). A catch is a window of at least 150 ms with less than 8° movement in the 100–165° band, followed by a gain of 25° within 120 ms. A finger is flagged as "does not straighten" or "does not bend" only when at least two other fingers reached the position, so a lazy fist does not count. Scoring needs 10 cycles, 25+ fps and no frame gap over 100 ms.

**Thumb reach (carpal tunnel).** The thumb-tip to fingertip distance divided by hand size. Below 0.2 for two frames counts as a touch; 6 s per fingertip, 20 s in total, and the hand must be tracked in at least 80% of frames. Not reaching the little finger is treated as possible thumb (thenar) weakness.

## Project structure

```
src/
  main.js            page wiring: modes, camera loop, recording, results
  questionnaire.js   Yes / No / Not sure questions, finger chips, warning signs
  result-panel.js    verdict, score, feature table, why / what to do / limits
  doctor-report.js   PDF report for a clinician
  phase-strip.js     per-finger color phase chart (white / blue / red over time)
  assess/
    levels.js          the five levels, feature helper, generated summary
    raynaud.js         consensus criteria + secondary-cause signs
    trigger.js         Green grades
    carpal.js          CTS-6 score + urgent signs
    color-analysis.js  phases, fingers involved, border, recovery from a recording
  tests/
    trigger-test.js    catch detection math
    trigger-panel.js   catching screen (five fingers including the thumb)
    reach-panel.js     thumb reach test
    cts-guided.js      Phalen (timed), Tinel and two-point cards
  camera.js, hand.js, color.js, plain.js, recovery.js, recorder.js,
  livechart.js, chart-theme.js, angles.js, draw.js, history.js, history-panel.js
tests/               node --test unit tests (assessments, color analysis, detectors)
validation/          synthetic signal benchmark (npm run benchmark)
analysis/            Python re-analysis of exported CSV files
```

## Run it

```bash
npm install
npm run dev        # https://localhost:5173 (self-signed certificate)
npm test           # unit tests
npm run benchmark  # synthetic detector benchmark
npm run build
```

Open the Network URL on a phone on the same Wi-Fi to use the back camera.

## What changed in November 2026

- Added the feature table and five-level result for all three conditions, with criteria-based questions.
- Added Raynaud's color phases, fingers involved, thumb sparing, sharp border and episode mode.
- Added thumb tracking and per-finger range to the catching test.
- Added the thumb reach test and guided Phalen, Tinel and two-point tests (CTS-6).
- Added one doctor PDF per condition.
- Removed the thumb tapping test: tapping speed is not part of any carpal tunnel criteria, so it could not support a recommendation.

## Limits

- Camera thresholds are engineering choices tested on synthetic signals and scripted e2e runs, not on real patients.
- Phone cameras change exposure and white balance. Skin tone, nail polish, lighting and hand position change color readings. Compare a person with their own reference.
- Self-done Phalen, Tinel and two-point tests are less reliable than when a clinician does them.
- Do not expose hands to cold on purpose to get a result.

## Author

Samuel Koo, Biomedical Engineering, University of Waterloo
