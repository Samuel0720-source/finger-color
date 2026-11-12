"""Fills the numbers in a trigger finger report from its CSV files.

Usage:  python analysis/validation/make_report.py docs/validation/report-02-pilot

The report (trigger-finger.md) is written by hand. Every block between
<!-- auto:name --> and <!-- /auto:name --> is replaced with tables made from the data.
Text outside the blocks is never touched. So: add a friend's rows to the CSV files, run this,
and every number, table and figure updates; the written parts stay.
"""
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from stats import agreement  # noqa: E402
from trigger import analyze, figures, markdown  # noqa: E402

FINGERS = ["thumb", "index", "middle", "ring", "little"]


def agree_rows(rows):
    return agreement(rows["app_flexion"], rows["gonio_deg"]) if len(rows) >= 2 else None


def block_status(d):
    st, runs = d["static"], d["runs"]
    people = sorted(set(st["participant"]) | set(runs["participant"]))
    builds = list(dict.fromkeys(runs["build"])) if "build" in runs else []
    lines = [
        "| | |",
        "| --- | --- |",
        f"| People | {len(people)} ({', '.join(people)}) |",
        f"| Person-sessions | {len(set(zip(st['participant'], st['session'])) | set(zip(runs['participant'], runs['session'])))} |",
        f"| Still-angle pairs | {len(st)} (middle finger; {st['participant'].nunique()} {'person' if st['participant'].nunique() == 1 else 'people'}) |",
        f"| Runs | {len(runs)} ({int(runs['scored'].sum())} scored) |",
        f"| App builds | {', '.join(builds) if builds else 'not recorded'} |",
        f"| Updated | {date.today():%d %b %Y} |",
        f"| Status | Provisional: {len(people)} {'person' if len(people) == 1 else 'people'}, "
        "healthy volunteers. Too few to decide pass or fail; the numbers show what to fix. |",
    ]
    return "\n".join(lines)


def block_checks(d):
    return markdown(d["result"])


def block_agreement(d):
    st = d["static"]
    bent = st[st["position"] != "straight"]
    straight = st[st["position"] == "straight"]
    out = ["| Set | Pairs | Bias | 95% limits |", "| --- | --- | --- | --- |"]
    for label, r in [("All positions", st), ("Bent positions only (not fully straight)", bent)]:
        a = agree_rows(r)
        out.append(f"| {label} | {len(r)} | " + (f"{a['bias']:+.1f}° | {a['loa_low']:+.1f}° to {a['loa_high']:+.1f}° |" if a else "too few | |"))
    if len(straight):
        diffs = straight["app_flexion"] - straight["gonio_deg"]
        out += ["", f"Fully straight finger ({len(straight)} pair{'s' if len(straight) != 1 else ''}): the app read "
                f"{diffs.mean():+.1f}° more bend than the goniometer on average "
                f"(range {diffs.min():+.0f}° to {diffs.max():+.0f}°). Bend = 180° minus the app angle."]
    return "\n".join(out)


def block_people(d):
    st, fists, runs = d["static"], d["fists"], d["runs"]
    out = ["| Person | Pairs | Bias, all | Bias, bent only | Runs scored | False catches, middle | Deliberate catches found |",
           "| --- | --- | --- | --- | --- | --- | --- |"]
    for p in sorted(set(st["participant"]) | set(runs["participant"])):
        s = st[st["participant"] == p]
        a, b = agree_rows(s), agree_rows(s[s["position"] != "straight"])
        r, f = runs[runs["participant"] == p], fists[fists["participant"] == p]
        smooth, scripted = f[f["scripted_catch"] == 0], f[f["scripted_catch"] == 1]
        out.append(
            f"| {p} | {len(s)} | " + (f"{a['bias']:+.1f}°" if a else "none yet") + " | " + (f"{b['bias']:+.1f}°" if b else "none yet")
            + f" | {int(r['scored'].sum())} of {len(r)} | {int(smooth['app_flagged'].sum())} of {len(smooth)}"
            + f" | {int(scripted['app_flagged'].sum())} of {len(scripted)} |"
        )
    return "\n".join(out)


