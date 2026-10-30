import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

FINGER = "middle"
SMOOTH_SECONDS = 10
HOLD_SECONDS = 30
RECOVERY_FRACTION = 0.10

HERE = Path(__file__).resolve().parent


def date_key(path):
    m = re.search(r"\d{4}-?\d{2}-?\d{2}", path.name)
    return m.group(0).replace("-", "") if m else None


def load_events(path):
    try:
        return pd.read_csv(path)
    except pd.errors.EmptyDataError:
        return pd.DataFrame(columns=["t", "type", "value"])


# Same steps as analyze.py, but returns numbers instead of printing/plotting.
def analyze_session(base, sess, events):
    base = base[base["finger"] == FINGER]
    sess = sess[sess["finger"] == FINGER].copy()

    L0, a0, b0 = base["L"].mean(), base["a"].mean(), base["b"].mean()

    def delta_e(df):
        return np.sqrt((df["L"] - L0) ** 2 + (df["a"] - a0) ** 2 + (df["b"] - b0) ** 2)

    base_dE = delta_e(base)
    noise = base_dE.mean() + 2 * base_dE.std()

    sess["dE"] = delta_e(sess)
    sess["dE_smooth"] = sess["dE"].rolling(SMOOTH_SECONDS, center=True, min_periods=1).mean()

    warm = events.loc[events["type"] == "warm_start", "t"]
    t_warm = float(warm.iloc[0]) if len(warm) > 0 else float(sess["t"].iloc[0])
    after = sess[sess["t"] >= t_warm]
    times = (after["t"] - t_warm).to_numpy()
    vals = after["dE_smooth"].to_numpy()

    start_dE = vals[0]
    threshold = max(RECOVERY_FRACTION * start_dE, noise)

    recovery = None
    for i in range(len(times)):
        if times[i] + HOLD_SECONDS > times[-1]:
            break
        window = (times >= times[i]) & (times <= times[i] + HOLD_SECONDS)
        if np.all(vals[window] <= threshold):
            recovery = times[i]
            break

    temps = events[events["type"] == "finger_temp_c"].copy()
    temps["since"] = temps["t"].astype(float) - t_warm
    temps["value"] = temps["value"].astype(float)
    r = np.nan
    if len(temps) >= 3:
        dE_at_temp = np.interp(temps["since"], times, vals)
        r = np.corrcoef(temps["value"], dE_at_temp)[0, 1]

    return {
        "recovery_min": recovery / 60 if recovery is not None else np.nan,
        "start_dE": start_dE,
        "threshold": threshold,
        "r": r,
        "n_temps": len(temps),
    }


def parse_analyze_output(text):
    out = {"recovery_min": np.nan, "r": np.nan}
    for line in text.splitlines():
        if line.startswith("dE right after warm start:"):
            out["start_dE"] = float(line.split(":")[1])
        elif line.startswith("Recovery threshold (dE):"):
            out["threshold"] = float(line.split(":")[1])
        elif line.startswith("Recovery time:") and "min" in line:
            out["recovery_min"] = float(line.split(":")[1].replace("min", ""))
        elif line.startswith("Correlation between finger temp and dE:"):
            out["r"] = float(line.split("=")[1])
    return out


def same(a, b, decimals):
    if np.isnan(a) or np.isnan(b):
        return np.isnan(a) and np.isnan(b)
    return round(a, decimals) == b


def check_against_analyze(session, baseline_path, row):
    res = subprocess.run(
        [sys.executable, "analyze.py", baseline_path.name, session],
        cwd=HERE, capture_output=True, text=True,
    )
    if res.returncode != 0:
        print(f"  CHECK {session}: analyze.py failed\n{res.stderr}")
        return False
    ref = parse_analyze_output(res.stdout)
    ok = (
        same(row["start_dE"], ref["start_dE"], 2)
        and same(row["threshold"], ref["threshold"], 2)
        and same(row["recovery_min"], ref["recovery_min"], 1)
        and same(row["r"], ref["r"], 2)
    )
    print(f"  CHECK {session}: {'MATCH' if ok else 'MISMATCH'}  summarize={row}  analyze.py={ref}")
    return ok


def main():
    check = "--check" in sys.argv

    baselines = {}
    for p in sorted(HERE.glob("baseline_*_data.csv")):
        baselines.setdefault(date_key(p), []).append(p)

    rows = []
    all_ok = True
    for data_path in sorted(HERE.glob("recovery_*_data.csv")):
        session = data_path.name[: -len("_data.csv")]
        key = date_key(data_path)
        matches = baselines.get(key, []) if key else []
        if len(matches) != 1:
            print(f"SKIP {session}: found {len(matches)} baseline files for date {key}")
            continue
        baseline_path = matches[0]

        events_path = HERE / (session + "_events.csv")
        if not events_path.exists():
            print(f"SKIP {session}: {events_path.name} not found")
            continue

        result = analyze_session(
            pd.read_csv(baseline_path), pd.read_csv(data_path), load_events(events_path)
        )
        row = {"session": session, **result}
        rows.append(row)
        print(f"{session}  (baseline: {baseline_path.name})")

        if check:
            all_ok = check_against_analyze(session, baseline_path, result) and all_ok

    summary = pd.DataFrame(rows, columns=["session", "recovery_min", "start_dE", "threshold", "r", "n_temps"])
    summary.to_csv(HERE / "summary.csv", index=False)
    print()
    print(summary.to_string(index=False))
    print("Saved:", HERE / "summary.csv")

    rec = summary["recovery_min"].dropna()
    print()
    print(f"Recovered sessions: {len(rec)} of {len(summary)}")
    if len(rec) > 0:
        print(f"Recovery time mean: {rec.mean():.1f} min")
    if len(rec) > 1:
        print(f"Recovery time SD:   {rec.std():.1f} min  (sample SD, ddof=1)")

    if check:
        print()
        print("All sessions match analyze.py" if all_ok else "SOME SESSIONS DO NOT MATCH analyze.py")


if __name__ == "__main__":
    main()