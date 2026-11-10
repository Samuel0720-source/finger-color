"""Report 01 dry run: simulated data with answers we set in advance.

We choose the true answers (for example "the app reads 6° too much"), build fake
data that has exactly that error, run the real analysis scripts on it, and check
they report the answers we chose. If they do, the scripts can be trusted with
real data in Reports 02 and 03. None of these numbers describe the app or a person.

Usage:
  python analysis/validation/dryrun.py write <folder>   # write the simulated CSVs
  python analysis/validation/dryrun.py check            # build, analyze, compare; exit 1 on any miss
"""
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import raynaud  # noqa: E402
import trigger  # noqa: E402
from stats import icc_2_1  # noqa: E402

SEED = 20261110
PEOPLE = [f"P{i:02d}" for i in range(1, 11)]
SKIN = ["light", "medium", "dark", "light", "medium", "dark", "light", "medium", "dark", "light"]

# The answers we build into the data. The check passes only if the analysis finds them.
INJECTED = {
    "trigger_bias_deg": 6.0,  # app reads 6° more bend than the goniometer
    "trigger_diff_sd_deg": float(np.hypot(4.0, 2.5)),  # app noise 4°, goniometer noise 2.5°
    "catches_found": (24, 30),
    "false_alarms": (15, 300),
    "runs_unscored": (4, 40),
    "still_below_3": 0.90,
    "presses_seen": (282, 300),
    "presses_untimed": (30, 300),
    "recovery_bias_s": 0.40,
    "recovery_diff_sd_s": float(np.hypot(0.30, 0.20 / np.sqrt(2))),  # app noise 0.3 s, each rater 0.2 s
}


def pick(rng, total, hits):
    """Exactly `hits` ones among `total`, in random places."""
    flags = np.zeros(total, int)
    flags[rng.choice(total, hits, replace=False)] = 1
    return flags