def block_fingers(d):
    fc = d["fc"]
    if fc is None or fc.empty:
        return "No per-finger data yet."
    out = []
    for kind, title in [("smooth", "Smooth fists (every count should be 0)"),
                        ("catch", "Deliberate catches (the middle finger should show the scripted ones; the other fingers paused with the hand)")]:
        k = fc[fc["kind"] == kind]
        if k.empty:
            continue
        out += [f"**{title}**", "", "| Build | Finger | Runs | Catches in total | Runs with a catch |", "| --- | --- | --- | --- | --- |"]
        for build in dict.fromkeys(k["build"]):
            for f in FINGERS:
                r = k[(k["build"] == build) & (k["finger"] == f)]
                if not r.empty:
                    out.append(f"| {build} | {f.capitalize()} | {len(r)} | {int(r['catches'].sum())} | {int((r['catches'] > 0).sum())} |")
        out.append("")
    return "\n".join(out).rstrip()


def block_runs(d):
    runs = d["runs"]
    out = ["| Person | Run | Scored | fps | Build |", "| --- | --- | --- | --- | --- |"]
    for _, r in runs.iterrows():
        fps = "not saved" if pd.isna(r["fps"]) else f"{r['fps']:.0f}"
        out.append(f"| {r['participant']} | {r['run']} | {'yes' if r['scored'] else 'no'} | {fps} | {r.get('build', '')} |")
    if "build" in runs and runs["build"].nunique() > 1:
        out.append("")
        for b in dict.fromkeys(runs["build"]):
            r = runs[runs["build"] == b]
            out.append(f"- Build {b}: {int((r['scored'] == 0).sum())} of {len(r)} runs not scored.")
    return "\n".join(out)


def block_pairs(d):
    st = d["static"]
    out = ["| Person | Session | Position | App angle | App bend | Goniometer bend | App minus goniometer |",
           "| --- | --- | --- | --- | --- | --- | --- |"]
    for _, r in st.iterrows():
        out.append(f"| {r['participant']} | {r['session']} | {r['position']} | {r['app_deg']:.0f}° | {r['app_flexion']:.0f}° | "
                   f"{r['gonio_deg']:.0f}° | {r['app_flexion'] - r['gonio_deg']:+.0f}° |")
    return "\n".join(out)


