# Validation

Does the camera measure what it claims? Each test has one fixed protocol and three reports that build on each other.

| Report | What it is | Trigger finger | Raynaud's |
| --- | --- | --- | --- |
| 01 Dry run | Simulated data with known answers, to check the analysis code | [Done](report-01-dry-run/trigger-finger.md): all answers recovered | [Done](report-01-dry-run/raynaud.md): all answers recovered |
| 02 Pilot | 3 people, 1 session: test the steps, first real numbers | [Pilot done, 3 people](report-02-pilot/trigger-finger.md): AC-1 and AC-5 pass; AC-2 (by under 1°), AC-4 (9 of 12) and AC-6 (2 of 10) fail; AC-3 needs Report 03 | [Started](report-02-pilot/raynaud.md): 1 person, still hand and 6 presses (none timed); AC-2 passes, AC-1 and AC-6 fail so far |
| 03 Full study | 10 people, 3 sessions, two light conditions | Planned | Planned |

Pilot results in one document: [report-02-pilot/pilot-report-2026.pdf](report-02-pilot/pilot-report-2026.pdf).

Protocols: [trigger finger (VP-TF-001)](protocol-trigger-finger.md), [Raynaud's (VP-RAY-001)](protocol-raynaud.md).

Analysis code: [`analysis/validation/`](../../analysis/validation/). The dry-run check runs on every push.

No report here shows that the app can diagnose anything. Reports 02 and 03 use healthy volunteers and test the measurement only.
