# Finger Color Recovery

**Live app:** https://finger-color.vercel.app

A browser app with three hand tests that need only a phone camera:

| Test | What it measures | Related condition (screening idea only) |
| --- | --- | --- |
| Color recovery | Time for fingertips to return to normal color after cold | Raynaud's phenomenon |
| Finger catching | Middle-joint angle of each finger while making a fist; finds a stop-then-snap | Trigger finger |
| Thumb tapping | Thumb-index taps in 10 s, speed and rhythm steadiness (CV) | Reduced dexterity, e.g. carpal tunnel syndrome |

It installs to the home screen as a web app (PWA) and keeps a history of results in the browser.

> Personal research tool. Not a medical device. It does not diagnose any condition.

## What it does

1. **Finds the fingertips.** MediaPipe Hand Landmarker finds 21 hand landmarks in every video frame. The app places a sampling box between each fingertip and the joint below it, plus one on the palm.
2. **Measures color.** Each box is averaged, converted from sRGB to linear RGB to CIE XYZ to **CIELAB** (a color space designed so that equal distances look like equal differences to people).
3. **Reduces some lighting effects.** Each fingertip is compared with the palm of the same frame (`finger − palm`). This is not full lighting cancellation: exposure, shadows, and white balance still affect results. Optional grey-card correction is exported in CSV columns only and does not enter the recovery score.
4. **Scores the change.** The user saves a "normal color" baseline while warm. The change score is the CIELAB distance (ΔE) from that baseline. The reference score of 3 is a UI heuristic, not a validated clinical cutoff.
5. **Times recovery.** After the user presses *I'm Back in the Warm*, the middle-finger score is smoothed using a trailing, timestamp-based 10 s window. Recovery is the first moment it stays below a threshold for 30 s. The threshold is the larger of 10 % of the starting change and the user's own baseline noise (mean + 2 SD).
6. **Reports.** A PDF report (chart, per-finger table, temperature log) and raw CSV files for research.

Everything runs on the device. Video is never uploaded.

### Finger catching

MediaPipe also returns **world landmarks**: 3D points in meters. The angle at each finger's middle (PIP) joint is computed from the 3D vectors to the joints on either side (`src/angles.js`). A catch is a window of at least 150 ms where the angle moves less than 8° (mid-range, 100–165°), followed by a gain of at least 25° within 120 ms (`src/tests/trigger-test.js`). A window is used instead of frame-to-frame speed because the model wobbles a few degrees every frame: a frame-to-frame rule never saw the finger as "stopped" in testing.

### Thumb tapping

The thumb-tip to index-tip distance is divided by hand size (wrist to middle knuckle), to reduce scale sensitivity. Camera position and tracking errors still matter. The current UI calibrates touching and open positions for each attempt, then uses separate touch/release thresholds to limit repeated counts from small wobbles (`src/tests/tap-test.js`).

## Tech

| Part | Choice | Why |
| --- | --- | --- |
| App | Vanilla JavaScript + Vite | Small, fast, no framework to learn first |
| Hand tracking | MediaPipe Tasks Vision (WebAssembly, GPU with CPU fallback) | Runs in the browser at video frame rate |
| Chart | Chart.js | Live chart of all five fingers |
| PDF | jsPDF (loaded only when needed) | Report without a server |
| Analysis | Python, pandas, NumPy, Matplotlib | Re-computes every session from CSV and checks it matches the app |
| Hosting | Vercel | Free HTTPS hosting (the camera API needs HTTPS) |

## Project structure

