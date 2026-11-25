"""Builds the pilot results book (HTML, then PDF) from the report 02 data.

Usage:
  python analysis/validation/make_pilot_book.py docs/validation/report-02-pilot
  node validation/print-book.mjs docs/validation/report-02-pilot/book/index.html docs/validation/report-02-pilot/pilot-report-2026.pdf

Every number comes from the CSV files in data/, so the book can be rebuilt when data is added.
"""
import json
import sys
from datetime import date
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from stats import agreement  # noqa: E402

NAVY, CREAM, CORAL, INK, MUTED, LINE = "#0b1f3a", "#f6efe4", "#ff7f66", "#14213a", "#6b7280", "#d9d2c5"
FINGERS = ["thumb", "index", "middle", "ring", "pinky"]
plt.rcParams.update({"font.family": "Inter", "font.size": 10, "axes.edgecolor": LINE, "axes.labelcolor": INK,
                     "xtick.color": MUTED, "ytick.color": MUTED, "axes.spines.top": False, "axes.spines.right": False})


def save(fig, path):
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)


def trigger_figures(d, out):
    st = pd.read_csv(d / "static_angles.csv")
    st["app_flexion"] = 180 - st["app_deg"]
    marks = {"P01": "o", "P02": "s", "P03": "^"}

    fig, ax = plt.subplots(figsize=(4.6, 4.2))
    ax.plot([0, 110], [0, 110], color=LINE, lw=1)
    for p, s in st.groupby("participant"):
        ax.scatter(s["gonio_deg"], s["app_flexion"], s=30, marker=marks.get(p, "o"), color=NAVY, alpha=.8, label=p)
    straight = st[st["position"] == "straight"]
    ax.scatter(straight["gonio_deg"], straight["app_flexion"], s=90, facecolors="none", edgecolors=CORAL, lw=1.5, label="Straight finger")
    ax.set_xlabel("Goniometer bend (°)")
    ax.set_ylabel("App bend (°)")
    ax.legend(frameon=False, fontsize=8)
    save(fig, out / "f1-angles.png")

    a = agreement(st["app_flexion"], st["gonio_deg"])
    mean = (st["app_flexion"] + st["gonio_deg"]) / 2
    diff = st["app_flexion"] - st["gonio_deg"]
    fig, ax = plt.subplots(figsize=(5.4, 4.2))
    ax.axhspan(-15, 15, color=CORAL, alpha=.08, label="Target: ±15°")
    ax.scatter(mean, diff, s=26, color=NAVY, alpha=.8)
    for y, ls in [(a["bias"], "-"), (a["loa_low"], "--"), (a["loa_high"], "--")]:
        ax.axhline(y, color=NAVY, ls=ls, lw=1)
    ax.text(mean.max(), a["loa_high"] + .8, f"{a['loa_high']:+.1f}°", ha="right", color=NAVY, fontsize=8)
    ax.text(mean.max(), a["loa_low"] - 2.2, f"{a['loa_low']:+.1f}°", ha="right", color=NAVY, fontsize=8)
    ax.set_xlabel("Average of app and goniometer (°)")
    ax.set_ylabel("App minus goniometer (°)")
    ax.legend(frameon=False, fontsize=8, loc="lower left")
    save(fig, out / "f2-bland-altman.png")

    cy = pd.read_csv(d / "replay_middle_cycles.csv")
    fig, ax = plt.subplots(figsize=(5.4, 3.4))
    x = range(len(cy))
    ax.bar([i - .2 for i in x], cy["cycles_fixed_lines"], width=.4, color=LINE, label="Old fixed lines")
    ax.bar([i + .2 for i in x], cy["cycles_own_open_hand"], width=.4, color=NAVY, label="Own open hand (current)")
    ax.axhline(10, color=CORAL, lw=1, ls="--")
    ax.set_xticks(list(x), [f"{p}\nrun {r}" for p, r in zip(cy["participant"], cy["run"])], fontsize=8)
    ax.set_ylabel("Fists counted (10 made)")
    ax.legend(frameon=False, fontsize=8, loc="upper right", bbox_to_anchor=(1, 1.18), ncol=2)
    save(fig, out / "f3-cycles.png")

    raw = pd.read_csv(d / "raw" / "P01_run6_catch.csv")
    ev = pd.read_csv(d / "replay_catches.csv")
    ev = ev[(ev["participant"] == "P01") & (ev["run"] == 6) & (ev["finger"] == "middle")]
    fig, ax = plt.subplots(figsize=(10, 2.8))
    ax.plot(raw["t_ms"] / 1000, raw["middle_deg"], color=NAVY, lw=1.2)
    for _, e in ev.iterrows():
        ax.axvspan(e["t_s"] - e["pause_ms"] / 1000, e["t_s"], color=CORAL, alpha=.25)
        ax.annotate("catch found", (e["t_s"], e["angle_deg"]), xytext=(4, -16), textcoords="offset points", fontsize=8, color=CORAL)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Middle finger angle (°)")
    save(fig, out / "f4-trace.png")


