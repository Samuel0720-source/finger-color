"""Analyze one recording made by the web app.

Usage:
    python analyze.py recovery_20261030_1752

It reads the two files the app downloads:
    recovery_20261030_1752_data.csv     one row per finger per second
    recovery_20261030_1752_events.csv   warm_start, temperatures, baseline_noise, app_recovery_sec

It uses the same steps as src/recovery.js, so the number should match the app.
"""
import sys

import numpy as np
import pandas as pd

FINGER = "middle"
SMOOTH_SECONDS = 10
HOLD_SECONDS = 30
RECOVERY_FRACTION = 0.10


def load_events(path):
    try:
        return pd.read_csv(path)
    except pd.errors.EmptyDataError:
        return pd.DataFrame(columns=["t", "type", "value"])


def event_value(events, name):
    rows = events.loc[events["type"] == name, "value"]
    if len(rows) == 0 or pd.isna(rows.iloc[0]) or rows.iloc[0] == "":
        return None
    return float(rows.iloc[0])


def smooth(values, window=SMOOTH_SECONDS):
    # Exactly the same as smooth() in src/recovery.js: 4 samples before, the sample itself, 5 after.
    # (pandas rolling(center=True) uses 5 before and 4 after for an even window, which is one sample off.)
    before = window - 1 - window // 2
    after = window // 2
    out = []
    for i in range(len(values)):
        start = max(0, i - before)
        end = min(len(values) - 1, i + after)
        out.append(values[start : end + 1].mean())
    return np.array(out)


def analyze_session(sess, events, finger=FINGER):
    # change_score = how far this finger is from the saved normal color (palm-referenced CIELAB distance)
    sess = sess[sess["finger"] == finger].dropna(subset=["change_score"]).copy()
    if len(sess) == 0:
        raise ValueError("No change_score values. Save your normal color in the app before recording.")

    noise = event_value(events, "baseline_noise")
    if noise is None:
        raise ValueError("No baseline_noise in the events file. Record again with the current app version.")

    warm = events.loc[events["type"] == "warm_start", "t"]
    if len(warm) == 0:
        raise ValueError("No warm_start event.")
    t_warm = float(warm.iloc[0])
    version = event_value(events, "algorithm_version")
    if version == 2:
        if (events["type"] == "interrupted").any():
            raise ValueError("Recording interrupted.")
        sess = sess[np.isfinite(sess["t"]) & np.isfinite(sess["change_score"]) & (sess["change_score"] >= 0)].sort_values("t")
        after = sess[sess["t"] >= t_warm].copy()
        times = (after["t"] - t_warm).to_numpy()
        if len(times) < 2 or times[-1] - times[0] < 60:
            raise ValueError("At least 60 seconds after warming are required.")
        if times[0] > 2.5 or np.any(np.diff(times) > 2.5) or np.any(np.diff(times) <= 0):
            raise ValueError("Hand tracking has gaps.")
        raw = after["change_score"].to_numpy()
        vals = np.array([raw[:i+1][times[i] - times[:i+1] < SMOOTH_SECONDS].mean() for i in range(len(times))])
    else:
        # Keep old CSV analyses reproducible; v2 recordings carry their algorithm version.
        sess["smooth"] = smooth(sess["change_score"].to_numpy())
        after = sess[sess["t"] >= t_warm]
        times = (after["t"] - t_warm).to_numpy()
        vals = after["smooth"].to_numpy()
    if len(times) == 0:
        raise ValueError("No data after warm_start.")
    start = vals[0]
    threshold = max(RECOVERY_FRACTION * start, noise)
    recovery = None
    if version == 2 and start <= threshold:
        pass
    elif version == 2:
        below_since = None
        for t, v in zip(times, vals):
            if v > threshold:
                below_since = None
            else:
                if below_since is None:
                    below_since = t
                if t - below_since >= HOLD_SECONDS:
                    recovery = below_since
                    break
    else:
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
        score_at_temp = np.interp(temps["since"], times, vals)
        r = np.corrcoef(temps["value"], score_at_temp)[0, 1]

    app_sec = event_value(events, "app_recovery_sec")
    return {
        "recovery_min": recovery / 60 if recovery is not None else np.nan,
        "start_score": start,
        "threshold": threshold,
        "noise": noise,
        "r": r,
        "n_temps": len(temps),
        "app_recovery_min": app_sec / 60 if app_sec is not None else np.nan,
        "_times": times,
        "_vals": vals,
        "_temps": temps,
    }


def plot(name, res):
    import matplotlib.pyplot as plt

    times, vals, temps = res["_times"], res["_vals"], res["_temps"]
    fig, ax1 = plt.subplots(figsize=(9, 4.5))
    ax1.plot(times / 60, vals, label="change score (smoothed)")
    ax1.axhline(res["threshold"], linestyle="--", color="gray", label="recovery threshold")
    if not np.isnan(res["recovery_min"]):
        ax1.axvline(res["recovery_min"], linestyle=":", color="green", label=f"recovered {res['recovery_min']:.1f} min")
    ax1.set_xlabel("minutes after warm_start")
    ax1.set_ylabel("change score")
    if len(temps) > 0:
        ax2 = ax1.twinx()
        ax2.plot(temps["since"] / 60, temps["value"], "o-", color="tab:red", label="finger temp")
        ax2.set_ylabel("finger temperature (C)")
    ax1.legend(loc="upper right")
    plt.title(f"{name} / {FINGER}")
    plt.tight_layout()
    plt.savefig(name + "_plot.png", dpi=150)
    print("Plot saved:", name + "_plot.png")


def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze.py recovery_YYYYMMDD_HHMM")
        sys.exit(1)
    name = sys.argv[1]
    res = analyze_session(pd.read_csv(name + "_data.csv"), load_events(name + "_events.csv"))

    print(f"Finger: {FINGER}")
    print(f"Noise level: {res['noise']:.2f}")
    print(f"Change score right after warm start: {res['start_score']:.2f}")
    print(f"Recovery threshold: {res['threshold']:.2f}")
    rec = res["recovery_min"]
    print("Recovery time:", f"{rec:.1f} min" if not np.isnan(rec) else "not recovered within recording")
    if not np.isnan(res["app_recovery_min"]):
        print(f"App said: {res['app_recovery_min']:.1f} min")
    if not np.isnan(res["r"]):
        print(f"Correlation between finger temp and change score: r = {res['r']:.2f}")
    plot(name, res)


if __name__ == "__main__":
    main()

