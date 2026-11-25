# Raynaud's pilot: how to run one session

About 20 minutes for one person, one time. Protocol: [VP-RAY-001](../protocol-raynaud.md) v1.2. No cold water: a fingertip is pressed until it goes pale, and the app times how long the color takes to come back.

## Who can take part

- 18 or older.
- **Not** if they have Raynaud's, a circulation or blood-clotting problem, or a recent hand injury.
- They read this page, agree, and can stop at any time. Stop if pain or numbness lasts more than a minute.
- Code instead of name: R01, R02, R03.
- Optional: skin tone as light, medium or dark, only if they agree.

## What you need

- Laptop with finger-color.vercel.app open in Chrome (Cmd+Shift+R first).
- A second phone on a stand, filming the same hand from the side. Only the hand in the picture.
- A gray card or a plain gray piece of paper next to the hand.
- Room temperature (a phone weather app or a thermostat is fine).
- Later: two friends who have **not** seen the app's numbers, to watch the phone video.

## Setup

Hand flat on the table, palm up toward the laptop camera, 30 to 40 cm away. Plain background, normal room light, gray card in view. Open the **Raynaud's** test, choose Left or Right, press **Start camera**.

## Step 1: normal color (3 minutes)

1. Rest the hand for 2 minutes.
2. Press **Save normal color** and keep the hand still until it says saved.

## Step 2: still hand (2 minutes)

1. Press **Start recording**. Do not touch the hand for 2 minutes. Do not press "I'm warming up now".
2. Press **Stop recording**. Download **color data (CSV)** and **events (CSV)**. The result will say it cannot time a recovery; that is expected. This run measures noise.

## Step 3: presses (about 10 minutes)

Do this 6 times: 3 on the **middle** finger, then 3 on the **index** finger. One recording per press. Tip: set a phone timer for 85 s (10 + 5 + 60 + a few seconds).

1. Start the phone video. Press **Start recording** in the app.
2. Wait 10 seconds.
3. Press the fingertip firmly with the other thumb for 5 seconds. Keep the thumb out of the way of the other fingertips.
4. Let go and press **I'm warming up now** at the same moment.
5. Keep the hand still for **60 seconds**, then press **Stop recording**.
6. Download both CSVs. Write down the press number and finger.
7. Start the next press straight away. No extra rest is needed.

If a recording says "not scored", keep it, write down the reason shown, and go on.

## Step 4: rating (later, about 15 minutes per rater)

Each rater watches the phone video alone and writes, for every press, the second when the fingertip looks normal again (counting from the moment of letting go). They must not see the app's results. If the two differ by more than 1 second, a third person rates that press.

## Data sheet

| | |
| --- | --- |
| Code | R0__ |
| Date | |
| App build (bottom of the page) | |
| Room temperature | |
| Light | normal |
| Skin tone (optional) | light / medium / dark / skipped |

| Press | Finger | App result (recovery, or reason) | Rater 1 (s) | Rater 2 (s) |
| --- | --- | --- | --- | --- |
| 1 | middle | | | |
| 2 | middle | | | |
| 3 | middle | | | |
| 4 | index | | | |
| 5 | index | | | |
| 6 | index | | | |

## After the session

Send the author: the sheet photo, the still-hand CSVs, and the 6 pairs of press CSVs, each named like `R01_press3_middle_data.csv` and `R01_press3_middle_events.csv`. The phone videos stay on the phone: only the raters' numbers are needed, and the videos are deleted after rating.
