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
3. **Cancels room lighting.** Each fingertip is compared with the palm of the same frame (`finger − palm`). If the room gets brighter, both change together, so the difference stays stable. An optional photo grey card adds a second correction.
4. **Scores the change.** The user saves a "normal color" baseline while warm. The change score is the CIELAB distance (ΔE) from that baseline. ΔE ≈ 3 is roughly the smallest difference most people can see.
5. **Times recovery.** After the user presses *I'm Back in the Warm*, the middle-finger score is smoothed over 10 s. Recovery is the first moment it stays below a threshold for 30 s. The threshold is the larger of 10 % of the starting change and the user's own baseline noise (mean + 2 SD).
6. **Reports.** A one-page PDF report (chart, per-finger table, temperature log) and raw CSV files for research.

Everything runs on the device. Video is never uploaded.

### Finger catching

MediaPipe also returns **world landmarks**: 3D points in meters. The angle at each finger's middle (PIP) joint is computed from the 3D vectors to the joints on either side (`src/angles.js`). A catch is a window of at least 150 ms where the angle moves less than 8° (mid-range, 100–165°), followed by a gain of at least 25° within 120 ms (`src/tests/trigger-test.js`). A window is used instead of frame-to-frame speed because the model wobbles a few degrees every frame: a frame-to-frame rule never saw the finger as "stopped" in testing.

### Thumb tapping

The thumb-tip to index-tip distance is divided by hand size (wrist to middle knuckle), so camera distance does not matter. Two limits (touch below 0.15, release above 0.30) stop small wobbles from counting as extra taps (`src/tests/tap-test.js`).

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