def block_replay(d):
    """Raw recordings replayed through the app's own detector (validation/replay-trigger.mjs)."""
    base = d["data"]
    ev_path, cy_path = base / "replay_catches.csv", base / "replay_middle_cycles.csv"
    if not ev_path.exists() or not cy_path.exists():
        return "No raw recordings replayed yet. Run `node validation/replay-trigger.mjs <data folder>`."
    ev, cy, fc = pd.read_csv(ev_path), pd.read_csv(cy_path), d["fc"]
    out = []

    # 1. Does the replay reproduce what the screen showed?
    checks, same = 0, 0
    for _, r in cy.iterrows():
        for f in FINGERS:
            shown = fc[(fc["participant"] == r["participant"]) & (fc["run"] == r["run"]) & (fc["finger"] == f)]
            if shown.empty:
                continue
            got = len(ev[(ev["participant"] == r["participant"]) & (ev["run"] == r["run"]) & (ev["finger"] == f)])
            checks += 1
            same += int(got == int(shown["catches"].iloc[0]))
    out += [f"**Does the replay match the screen?** Catch counts: {same} of {checks} finger counts are the same as the app showed. "
            "If they match, the raw file holds what the detector saw, and ideas can be tested on it.", ""]

    # 2. Middle-finger cycles: old fixed lines vs the person's own open hand
    out += ["**Middle-finger cycles counted (10 fists were made)**", "",
            "| Person | Run | Open hand read | With the old fixed lines (150° / 120°) | With the person's own open hand |", "| --- | --- | --- | --- | --- |"]
    for _, r in cy.iterrows():
        est = "" if r.get("open_ref_source", "screen") == "screen" else " (estimated)"
        out.append(f"| {r['participant']} | {r['run']} | {r['open_ref_deg']:.0f}°{est} | {int(r['cycles_fixed_lines'])} | {int(r['cycles_own_open_hand'])} |")
    out += ["", "\"(estimated)\" means the screen value was not written down, so the open hand was taken as the middle finger's median in the first second of the file. The fixed lines are what the app used before 12 Nov (c74e3a4). Replaying cannot test the countdown start, because the recording begins after it.", ""]

    # 3. Every catch found
    out += ["**Every catch the detector found in the recordings**", "",
            "| Person | Run | Kind | Finger | At | Paused at | Pause | Opened by | Others still closed (of 4) |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for _, r in ev.iterrows():
        out.append(f"| {r['participant']} | {r['run']} | {r['kind']} | {r['finger'].capitalize()} | {r['t_s']:.1f} s | {r['angle_deg']:.0f}° | {r['pause_ms']:.0f} ms | {r['gain_deg']:.0f}° in {r['snap_ms']:.0f} ms | {int(r['others_closed'])} |")
    if len(ev):
        real = ev[(ev["kind"] == "catch") & (ev["finger"] == "middle")]["others_closed"]
        false = ev[(ev["kind"] == "smooth") & (ev["finger"] == "thumb")]["others_closed"]
        out += ["", "\"Others still closed\" counts the other four fingers that had not yet risen 15° from the lowest point of their fist when the pause ended. "
                "A rule \"ignore a pause while 2 or more others are still closed\" was the candidate for the thumb problem. "
                f"Deliberate middle-finger catches (these should be kept) had {', '.join(str(int(x)) for x in real)} others closed; "
                f"thumb catches in smooth runs (these should be dropped) had {', '.join(str(int(x)) for x in false)}. "
                + ("The two groups overlap, so this rule would drop real catches. " if len(real) and len(false) and real.max() >= 2 else "The two groups do not overlap. ")
                + "It is a description of these recordings, not a rule in the app."]
    return "\n".join(out)


def extra_figure(d, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    st = d["static"]
    fig, ax = plt.subplots(figsize=(5.2, 5))
    ax.plot([0, 115], [0, 115], color="#999999", linewidth=1, label="Perfect agreement")
    marks = ["o", "s", "^", "D", "v", "P"]
    for i, p in enumerate(sorted(st["participant"].unique())):
        s = st[st["participant"] == p]
        ax.scatter(s["gonio_deg"], s["app_flexion"], s=28, marker=marks[i % len(marks)], color="#0b1f3a", alpha=0.75, label=p)
    ax.set_xlabel("Goniometer (° of bend)")
    ax.set_ylabel("App (° of bend = 180° minus app angle)")
    ax.set_title("Every still-angle pair")
    ax.legend(frameon=False)
    ax.set_aspect("equal")
    fig.tight_layout()
    fig.savefig(Path(out) / "trigger-app-vs-goniometer.png", dpi=150)
    plt.close(fig)


BLOCKS = {"status": block_status, "checks": block_checks, "agreement": block_agreement, "people": block_people,
          "fingers": block_fingers, "runs": block_runs, "pairs": block_pairs, "replay": block_replay}


def main(report_dir):
    report_dir = Path(report_dir)
    data = report_dir / "data" / "trigger"
    result = analyze(data)
    fc_path = data / "finger_catches.csv"
    d = {
        "result": result,
        "static": result["static"],
        "fists": pd.read_csv(data / "fists.csv"),
        "runs": pd.read_csv(data / "runs.csv"),
        "fc": pd.read_csv(fc_path) if fc_path.exists() else None,
        "data": data,
    }
    figures(result, report_dir / "figures", "")
    extra_figure(d, report_dir / "figures")

    md_path = report_dir / "trigger-finger.md"
    text = md_path.read_text()
    seen = set()

    def swap(m):
        name = m.group(1)
        seen.add(name)
        return f"<!-- auto:{name} -->\n{BLOCKS[name](d)}\n<!-- /auto:{name} -->"

    text = re.sub(r"<!-- auto:(\w+) -->.*?<!-- /auto:\1 -->", swap, text, flags=re.S)
    missing = set(BLOCKS) - seen
    if missing:
        print(f"Note: blocks not used in the report: {', '.join(sorted(missing))}")
    md_path.write_text(text)
    print(f"Updated {md_path}")


if __name__ == "__main__":
    main(sys.argv[1])
