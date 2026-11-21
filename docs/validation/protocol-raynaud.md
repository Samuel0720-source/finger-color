# Protocol VP-RAY-001: Finger color change and recovery time

| | |
| --- | --- |
| Version | 1.1, 20 Nov 2026 (1.0: 10 Nov 2026) |
| Author | Samuel Koo |
| Applies to | Reports 01 (dry run), 02 (pilot) and 03 (full study) |

This protocol stays fixed across all three reports. If it has to change, the version number goes up and the report that follows says what changed.

## What is being tested

Whether the finger-color Raynaud's test:

1. stays quiet when a finger's color does not change;
2. sees a fingertip go pale;
3. times the color's return close to what two people see on video;
4. gives similar times for the same person on different days.

It does not test whether the app can diagnose Raynaud's.

**Why no cold water.** A real Raynaud's episode starts with cold, and cold-water tests can harm people with circulation problems. This protocol uses a safe stand-in instead: press a fingertip until it goes pale, let go, and time how long the color takes to come back. It tests the same measurement on a smaller, faster change. Testing during real episodes needs a clinic and ethics approval.

## Pass or fail rules

Set before any data is collected. Color change is the distance from the finger's saved normal color in CIELAB units; about 3 is the smallest change a person can see.

| ID | Measure | Pass if | Why |
| --- | --- | --- | --- |
| AC-1 | Still hand for 2 minutes | 95% of samples below 3 | Noise above 3 could invent a color change |
| AC-2 | Pressed fingertips where the change goes above 3 | 90% or more | A missed pale finger is the worst error here |
| AC-3 | Recovery time, app minus raters | Within ±1 s | Small next to the seconds a pressed fingertip takes to recover |
| AC-4 | 95% limits of agreement | Both within ±3 s | One press should never be off by more than a few seconds |
| AC-5 | Repeatability, ICC over 3 sessions | 0.6 or higher | Real recovery also varies day to day, so the bar is lower than for an angle |
| AC-6 | Presses the app cannot time | Fewer than 1 in 5 | A test people cannot finish is not useful |

## Equipment

- finger-color web app; record the Git commit and the browser.
- One laptop or phone camera, the same one for every session.
- A second phone on a stand, filming the same hand, for the human raters.
- A gray card next to the hand, to show if the light or the camera's color changed.

## Who takes part

Adults (18+), ideally with a mix of skin tones. **Do not include** anyone with Raynaud's, a circulation or blood-clotting problem, or a recent hand injury. Each person reads a one-paragraph description, agrees before starting, and can stop at any time. Stop if pain or numbness lasts more than a minute.

## Steps

Hand flat on a table, palm up toward the camera, 30 to 40 cm away, plain background, gray card in view. Write down the room temperature.

1. **Normal color.** Rest the hand for 2 minutes, then save the normal color in the app.
2. **Still hand.** Record for 2 minutes without touching the hand (checks AC-1).
3. **Press.** Start a recording, wait 20 s, press the middle fingertip firmly with the other thumb for 5 s, then let go and tap "I'm warming up now" at the same moment. Keep still for 60 s, then press Stop recording. Download both CSV files (color data and events).
4. **Repeat** step 3 five times on the middle finger and five times on the index finger, with a minute's rest between presses.
5. **Rate.** Later, two people who have not seen the app's numbers watch the second phone's video and each mark the moment the fingertip looks normal again. If they differ by more than 1 s, a third person rates.
6. **Repeat** steps 1 to 4 on two more days (3 sessions in total).
7. **Light.** For 3 people, repeat steps 2 and 3 in dim light and in bright window light.

## Changes in 1.1 (before any pilot data)

- Step 3: keep still **60 s** after letting go, not 30 s. The app does not time a recording with less than 60 s after "I'm warming up now", so with 30 s every press would have been "not scored".
- Known before data, rules not changed: the app was built for episodes that take minutes. It averages the color over the last 10 seconds and calls the finger recovered when it stays near normal for 30 seconds. A pressed fingertip usually recovers in a few seconds, so the app's times are expected to come out later than the raters' and AC-3 and AC-4 may fail. If they do, Report 02 says so; a short-recovery mode would be a change for Report 03, tested on new people.

## Data

Participant codes only. The app keeps no video; the rating videos show only the hand, stay off GitHub and are deleted after rating. Skin tone is recorded only as light, medium or dark, with the person's agreement.

Two CSV files go in the report's `data/raynaud/` folder:

```
noise.csv    participant,session,t_s,color_change,light
presses.csv  participant,session,finger,press,peak_change,app_recovery_s,rater1_s,rater2_s,light,skin_group
```

Leave `app_recovery_s` empty when the app could not time that press.

## Analysis

```
python analysis/validation/raynaud.py docs/validation/<report>/data/raynaud --figures docs/validation/<report>/figures
```

The script prints the pass or fail table and writes `results.json` and a Bland-Altman plot. Reference time is the average of the two raters. ICC(2,1) uses each person's average recovery time per session.

No data point is removed unless the report says which one and why.

## References

- Bland JM, Altman DG. *Lancet*, 1986.
- Koo TK, Li MY. *Journal of Chiropractic Medicine*, 2016.
- Maverakis E, et al. International consensus criteria for the diagnosis of Raynaud's phenomenon. *Journal of Autoimmunity*, 2014.
