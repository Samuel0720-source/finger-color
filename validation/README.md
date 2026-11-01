# Synthetic development evaluation — 2026-11-01

Run `npm run benchmark`. The seeded generator and every outcome are in this directory.
These 50 scenarios exercise numeric signals, not camera capture, MediaPipe landmark errors, patients, or diagnostic accuracy. They are a development suite, not a held-out validation dataset.

| Measurement | Scenarios | Outcome |
|---|---:|---|
| Tapping | 20 | Mean absolute count error 1.10 taps; mean absolute percentage error 1.375%. 19/20 exact. Same signals with former fixed thresholds: 65% mean percentage error. |
| Catch-like finger-events | 20 | Mean absolute count error 0.25 events; 19/20 exact. Five positive scenarios: 20% mean percentage error. Fifteen zero-event scenarios: zero false flags. |
| Color step recovery | 10 | Mean absolute timing difference 8.55 seconds; mean percentage difference 37.911% relative to the known instantaneous return. This is primarily intentional trailing-average latency, not an estimate of clinical accuracy. |

Tapping spans 15/30/60 fps, 1/2/3/5/8 Hz, three touching-distance offsets, and seeded noise. The missed case is 8 Hz at 15 fps: 58 of 80 taps. The 16 scenarios at 1–5 Hz are exact in these generated signals, which does not imply real-world zero error.

Catching spans smooth cycles, pause-and-release cycles, single-frame spikes, and stationary signals, at 15/30/60 fps. The missed positive case is 15 fps: 0 of 5 events. The UI now withholds a catch score below 25 fps or when frame gaps exceed 100 ms. These thresholds reduce unsupported scoring; they do not establish a validated operating range. The table reports raw detector results before that gate, including the failure.

Color inputs return abruptly to baseline at 15–33 seconds, sampled every 0.25–2 seconds. The product explicitly describes a smoothed-signal time and 30-second confirmation. Do not subtract 8.55 seconds from real results: gradual recovery and lighting changes behave differently.

Mean = sum / number of observations. Count percentage error = abs(observed - expected) / expected * 100, averaged over positive scenarios. Percentage error is undefined for expected zero, so false-event counts are reported separately. Different units and denominators are not pooled into a single accuracy percentage.

## Required next validation

- Consented video recordings with manual event timestamps and multiple raters.
- Multiple devices, lighting conditions, hand positions and skin tones; report tracking failures and excluded attempts.
- Predeclared held-out evaluation of count error, false flags per minute, repeatability, and agreement of timing estimates.
- Clinical study before making any claim about sensitivity, specificity, disease probability, or normal ranges.