def raynaud_figures(d, out):
    still = pd.read_csv(d / "raw" / "R01_still_data.csv")
    w = still.pivot_table(index="t", columns="finger", values="change_score")
    fig, ax = plt.subplots(figsize=(10, 2.9))
    for f in FINGERS:
        if f in w:
            ax.plot(w.index, w[f], lw=1.6 if f == "middle" else .8, color=NAVY if f == "middle" else LINE, label=f.capitalize() if f == "middle" else None)
    ax.plot([], [], color=LINE, lw=.8, label="Other fingers")
    ax.axhline(3, color=CORAL, ls="--", lw=1, label="Visible change (3)")
    ax.set_xlabel("Time (s), hand kept still")
    ax.set_ylabel("Color change")
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="upper left")
    save(fig, out / "f5-still.png")

    rows = pd.read_csv(d / "raw" / "R01_press3_middle_data.csv")
    evs = pd.read_csv(d / "raw" / "R01_press3_middle_events.csv")
    warm = float(evs[evs["type"] == "warm_start"]["t"].iloc[0])
    noise = float(evs[evs["type"] == "baseline_noise"]["value"].iloc[0])
    m = rows[rows["finger"] == "middle"]
    fig, ax = plt.subplots(figsize=(5.4, 3.4))
    ax.plot(m["t"], m["change_score"], color=NAVY, lw=1.4)
    ax.axvline(warm, color=CORAL, lw=1)
    ax.text(warm + 1, m["change_score"].max() * .92, "let go", color=CORAL, fontsize=8)
    ax.axhline(noise, color=MUTED, ls="--", lw=1)
    ax.text(m["t"].max(), noise + .5, f"recovery line {noise:.1f}", ha="right", color=MUTED, fontsize=8)
    ax.set_xlabel("Time (s)")
    ax.set_ylabel("Middle fingertip change")
    save(fig, out / "f6-press.png")


def pct(x):
    return f"{x:.0%}"


def main(report_dir):
    report_dir = Path(report_dir)
    td, rd = report_dir / "data" / "trigger", report_dir / "data" / "raynaud"
    book = report_dir / "book"
    (book / "img").mkdir(parents=True, exist_ok=True)
    trigger_figures(td, book / "img")
    raynaud_figures(rd, book / "img")

    tr = json.loads((td / "results.json").read_text())
    rr = json.loads((rd / "results.json").read_text())
    st = pd.read_csv(td / "static_angles.csv")
    st["app_flexion"] = 180 - st["app_deg"]
    bent = agreement(st[st.position != "straight"]["app_flexion"], st[st.position != "straight"]["gonio_deg"])
    straight = st[st.position == "straight"]
    s_diff = (straight["app_flexion"] - straight["gonio_deg"])
    fc = pd.read_csv(td / "finger_catches.csv")
    thumb_false = int(fc[(fc.kind == "smooth") & (fc.finger == "thumb")]["catches"].sum())
    smooth_runs = fc[(fc.kind == "smooth")][["participant", "run"]].drop_duplicates().shape[0]
    presses = pd.read_csv(rd / "presses.csv")
    noise = pd.read_csv(rd / "noise.csv")
    a = tr["agreement"]

    def chk(res, k):
        c = res["checks"][k]
        v = "Not yet" if c["pass"] is None else ("Pass" if c["pass"] else "Fail")
        return f'<tr><td>{k}</td><td>{c["rule"]}</td><td>{c["result"]}</td><td><span class="tag {v.lower().replace(" ", "")}">{v}</span></td></tr>'

    v = dict(
        today=date.today().strftime("%d %B %Y"),
        people=tr["counts"]["people"], pairs=tr["counts"]["pairs"], runs=tr["counts"]["runs"], scored=tr["counts"]["runs_scored"],
        bias=f'{a["bias"]:+.1f}°', lo=f'{a["loa_low"]:+.1f}°', hi=f'{a["loa_high"]:+.1f}°', mae=f'{a["mean_abs_error"]:.1f}°',
        bbias=f'{bent["bias"]:+.1f}°', blo=f'{bent["loa_low"]:+.1f}°', bhi=f'{bent["loa_high"]:+.1f}°', nbent=len(st) - len(straight),
        nstraight=len(straight), smin=f"{s_diff.min():+.0f}°", smax=f"{s_diff.max():+.0f}°",
        found=f'{tr["found"]["hits"]} of {tr["found"]["total"]}', foundp=pct(tr["found"]["rate"]),
        fa=f'{tr["false_alarm"]["hits"]} of {tr["false_alarm"]["total"]}',
        uns=f'{tr["unscored"]["hits"]} of {tr["unscored"]["total"]}',
        thumb=thumb_false, smooth_runs=smooth_runs,
        npress=len(presses), seen=f'{rr["seen"]["hits"]} of {rr["seen"]["total"]}', untimed=f'{rr["untimed"]["hits"]} of {rr["untimed"]["total"]}',
        still_s=f'{noise["t_s"].max():.0f}', still_below=pct(rr["still_below_3"]["rate"]), still_p95=f'{rr["still_p95"]:.1f}',
        tchecks="".join(chk(tr, k) for k in tr["checks"]), rchecks="".join(chk(rr, k) for k in rr["checks"]),
    )
    html = (Path(__file__).parent / "pilot_book_template.html").read_text()
    for k, val in v.items():
        html = html.replace("{{" + k + "}}", str(val))
    (book / "index.html").write_text(html)
    print(f"Wrote {book / 'index.html'}")


if __name__ == "__main__":
    main(sys.argv[1])
