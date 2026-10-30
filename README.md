# Finger Color Recovery

**Live app:** https://finger-color.vercel.app

A browser app that measures how fast your fingertips return to their normal color after cold exposure, using only a phone camera. It was built as a first step toward low-cost, at-home tracking of cold-induced color changes in the fingers (as seen in Raynaud's phenomenon).

> Personal research tool. Not a medical device. It does not diagnose any condition.

## What it does

1. **Finds the fingertips.** MediaPipe Hand Landmarker finds 21 hand landmarks in every video frame. The app places a sampling box between each fingertip and the joint below it, plus one on the palm.
2. **Measures color.** Each box is averaged, converted from sRGB to linear RGB to CIE XYZ to **CIELAB** (a color space designed so that equal distances look like equal differences to people).
3. **Cancels room lighting.** Each fingertip is compared with the palm of the same frame (`finger − palm`). If the room gets brighter, both change together, so the difference stays stable. An optional photo grey card adds a second correction.
4. **Scores the change.** The user saves a "normal color" baseline while warm. The change score is the CIELAB distance (ΔE) from that baseline. ΔE ≈ 3 is roughly the smallest difference most people can see.
5. **Times recovery.** After the user presses *I'm Back in the Warm*, the middle-finger score is smoothed over 10 s. Recovery is the first moment it stays below a threshold for 30 s. The threshold is the larger of 10 % of the starting change and the user's own baseline noise (mean + 2 SD).
6. **Reports.** A one-page PDF report (chart, per-finger table, temperature log) and raw CSV files for research.

Everything runs on the device. Video is never uploaded.

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
