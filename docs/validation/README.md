# Validation

Does the camera measure what it claims? Each test has one fixed protocol and three reports that build on each other.

| Report | What it is | Trigger finger | Raynaud's |
| --- | --- | --- | --- |
| 01 Dry run | Simulated data with known answers, to check the analysis code | [Done](report-01-dry-run/trigger-finger.md): all answers recovered | [Done](report-01-dry-run/raynaud.md): all answers recovered |
| 02 Pilot | 3 people, 1 session: test the steps, first real numbers | Planned | Planned |
| 03 Full study | 10 people, 3 sessions, two light conditions | Planned | Planned |

Protocols: [trigger finger (VP-TF-001)](protocol-trigger-finger.md), [Raynaud's (VP-RAY-001)](protocol-raynaud.md).

Analysis code: [`analysis/validation/`](../../analysis/validation/). The dry-run check runs on every push.

No report here shows that the app can diagnose anything. Reports 02 and 03 use healthy volunteers and test the measurement only.