def write_trigger(folder, rng):
    rows = []
    for p, skin in zip(PEOPLE, SKIN):
        person = rng.normal(0, 8)  # people bend differently
        for s in (1, 2, 3):
            day = rng.normal(0, 1.5)
            for finger in ("middle", "index"):
                for pos in (0, 45, 90, 108):
                    true = max(0.0, pos + person * (pos > 0) + day)
                    gonio = true + rng.normal(0, 2.5)
                    app_flexion = true + INJECTED["trigger_bias_deg"] + rng.normal(0, 4.0)
                    rows.append([p, s, finger, "straight" if pos == 0 else str(pos), round(180 - app_flexion, 1), round(gonio, 1), "normal", skin])
                    if p in ("P01", "P02", "P03") and s == 1:
                        for light, extra in (("dim", 4.0), ("bright", 1.0)):
                            a = true + INJECTED["trigger_bias_deg"] + extra + rng.normal(0, 4.0)
                            rows.append([p, s, finger, "straight" if pos == 0 else str(pos), round(180 - a, 1), round(gonio, 1), light, skin])
    pd.DataFrame(rows, columns="participant,session,finger,position,app_deg,gonio_deg,light,skin_group".split(",")).to_csv(folder / "static_angles.csv", index=False)

    # 10 mixed runs with catches on fists 3, 6, 9; 30 smooth runs of 10 fists.
    found = iter(pick(rng, 30, INJECTED["catches_found"][0]))
    alarms = iter(pick(rng, 300, INJECTED["false_alarms"][0]))
    fists = []
    for i, p in enumerate(PEOPLE):
        for f in (3, 6, 9):
            fists.append([p, 1, "mixed", f, 1, next(found), "normal"])
        for s in (1, 2, 3):
            for f in range(1, 11):
                fists.append([p, s, "smooth", f, 0, next(alarms), "normal"])
    pd.DataFrame(fists, columns="participant,session,run,fist,scripted_catch,app_flagged,light".split(",")).to_csv(folder / "fists.csv", index=False)

    unscored = pick(rng, 40, INJECTED["runs_unscored"][0])
    runs = [[PEOPLE[i % 10], 1 + i // 10 if i < 30 else 1, "smooth" if i < 30 else "mixed", int(1 - unscored[i]), round(rng.uniform(27, 31), 1), "normal"] for i in range(40)]
    pd.DataFrame(runs, columns="participant,session,run,scored,fps,light".split(",")).to_csv(folder / "runs.csv", index=False)


def write_raynaud(folder, rng):
    # Still hand: half-normal noise sized so that 90% of samples fall below 3.
    sigma = 3 / 1.6449
    noise = [[p, s, t, round(abs(rng.normal(0, sigma)), 2), "normal"] for p in PEOPLE for s in (1, 2, 3) for t in range(120)]
    pd.DataFrame(noise, columns="participant,session,t_s,color_change,light".split(",")).to_csv(folder / "noise.csv", index=False)

    seen = iter(pick(rng, 300, INJECTED["presses_seen"][0]))
    untimed = iter(pick(rng, 300, INJECTED["presses_untimed"][0]))
    rows = []
    for p, skin in zip(PEOPLE, SKIN):
        person = rng.normal(2.5, 0.6)  # people recover at different speeds
        for s in (1, 2, 3):
            for finger in ("middle", "index"):
                for k in range(1, 6):
                    true = max(0.8, person + rng.normal(0, 0.15))
                    r1, r2 = true + rng.normal(0, 0.2), true + rng.normal(0, 0.2)
                    app = true + INJECTED["recovery_bias_s"] + rng.normal(0, 0.3)
                    peak = rng.uniform(6, 20) if next(seen) else rng.uniform(1.5, 2.9)
                    timed = not next(untimed)
                    rows.append([p, s, finger, k, round(peak, 2), round(app, 3) if timed else None, round(r1, 3), round(r2, 3), "normal", skin])
    pd.DataFrame(rows, columns="participant,session,finger,press,peak_change,app_recovery_s,rater1_s,rater2_s,light,skin_group".split(",")).to_csv(folder / "presses.csv", index=False)


def write(folder):
    folder = Path(folder)
    rng = np.random.default_rng(SEED)
    (folder / "trigger").mkdir(parents=True, exist_ok=True)
    (folder / "raynaud").mkdir(parents=True, exist_ok=True)
    write_trigger(folder / "trigger", rng)
    write_raynaud(folder / "raynaud", rng)


def check():
    """Every line is: what we built in, what the analysis found, and whether they match."""
    lines, ok = [], True

    def expect(name, found, want, tol):
        nonlocal ok
        good = abs(found - want) <= tol
        ok &= good
        lines.append(f"| {name} | {want:.3g} | {found:.3g} | ±{tol:.3g} | {'match' if good else 'MISS'} |")

    # ICC formula against the published worked example (Shrout and Fleiss, 1979): ICC(2,1) = 0.29.
    sf = [[9, 2, 5, 8], [6, 1, 3, 2], [8, 4, 6, 8], [7, 1, 2, 6], [10, 5, 6, 9], [6, 2, 4, 7]]
    expect("ICC formula (published example)", icc_2_1(sf), 0.29, 0.005)

    with tempfile.TemporaryDirectory() as tmp:
        write(tmp)
        t = trigger.analyze(Path(tmp) / "trigger")
        r = raynaud.analyze(Path(tmp) / "raynaud")

    n = t["agreement"]["n"]
    sd = INJECTED["trigger_diff_sd_deg"]
    expect("Trigger: bias (°)", t["agreement"]["bias"], INJECTED["trigger_bias_deg"], 3 * sd / np.sqrt(n))
    expect("Trigger: SD of differences (°)", t["agreement"]["sd"], sd, 0.15 * sd)
    expect("Trigger: catches found", t["found"]["hits"], INJECTED["catches_found"][0], 0)
    expect("Trigger: false alarms", t["false_alarm"]["hits"], INJECTED["false_alarms"][0], 0)
    expect("Trigger: runs not scored", t["unscored"]["hits"], INJECTED["runs_unscored"][0], 0)
    expect("Raynaud: share of still samples below 3", r["still_below_3"]["rate"], INJECTED["still_below_3"], 0.02)
    expect("Raynaud: presses seen", r["seen"]["hits"], INJECTED["presses_seen"][0], 0)
    expect("Raynaud: presses not timed", r["untimed"]["hits"], INJECTED["presses_untimed"][0], 0)
    sd = INJECTED["recovery_diff_sd_s"]
    expect("Raynaud: recovery bias (s)", r["agreement"]["bias"], INJECTED["recovery_bias_s"], 3 * sd / np.sqrt(r["agreement"]["n"]))
    expect("Raynaud: SD of differences (s)", r["agreement"]["sd"], sd, 0.15 * sd)

    print("| Check | Built in | Analysis found | Allowed gap | Result |\n| --- | --- | --- | --- | --- |")
    print("\n".join(lines))
    return ok, t, r


if __name__ == "__main__":
    if sys.argv[1:2] == ["write"]:
        write(sys.argv[2])
    else:
        good, _, _ = check()
        sys.exit(0 if good else 1)
