# Volunteer guide: finger-color hand test

About 25 minutes, one time. You hold your hand in front of a laptop camera while Sam reads the screen and a small angle ruler (a goniometer). Nothing is recorded as video, and nothing is uploaded with your name on it.

## What you are agreeing to

- You are 18 or older and have no hand injury.
- Sam will measure how far your middle finger bends and how the app reads it, and write the numbers on paper. Your name is never in the data. You get a code (P02, P03, ...).
- Optional: say whether your skin tone is light, medium or dark. You can skip this.
- You can stop at any time. Stop if anything hurts.
- This does not check your health. The app is not a medical device and the results mean nothing about you.

## Setup (Sam)

1. Open finger-color.vercel.app in Chrome, press Cmd+Shift+R to load the newest version, and note the build: the 7 characters after "Build" at the very bottom of the page.
2. Plain background, normal room light, laptop camera at hand height.
3. Write on the sheet: code, date, goniometer type (reads 180° when straight), light.

## Part 1: still positions (10 minutes)

Camera on, test not started. Volunteer's palm faces the camera, hand 30 to 40 cm away.

1. Volunteer bends the middle finger to a position and holds it still.
2. Sam reads the app's live **Middle finger** angle three times, about a second apart, and writes the **middle** of the three numbers.
3. Sam places the goniometer on the **back** of the finger over the middle knuckle (the joint nearest the fingertip, called PIP) and writes the reading.
4. Repeat for at least **8 positions** from fully straight to fully bent. Exact angles do not matter; spread them out. Mark the fully straight one as `straight`.

## Part 2: smooth fists (5 minutes)

1. Press **Start test**. Hold the hand open until the countdown runs (3 seconds).
2. Make **10 slow, smooth fists**, opening fully each time.
3. When the results appear (or the run is not scored), open **Raw data for analysis (CSV)** and press both **Download joint angles (CSV)** and **Download run summary (CSV)**. The summary file holds scored or not, fps, the open-hand angle, cycles and catches for each finger, and the app build, so these no longer need to be written by hand. Rename the files with the code and run, for example `P03_run1_smooth_angles.csv`.

## Part 3: deliberate catches (5 minutes)

1. Run the test again.
2. On fists **3, 6 and 9**: make a **full fist**, open the hand **halfway**, **pause for about half a second**, then snap it open. All other fists are smooth.
3. Download the same two files as in Part 2.

A catch on the other fingers is normal here, because the whole hand paused. Only the middle finger is scored.

## Data sheet

| | |
| --- | --- |
| Code | P0__ |
| Date | |
| App build (commit) | |
| Goniometer type | reads 180° when straight |
| Light | normal |
| Skin tone (optional) | light / medium / dark / skipped |

**Part 1: still positions**

| # | App reading (middle of 3) | Goniometer | Straight? |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |

**Parts 2 and 3**

| | Scored? | fps | Open hand read | Thumb cyc / catch | Index | Middle | Ring | Little |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Smooth run | | | | | | | | |
| Catch run | | | | | | | | |

If a run is **not scored**, still download its run summary (it records the reason), and run it once more. The table above is a backup in case a file is lost.

## After the session (Sam)

Send Claude a photo of the sheet and the CSV files, saying which person and run each one is. Claude types the rows into the CSV files, runs the analysis and updates the report. Photos of the screen should not show the volunteer's face or name.