```
src/
  main.js       wires the page together (buttons, loop, sampling, baseline)
  camera.js     opens the camera, tries to lock exposure and white balance
  hand.js       loads MediaPipe and returns fingertip + palm boxes
  color.js      pixel averaging, sRGB → linear → CIELAB, grey card correction
  plain.js      turns a color difference into a plain label (Paler, Bluer, ...)
  recovery.js   smoothing + recovery time algorithm
  recorder.js   stores rows and events, exports CSV
  livechart.js  live Chart.js chart
  report.js     PDF report
  angles.js     3D joint angles
  draw.js       draws the hand on the video
  history.js    saves finished tests in this browser
  history-panel.js  history chart, table and CSV
  tests/
    trigger-test.js   catch detection math
    trigger-panel.js  finger catching screen
    tap-test.js       tap counting math
    tap-panel.js      thumb tapping screen
analysis/
  analyze.py    one session → recovery time, plot, temperature correlation
  summarize.py  all sessions → summary.csv (--check compares with the app)
  noise_check.py  how much the grey card reduces noise
tests/
  color.test.html  color conversion checks against reference values
```

## Run it locally

```bash
npm install
npm run dev        # opens https://localhost:5173 (self-signed certificate)
```

Open the Network URL on your phone (same Wi-Fi) to use the back camera.

## Analyze recordings

Download the CSV files from the app into `analysis/`, then:

```bash
cd analysis
python analyze.py recovery_20261030_1752
python summarize.py --check
```

`--check` confirms the Python result equals the number the app showed (the app writes its answer into the events file).

## Limitations

- Phone cameras change exposure and white balance by themselves. The app tries to lock them, and uses the palm as a reference, but results are still affected by lighting.
- Skin tone, nail polish, and hand position change the readings. Always compare a person with their own baseline.
- Not validated against clinical equipment yet.

## Author

Samuel Koo, Biomedical Engineering (Co-op), University of Waterloo


## Redesign and reliability review (2026-10-31)

All three tests, live camera/overlay, baseline, warming marker, optional temperature log,
five-finger colors, charts, PDF, raw CSV, events CSV, and local history remain available.
The new example-results dialog uses clearly labeled synthetic values and never writes history.
The temperature log is under an expandable control. Data and events have separate download buttons
because mobile browsers can block two downloads from one click.

### Run the checks

```bash
npm ci
npm test
npm run build
```

### Measurement rules and limits

- Tapping speed is detected taps divided by the full ten-second window. A tap requires an
  open-to-close transition; starting with fingers touching is not a tap.
- A tapping score needs at least 90% tracked time, no tracking gap above 500 ms, and at
  least 150 tracked samples. These are engineering quality rules, not clinical validation.
- Catching needs ten middle-finger cycles and no tracking gaps above 500 ms; incomplete
  recordings can export raw angles but are not saved as a successful score.
- Color algorithm v2 needs at least 60 seconds after warming, no gaps above 2.5 seconds,
  and 30 actual seconds below threshold. Missing data is never interpreted as recovery.
  The exported algorithm_version event lets Python preserve the old algorithm for older files.
- Hide the page during a test and the timed test is cancelled; color data remains downloadable
  but is marked interrupted and not scored. Keep the same hand, camera, and lighting across sessions.
- A grey card only affects extra CSV columns, not the palm-referenced score or baseline.
- Do not deliberately expose hands to cold to obtain a result. Observe naturally occurring changes.
- Existing history uses previous algorithms; do not treat old and new results as directly interchangeable.

This review does not establish accuracy on real iOS/Android cameras or clinical validity.
Real-hand testing across frame rates, lighting, skin tones and camera models is still needed.

## Follow-up: interpretable movement measurements

Tapping now calibrates touching and open positions before a 3-second countdown and 10-second test. Touch thumb and index together, not the screen. Invalid tracking does not save a score. The catching result identifies per-finger pause-and-release events with timestamps and rule evidence; it is not a diagnosis or severity grade. Catch scoring requires 25+ fps and no frame gaps above 100 ms.

All three tests export PDF reports. Movement PDFs include interpretation, symptom-based care guidance, and signal/event evidence; incomplete completed attempts can export a clearly unscored report. NHS-linked symptom explanations cover Raynaud's, trigger finger and carpal tunnel without estimating disease risk from scores. Updated movement results use algorithm version 3; legacy measurements remain exportable but are excluded from current-method charts.

See [the 50-scenario evaluation](validation/README.md) and run `npm run benchmark`. This is synthetic development testing, not measured real-camera or clinical accuracy.

## Research context and consultation conclusions

