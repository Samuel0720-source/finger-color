# Synthetic development evaluation — 2026-11-02

The thumb tapping test was removed from the app on 2026-11-02, so its 20 scenarios were removed here too.

Run `npm run benchmark`. The seeded generator and every outcome are in this directory.
These 30 scenarios exercise numeric signals, not camera capture, MediaPipe landmark errors, patients, or diagnostic accuracy. They are a development suite, not a held-out validation dataset.

| Measurement | Scenarios | Outcome |
|---|---:|---|
| Catch-like finger-events | 20 | Mean absolute count error 0.25 events; 19/20 exact. Five positive scenarios: 20% mean percentage error. Fifteen zero-event scenarios: zero false flags. |
| Color step recovery | 10 | Mean absolute timing difference 8.55 seconds; mean percentage difference 37.911% relative to the known instantaneous return. This is primarily intentional trailing-average latency, not an estimate of clinical accuracy. |

Catching spans smooth cycles, pause-and-release cycles, single-frame spikes, and stationary signals, at 15/30/60 fps. The missed positive case is 15 fps: 0 of 5 events. The UI now withholds a catch score below 25 fps or when frame gaps exceed 100 ms. These thresholds reduce unsupported scoring; they do not establish a validated operating range. The table reports raw detector results before that gate, including the failure.

Color inputs return abruptly to baseline at 15–33 seconds, sampled every 0.25–2 seconds. The product explicitly describes a smoothed-signal time and 30-second confirmation. Do not subtract 8.55 seconds from real results: gradual recovery and lighting changes behave differently.

Mean = sum / number of observations. Count percentage error = abs(observed - expected) / expected * 100, averaged over positive scenarios. Percentage error is undefined for expected zero, so false-event counts are reported separately. Different units and denominators are not pooled into a single accuracy percentage.

## Required next validation

- Consented video recordings with manual event timestamps and multiple raters.
- Multiple devices, lighting conditions, hand positions and skin tones; report tracking failures and excluded attempts.
- Predeclared held-out evaluation of count error, false flags per minute, repeatability, and agreement of timing estimates.
- Clinical study before making any claim about sensitivity, specificity, disease probability, or normal ranges.

---

# Simulated population test — 2026-11-03

Run `npm run population`. Code: `population.mjs`. Every person and outcome: `population-results.json`.

**What it is.** 50 synthetic people with different skin types (Fitzpatrick I–VI, palm side), room light (daylight, warm indoor, cool office, dim), ages (18 to 75+), hand sizes and stiff (arthritis-like) fingers, and a known true state for each condition (Raynaud's none / primary / white-red only / secondary; trigger finger none or Green I–IV; carpal tunnel none / mild / moderate / severe).

- Skin color comes from a simple light-absorption model: melanin plus oxygenated and deoxygenated hemoglobin, using published absorption values (Prahl, OMLC) at the wavelengths a phone camera's red, green and blue pixels see. More melanin means less of the blood color change reaches the camera.
- Answers are imperfect: 8% "Not sure", 6% wrong, and darker-skinned people are often unsure whether their fingers turned blue.
- Joint angles get tracking jitter; dim light drops frames.

**What it compares.** The *reference* is the app's own criteria given perfect information (correct answers, noise-free camera). The *app* result uses the realistic inputs. When they differ, the test swaps in perfect answers or a perfect camera to find the cause. Each person has a fixed random stream, so the same 50 people make the same mistakes before and after a code change.

**What it is not.** Not real people, not real skin, not a clinical study. The reference is the app's criteria, not a doctor. It finds weaknesses in the code; it cannot show the app is accurate.

## Before and after the fixes (same 50 people)

| | Before (`30757ee`) | After |
|---|---|---|
| Raynaud's under-triage (app less urgent than reference) | 5 | 3 |
| Raynaud's: healthy people with a false color change | 4 of 16 (all in dim light) | 0 of 16 |
| Trigger finger under-triage | 0 | 0 |
| Carpal tunnel under-triage | 8 (6 caused by the camera) | 3 (2 by the camera) |

Over-triage (app more urgent) rose for Raynaud's from 3 to 7. All of it comes from simulated wrong answers to warning-sign questions, which now count even when the full criteria are not met. This is the intended safe direction.

## Problems found, and what changed

1. **"Not sure" ended the check as "unlikely".** Answering "Not sure" to the first Raynaud's or carpal tunnel question gave "unlikely", even when the camera had seen a white phase or Phalen's test was positive. Now only a clear "No" with no other evidence gives "unlikely".
2. **The urgent question could be hidden.** The Raynaud's warning-sign section, including the urgent "black finger" question, only appeared after a "Yes" to cold. It now appears after any answer.
3. **Warning signs depended on the blue phase.** Fingertip sores and secondary-cause signs were only checked when the full criteria were met. If the blue phase was missed, they were ignored. Sores now always mean "see a doctor soon", and secondary signs count with any color change.
4. **Dim light made healthy hands look like Raynaud's.** In dim light the color of a still hand wobbled by 5.0–7.4, compared with 1.5–3.9 in normal light. That is close to the phase threshold of 6, and noise alone marked all five fingers as changed in 4 of 4 healthy people. Recordings whose steady-hand noise is 4.5 or more (¾ of the threshold) are now not scored, and the user is asked for more light.
5. **Tracking jitter faked thumb touches.** A thumb that stopped just short of the little finger was often counted as a touch, which hid thumb weakness. A touch now needs 5 frames in a row (about 0.17 s) instead of 2.

## Still open (documented, not changed)

- **Blue phase on the darkest skin.** In 10 targeted episodes per cell, the blue phase was seen 10/10 on skin types I–IV under every light, but only 7–8/10 on type VI under indoor light. Melanin shrinks the blue change (5.5 vs the threshold of 6). The threshold was not lowered, because without real recordings the false alarms that would cause cannot be measured. The app's limits now say this, and a missed blue phase leads to "self-care, capture another episode", not "unlikely".
- **Dim light.** All 12 trigger-finger tests in dim light failed the quality gate, which needs 25+ fps and no gap over 100 ms. They were not scored rather than scored wrongly, but these users need brighter light.
- **Stiff fingers.** Arthritis-like stiffness can stop the thumb reaching the little finger, which the app reads as possible thumb weakness. The explanation now mentions joint stiffness. A doctor tells these apart.
- **One wrong answer to a warning-sign question escalates the advice.** This is by design: warning signs should not need two answers to count.
