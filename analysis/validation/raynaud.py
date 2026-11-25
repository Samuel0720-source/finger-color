"""Raynaud's color validation: turns the two CSV files into the report's results.

Usage:  python analysis/validation/raynaud.py <data folder> [--figures <folder>] [--label "<text above the title>"]

The data folder holds (format in docs/validation/protocol-raynaud.md):
  noise.csv    participant,session,t_s,color_change,light
  presses.csv  participant,session,finger,press,peak_change,app_recovery_s,rater1_s,rater2_s,light,skin_group
               app_recovery_s is empty when the app could not time that press.
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from stats import agreement, icc_2_1, p95, rate, to_json  # noqa: E402

VISIBLE = 3.0  # a color change of about 3 is the smallest a person can see

CRITERIA = {
    "AC-1": "Still hand: 95% of samples below 3",
    "AC-2": "90% or more presses seen (peak above 3)",
    "AC-3": "Recovery bias within ±1 s",
    "AC-4": "Both 95% limits within ±3 s",
    "AC-5": "ICC 0.6 or higher",
    "AC-6": "Fewer than 1 in 5 presses not timed",
}


def analyze(folder):
    folder = Path(folder)
    noise = pd.read_csv(folder / "noise.csv")
    presses = pd.read_csv(folder / "presses.csv")

    still = noise[noise["light"] == "normal"]["color_change"]
    below = rate((still < VISIBLE).sum(), len(still))
    if presses.empty:
        # Only the still-hand recording exists so far: report AC-1 and leave the rest open.
        checks = {"AC-1": (f"{below['rate']:.0%} below 3 (95th percentile {p95(still):.1f})", below["rate"] >= 0.95)}
        checks.update({k: ("No presses yet", None) for k in ["AC-2", "AC-3", "AC-4", "AC-5", "AC-6"]})
        return {"still_below_3": below, "still_p95": p95(still), "presses": 0,
                "checks": {k: {"result": v[0], "pass": v[1] if v[1] is None else bool(v[1]), "rule": CRITERIA[k]} for k, v in checks.items()},
                "timed": None}

    normal = presses[presses["light"] == "normal"].copy()
    seen = rate((normal["peak_change"] > VISIBLE).sum(), len(normal))
    timed = normal.dropna(subset=["app_recovery_s"]).copy()
    untimed = rate(len(normal) - len(timed), len(normal))

    if timed.empty or timed[["rater1_s", "rater2_s"]].isna().any().any():
        # Presses exist but none can be compared yet (not timed by the app, or no rater times).
        checks = {
            "AC-1": (f"{below['rate']:.0%} below 3 (95th percentile {p95(still):.1f})", below["rate"] >= 0.95),
            "AC-2": (f"{seen['hits']} of {seen['total']} ({seen['rate']:.0%})", seen["rate"] >= 0.90),
            "AC-3": ("No timed press with rater times yet", None),
            "AC-4": ("No timed press with rater times yet", None),
            "AC-5": ("Needs 2+ people and 2+ sessions", None),
            "AC-6": (f"{untimed['hits']} of {untimed['total']} ({untimed['rate']:.0%})", untimed["rate"] < 0.20),
        }
        return {"still_below_3": below, "still_p95": p95(still), "seen": seen, "untimed": untimed, "presses": len(normal),
                "checks": {k: {"result": v[0], "pass": v[1] if v[1] is None else bool(v[1]), "rule": CRITERIA[k]} for k, v in checks.items()},
                "timed": None}

    # Reference time = the two human raters averaged.
    timed["reference_s"] = (timed["rater1_s"] + timed["rater2_s"]) / 2
    agree = agreement(timed["app_recovery_s"], timed["reference_s"])
    rater_gap = (timed["rater1_s"] - timed["rater2_s"]).abs()

    # Repeatability: each person's average recovery time per session.
    table = timed.pivot_table(index="participant", columns="session", values="app_recovery_s", aggfunc="mean").dropna()
    icc = icc_2_1(table.values) if len(table) >= 2 and table.shape[1] >= 2 else float("nan")

    checks = {
        "AC-1": (f"{below['rate']:.0%} below 3 (95th percentile {p95(still):.1f})", below["rate"] >= 0.95),
        "AC-2": (f"{seen['hits']} of {seen['total']} ({seen['rate']:.0%})", seen["rate"] >= 0.90),
        "AC-3": (f"Bias {agree['bias']:+.2f} s", abs(agree["bias"]) <= 1),
        "AC-4": (f"{agree['loa_low']:+.2f} s to {agree['loa_high']:+.2f} s", agree["loa_low"] >= -3 and agree["loa_high"] <= 3),
        "AC-5": (f"ICC {icc:.2f} ({len(table)} people)", icc >= 0.6),
        "AC-6": (f"{untimed['hits']} of {untimed['total']} ({untimed['rate']:.0%})", untimed["rate"] < 0.20),
    }

    by_condition = []
    groups = [("Normal light", "light", "normal"), ("Dim light", "light", "dim"), ("Bright light", "light", "bright")]
    groups += [(f"Skin tone: {g}", "skin_group", g) for g in ["light", "medium", "dark"]]
    for label, col, val in groups:
        rows = presses[presses[col] == val]
        if col == "skin_group":
            rows = rows[rows["light"] == "normal"]
        if len(rows) == 0:
            continue
        t = rows.dropna(subset=["app_recovery_s"])
        a = agreement(t["app_recovery_s"], (t["rater1_s"] + t["rater2_s"]) / 2) if len(t) >= 2 else {}
        by_condition.append({"condition": label, "presses": len(rows), "seen": float((rows["peak_change"] > VISIBLE).mean()),
                             "too_small": len(rows) < 5, **a})

    return {"agreement": agree, "icc": icc, "still_below_3": below, "still_p95": p95(still), "seen": seen,
            "untimed": untimed, "rater_mean_gap_s": float(rater_gap.mean()), "third_rater_needed": int((rater_gap > 1).sum()),
            "checks": {k: {"result": v[0], "pass": bool(v[1]), "rule": CRITERIA[k]} for k, v in checks.items()},
            "by_condition": by_condition, "timed": timed}


def figures(result, out, label=""):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    t = result["timed"]
    a = result["agreement"]
    mean = (t["app_recovery_s"] + t["reference_s"]) / 2
    diff = t["app_recovery_s"] - t["reference_s"]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.scatter(mean, diff, s=14, alpha=0.6, color="#0b1f3a")
    for y, style in [(a["bias"], "-"), (a["loa_low"], "--"), (a["loa_high"], "--")]:
        ax.axhline(y, color="#0b1f3a", linestyle=style, linewidth=1)
    ax.axhspan(-3, 3, color="#ff7f66", alpha=0.08, label="Target: ±3 s")
    ax.set_xlabel("Average of app and raters (s)")
    ax.set_ylabel("App minus raters (s)")
    ax.set_title((label + "\n" if label else "") + f"Recovery time: bias {a['bias']:+.2f} s, limits {a['loa_low']:+.2f} to {a['loa_high']:+.2f} s")
    ax.legend(loc="lower right", frameon=False)
    fig.tight_layout()
    fig.savefig(out / "raynaud-bland-altman.png", dpi=150)
    plt.close(fig)


def markdown(result):
    lines = ["| ID | Rule | Result | Pass |", "| --- | --- | --- | --- |"]
    for k, c in result["checks"].items():
        verdict = "NOT YET" if c["pass"] is None else ("PASS" if c["pass"] else "FAIL")
        lines.append(f"| {k} | {c['rule']} | {c['result']} | {verdict} |")
    return "\n".join(lines)


if __name__ == "__main__":
    args = sys.argv[1:]
    res = analyze(args[0])
    print(markdown(res))
    if "--figures" in args and res["timed"] is not None:
        label = args[args.index("--label") + 1] if "--label" in args else ""
        figures(res, args[args.index("--figures") + 1], label)
    keep = {k: v for k, v in res.items() if k != "timed"}
    (Path(args[0]) / "results.json").write_text(to_json(keep))
