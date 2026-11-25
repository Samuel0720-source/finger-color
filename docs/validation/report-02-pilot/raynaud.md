# Report VR-RAY-02: Raynaud's color test, pilot

| | |
| --- | --- |
| Protocol | [VP-RAY-001](../protocol-raynaud.md) v1.2 (from 24 Nov: 3 presses per finger, 10 s wait, no extra rest) |
| Data | Real recordings of a healthy adult. Nothing simulated. |
| Author | Samuel Koo (also participant R01) |
| Result | Started 24 Nov 2026. One person: still hand, 3 index and 3 middle presses (one data file still to be added). Raters still to come. |

Session steps: [raynaud-guide.md](raynaud-guide.md). Data: `data/raynaud/` (`noise.csv`, `presses.csv`, and the app's own files in `raw/`).

## 1. Where things stand (24 Nov 2026)

| | |
| --- | --- |
| People | 1 (R01, the author) |
| Still-hand recordings | 1 (157 s) |
| Protocol presses (middle or index) | 6 of 6 recorded; 5 analysed (middle press 1: color data file not yet received) |
| Practice presses (thumb, outside the protocol) | 3 |
| Rater times | none yet |

## 2. Pass or fail so far

| ID | Rule | Result | Pass |
| --- | --- | --- | --- |
| AC-1 | Still hand: 95% of samples below 3 | 46% below 3 (95th percentile 11.5), middle finger | FAIL |
| AC-2 | 90% or more presses seen (peak above 3) | 5 of 5 | PASS |
| AC-3, AC-4 | Recovery time against raters | No press timed yet, no rater times yet | Not yet |
| AC-5 | Repeatability | Needs 2+ people and 2+ sessions | Not yet |
| AC-6 | Fewer than 1 in 5 presses not timed | 5 of 5 not timed | FAIL |

Rerun with `python analysis/validation/raynaud.py docs/validation/report-02-pilot/data/raynaud`.

### The presses

| Press | Peak change in the index tip | Recording after letting go | App result |
| --- | --- | --- | --- |
| Index 1 | 18.6 | 59.0 s | Not timed: needs 60 s |
| Index 2 | 11.4 | 58.9 s | Not timed: needs 60 s |
| Index 3 | 26.4 | 58.2 s | Not timed: needs 60 s |
| Middle 1 | not yet | 60 s or more (events file) | Color data file not yet received |
| Middle 2 | 25.2 | 55.0 s | Not timed: needs 60 s |
| Middle 3 | 21.6 | 68.4 s | Not timed: the color never stayed within the noise level (1.7) for 30 s |

Every press was seen clearly. Four recordings were stopped before the 60 s the app needs. Middle press 3 ran long enough, but the app still gave no time: after letting go, the middle finger stayed between about 1 and 3, never below the saved noise level of 1.7 for 30 s in a row. The still-hand recording already showed changes above 1.7 with nothing happening, so this recovery line is stricter than the camera's own noise. The other fingers also jumped during each press (thumb up to 18.8, little finger up to 20.4), probably because the pressing hand moved into view or shaded the hand. "Peak above 3" in the pressed finger alone therefore says the change was seen, not that it was only in that finger.

## 3. What the still-hand recording shows

The hand was kept still for 157 s after the normal color was saved (noise at saving: 1.7). The color change should stay near 0 the whole time. Median change in each part of the recording:

| Time | Thumb | Index | Middle | Ring | Little |
| --- | --- | --- | --- | --- | --- |
| 0 to 80 s | 4.3 | 2.6 | 2.1 | 2.6 | 4.9 |
| 80 to 100 s | 5.2 | 5.5 | 2.4 | 3.3 | 5.0 |
| 100 to 143 s | 6.0 | 6.2 | 8.1 | 7.0 | 10.3 |
| 143 to 157 s | 10.2 | 12.4 | 11.6 | 11.8 | 15.1 |

The change jumps at about 100 s and 143 s in **all five fingers at once**, and every finger turns "Darker". A real color change would not hit every finger at the same second. The likely cause is the scene, not the skin: the hand moved, or the light or the camera's automatic exposure changed. In the first 80 s the middle finger was below 3 in 76% of samples, still short of 95%.

## 4. What went wrong, and what changed

| Date | What happened | Cause | What was done |
| --- | --- | --- | --- |
| 24 Nov | AC-1 fails on the first still recording (46% below 3). | Steps in color change across all fingers at once, so scene or camera, not skin. | Counted as is. Before the next recordings: mark the hand's place on the table, keep the room light fixed (no window light), and do not touch the laptop. If the steps remain in a second recording with these in place, the camera's automatic exposure is the next suspect. |
| 24 Nov | Three thumb presses were recorded before the protocol presses. | Practice; the protocol presses the middle and index fingers. Each was stopped 18 to 25 s after letting go, so the app could not time them (it needs 60 s). | Kept as `raw/R01_practice_thumb*.csv` and not counted in AC-2 to AC-6, because the thumb is not a protocol finger. Even in these, fingers that were not pressed showed changes of 5 to 17 from the start, the same scene problem as above. |
| 24 Nov | Index presses 1 to 3 were not timed (AC-6: 3 of 3). | Stopped 58 to 59 s after "I'm warming up now"; the app needs 60 s. The app gives no signal when 60 s has passed. | Counted as not timed; not repeated. For the middle presses: wait at least 65 s (timer 90 s per press). App idea for Report 03: show a countdown after "I'm warming up now" and enable Stop only after 60 s. |
| 24 Nov | Middle press 3 ran 68 s but was not timed. | The recovery line is the noise level measured when the normal color was saved (1.7). Real still-hand noise in this setup was higher (section 3), so the color never counted as back to normal. | Counted as not timed. Question for Report 03, to be decided before new data: base the line on a still recording rather than on the few seconds used to save the normal color. |

## 5. Next

- [x] R01: 3 index presses (24 Nov), none timed.
- [x] R01: 3 middle presses (24 Nov). Middle 1 color data file still to be added.
- [ ] Second still-hand recording with the hand position marked and the light fixed.
- [ ] Two raters for each press, from the phone video, before they see the app's numbers.
- [ ] R02 and R03.
