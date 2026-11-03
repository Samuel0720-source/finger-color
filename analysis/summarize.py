"""Summarize every recording in this folder into summary.csv.

Usage:
    python summarize.py          make summary.csv
    python summarize.py --check  also check that Python and the app got the same recovery time
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from analyze import analyze_session, load_events

HERE = Path(__file__).resolve().parent
COLUMNS = ["session", "recovery_min", "app_recovery_min", "start_score", "threshold", "noise", "r", "n_temps"]


def main():
    check = "--check" in sys.argv
    rows = []
    mismatches = 0

    # raynaud_* is the current app; recovery_* are older recordings.
    for data_path in sorted([*HERE.glob("raynaud_*_data.csv"), *HERE.glob("recovery_*_data.csv")]):
        session = data_path.name[: -len("_data.csv")]
        events_path = HERE / (session + "_events.csv")
        if not events_path.exists():
            print(f"SKIP {session}: {events_path.name} not found")
            continue
        try:
            res = analyze_session(pd.read_csv(data_path), load_events(events_path))
        except ValueError as e:
            print(f"SKIP {session}: {e}")
            continue

        row = {"session": session, **{k: v for k, v in res.items() if not k.startswith("_")}}
        rows.append(row)

        if check:
            py, app = row["recovery_min"], row["app_recovery_min"]
            same = (np.isnan(py) and np.isnan(app)) or (not np.isnan(py) and not np.isnan(app) and abs(py - app) < 0.05)
            mismatches += 0 if same else 1
            print(f"  CHECK {session}: python={py:.2f} app={app:.2f}  {'MATCH' if same else 'MISMATCH'}")

    summary = pd.DataFrame(rows, columns=COLUMNS)
    summary.to_csv(HERE / "summary.csv", index=False)
    print()
    print(summary.round(2).to_string(index=False))
    print("Saved:", HERE / "summary.csv")

    rec = summary["recovery_min"].dropna()
    print()
    print(f"Recovered sessions: {len(rec)} of {len(summary)}")
    if len(rec) > 0:
        print(f"Recovery time mean: {rec.mean():.1f} min")
    if len(rec) > 1:
        print(f"Recovery time SD:   {rec.std():.1f} min  (sample SD, ddof=1)")
        print(f"Recovery time CV:   {rec.std() / rec.mean() * 100:.0f} %  (repeatability: smaller is better)")
    if check:
        print("All sessions match the app" if mismatches == 0 else f"{mismatches} session(s) DO NOT match the app")


if __name__ == "__main__":
    main()
