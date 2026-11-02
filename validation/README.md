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