Profiles now collect optional age, sex category, measured/dominant hand and setup. The three consultation outputs are recommendation, no indication identified, and insufficient information. Incomplete or conflicting negative responses cannot create reassurance; an explicit referral reason remains visible even with other missing answers. Camera performance does not alter this symptom-based conclusion.

The research panel cites Kwon et al. 2022 (DOI 10.3233/THC-228011), Table 3, with age-group spectral-frequency means. These are 15-second gyrosensor results, not interchangeable with this app's 10-second camera counts. The app deliberately does not calculate a difference, percentile, normal range or disease probability from incompatible metrics. No sex/dominance adjustment is fabricated. Color and catching show that a compatible reference is not configured.

New tapping records snapshot demographic/hand/setup context at start; symptom answers are only included in the PDF at export. The latest three matching hand/dominance/setup records are summarized by median/range. Setup equivalence is self-reported, not verified. Records without context are excluded. This is descriptive repeatability, not an accuracy or clinical validation study.

## Three-test workflow update (2026-11-01)

- A shared preparation form records hand, dominance, camera/room label and optional demographics before any test. Context is frozen during measurements and included in local history and PDFs.
- Color references are now session-only and invalidated when camera, hand or setup changes. Each finger has its own baseline noise and experimental recovery result. Incomplete attempts can export a report. The middle-finger history metric remains algorithm v2.
- Catching waits for an open tracked hand and a three-second countdown before timing ten middle-finger cycles. Reports include tracking rate, largest gap, each finger's cycles/range/events, and the measurement context.
- Tapping reports tracking coverage, sample count and gaps when an attempt cannot be scored. The detector remains algorithm v3.
- All three tests summarize the last three matching hand/dominance/setup records. History filters by hand and test; charts separate setup/hand groups. Matching remains self-reported.
- Symptom guidance retains three consultation categories, with urgent advice within the recommended category. Severe hand pain, inability to move/hold objects, or an icy cold/pale/blue hand triggers urgent advice independent of measurement. Sources: NHS finger pain, NHS inform wrist/hand/finger problems, and NHS cyanosis pages. This is not a validated emergency triage system.
- A questionnaire-only PDF is available without camera access. Appointment notes, including non-Latin notes rendered with browser fonts, stay in memory and enter PDFs only. Existing measurements and symptom summaries have separate export buttons.
- No disease probability, clinical normal range, or sensitivity/specificity claim is added. Thirty-six automated checks cover measurement math and questionnaire handling; actual camera and clinical performance remain unvalidated.

## Feature-based consultation guidance (2026-11-02)

Guidance v3 separates user-reported symptoms, camera observations, unknown features and unassessed clinical findings. A clickable left/right finger map records symptom type and surface; unmarked fingers remain unknown. Maps and surveys are memory-only and exported on request.

Raynaud context now records trigger, individual color phases, warming response and sores. Trigger-finger context records palm-side base pain and current locking. Carpal-tunnel context records sensory distribution, constant numbness and dropping objects. Tapping remains a dexterity observation, never a test of median-nerve compression. Source references: NIAMS Raynaud information and AAOS OrthoInfo trigger-finger/carpal-tunnel information (linked in the app).

Consultation reasons explain characteristic symptom combinations and persistent/worsening/function-limiting symptoms. Urgent symptoms override missing responses; blanks and contradictory answers do not produce reassurance. These are educational referral rules, not validated triage criteria or disease probabilities. No three-phase requirement, recovery cutoff, percentile or temperature-validation claim is introduced.

Completed recordings attach their actual quality and observations to feature evidence. Incomplete recordings are not scored. Catch flags can be reviewed using a local joint-angle trace and timestamp, with user confirmation exported to PDF; this is not recorded-video replay or clinical confirmation. Full reports include evidence provenance, interpretation, feature sources and rule version. Questionnaire-only PDFs explicitly exclude camera observations.

Validation: 44 automated tests, including a matrix of 40 synthetic care cases. These check code behavior, not clinical accuracy. Clinical sensitivity/specificity and real-camera measurement accuracy remain unestablished.
