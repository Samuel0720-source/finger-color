"""Trigger finger validation: turns the three CSV files into the report's results.

Usage:  python analysis/validation/trigger.py <data folder> [--figures <folder>] [--label "<text above the title>"]

The data folder holds (format in docs/validation/protocol-trigger-finger.md):
  static_angles.csv  participant,session,finger,position,app_deg,gonio_deg,light,skin_group
  fists.csv          participant,session,run,fist,scripted_catch,app_flagged,light
  runs.csv           participant,session,run,scored,fps,light
"""
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from stats import agreement, icc_2_1, rate, to_json  # noqa: E402

# Pass or fail rules, copied from the protocol. Change them there first, then here.
CRITERIA = {
    "AC-1": "Bias within ±5°",
    "AC-2": "Both 95% limits within ±15°",
    "AC-3": "ICC 0.75 or higher",
    "AC-4": "80% or more of deliberate catches found",
    "AC-5": "10% or fewer smooth fists flagged",
    "AC-6": "Fewer than 1 in 5 runs not scored",
}


def analyze(folder):
    folder = Path(folder)
    static = pd.read_csv(folder / "static_angles.csv")
    fists = pd.read_csv(folder / "fists.csv")
    runs = pd.read_csv(folder / "runs.csv")

    # The app reads 180° for a straight finger; the goniometer reads 0°. Same scale first.
    static["app_flexion"] = 180 - static["app_deg"]

    normal = static[static["light"] == "normal"]
    agree = agreement(normal["app_flexion"], normal["gonio_deg"])

    # Repeatability: middle finger at the 90° pose, one value per person per session.
    pose = normal[(normal["finger"] == "middle") & (normal["position"] == "90")]
    table = pose.pivot_table(index="participant", columns="session", values="app_flexion").dropna()
    icc = icc_2_1(table.values) if len(table) >= 2 and table.shape[1] >= 2 else float("nan")

    nfists = fists[fists["light"] == "normal"]
    found = rate(((nfists["scripted_catch"] == 1) & (nfists["app_flagged"] == 1)).sum(), (nfists["scripted_catch"] == 1).sum())
    false_alarm = rate(((nfists["scripted_catch"] == 0) & (nfists["app_flagged"] == 1)).sum(), (nfists["scripted_catch"] == 0).sum())
    nruns = runs[runs["light"] == "normal"]
    unscored = rate((nruns["scored"] == 0).sum(), len(nruns))

    checks = {
        "AC-1": (f"Bias {agree['bias']:+.1f}°", abs(agree["bias"]) <= 5),
        "AC-2": (f"{agree['loa_low']:+.1f}° to {agree['loa_high']:+.1f}°", agree["loa_low"] >= -15 and agree["loa_high"] <= 15),
        # One session per person (the pilot) cannot give a repeatability number. That is "not
        # assessed", not a failure, so the table says so instead of printing FAIL.
        "AC-3": (f"ICC {icc:.2f} ({len(table)} people)" if icc == icc else "Not assessed: needs 2+ sessions and 2+ people", (icc >= 0.75) if icc == icc else None),
        "AC-4": (f"{found['hits']} of {found['total']} ({found['rate']:.0%})", found["rate"] >= 0.80),
        "AC-5": (f"{false_alarm['hits']} of {false_alarm['total']} ({false_alarm['rate']:.0%})", false_alarm["rate"] <= 0.10),
        "AC-6": (f"{unscored['hits']} of {unscored['total']} ({unscored['rate']:.0%})", unscored["rate"] < 0.20),
    }

    # Same agreement, split by condition. Groups under 5 pairs are marked too small.
    by_condition = []
    for label, rows in [("Normal light", normal), ("Dim light", static[static["light"] == "dim"]), ("Bright light", static[static["light"] == "bright"])] + [
        (f"Skin tone: {g}", normal[normal["skin_group"] == g]) for g in ["light", "medium", "dark"]
    ]:
        if len(rows) == 0:
            continue
        a = agreement(rows["app_flexion"], rows["gonio_deg"]) if len(rows) >= 2 else None
        by_condition.append({"condition": label, "pairs": len(rows), "too_small": len(rows) < 5, **(a or {})})

    # How much data the numbers rest on. The website shows this next to the results.
    people = sorted(set(static["participant"]) | set(runs["participant"]))
    counts = {"people": len(people), "people_with_pairs": int(static["participant"].nunique()), "pairs": int(len(normal)), "runs": int(len(nruns)), "runs_scored": int((nruns["scored"] == 1).sum())}

    return {"counts": counts, "agreement": agree, "icc": icc, "found": found, "false_alarm": false_alarm, "unscored": unscored,
            "checks": {k: {"result": v[0], "pass": None if v[1] is None else bool(v[1]), "rule": CRITERIA[k]} for k, v in checks.items()},
            "by_condition": by_condition, "static": static}


def figures(result, out, label=""):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    d = result["static"]
    d = d[d["light"] == "normal"]
    a = result["agreement"]
    mean = (d["app_flexion"] + d["gonio_deg"]) / 2
    diff = d["app_flexion"] - d["gonio_deg"]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    ax.scatter(mean, diff, s=14, alpha=0.6, color="#0b1f3a")
    for y, style in [(a["bias"], "-"), (a["loa_low"], "--"), (a["loa_high"], "--")]:
        ax.axhline(y, color="#0b1f3a", linestyle=style, linewidth=1)
    ax.axhspan(-15, 15, color="#ff7f66", alpha=0.08, label="Target: ±15°")
    ax.set_xlabel("Average of app and goniometer (° of bend)")
    ax.set_ylabel("App minus goniometer (°)")
    ax.set_title((label + "\n" if label else "") + f"Agreement, normal light: bias {a['bias']:+.1f}°, limits {a['loa_low']:+.1f}° to {a['loa_high']:+.1f}°")
    ax.legend(loc="lower right", frameon=False)
    fig.tight_layout()
    fig.savefig(out / "trigger-bland-altman.png", dpi=150)
    plt.close(fig)


def markdown(result):
    lines = ["| ID | Rule | Result | Pass |", "| --- | --- | --- | --- |"]
    for k, c in result["checks"].items():
        lines.append(f"| {k} | {c['rule']} | {c['result']} | {'NOT ASSESSED' if c['pass'] is None else 'PASS' if c['pass'] else 'FAIL'} |")
    return "\n".join(lines)


if __name__ == "__main__":
    args = sys.argv[1:]
    res = analyze(args[0])
    print(markdown(res))
    if "--figures" in args:
        label = args[args.index("--label") + 1] if "--label" in args else ""
        figures(res, args[args.index("--figures") + 1], label)
    keep = {k: v for k, v in res.items() if k != "static"}
    (Path(args[0]) / "results.json").write_text(to_json(keep))
