import sys
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

FINGER = "middle"
SMOOTH_SECONDS = 10
HOLD_SECONDS = 30
RECOVERY_FRACTION = 0.10

baseline_path = sys.argv[1]
name = sys.argv[2]

base = pd.read_csv(baseline_path)
base = base[base["finger"] == FINGER]
sess = pd.read_csv(name + "_data.csv")
sess = sess[sess["finger"] == FINGER].copy()
try:
    events = pd.read_csv(name + "_events.csv")
except pd.errors.EmptyDataError:
    events = pd.DataFrame(columns=["t", "type", "value"])

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

print(f"Finger: {FINGER}")
print(f"Noise level (dE): {noise:.2f}")
print(f"dE right after warm start: {start_dE:.2f}")
print(f"Recovery threshold (dE): {threshold:.2f}")
print("Recovery time:", f"{recovery / 60:.1f} min" if recovery is not None else "not recovered within recording")

temps = events[events["type"] == "finger_temp_c"].copy()
temps["since"] = temps["t"].astype(float) - t_warm
temps["value"] = temps["value"].astype(float)
if len(temps) >= 3:
    dE_at_temp = np.interp(temps["since"], times, vals)
    r = np.corrcoef(temps["value"], dE_at_temp)[0, 1]
    print(f"Correlation between finger temp and dE: r = {r:.2f}")

fig, ax1 = plt.subplots(figsize=(9, 4.5))
ax1.plot(times / 60, vals, label="color difference dE (smoothed)")
ax1.axhline(threshold, linestyle="--", color="gray", label="recovery threshold")
if recovery is not None:
    ax1.axvline(recovery / 60, linestyle=":", color="green", label=f"recovered {recovery / 60:.1f} min")
ax1.set_xlabel("minutes after warm_start")
ax1.set_ylabel("dE from baseline")
if len(temps) > 0:
    ax2 = ax1.twinx()
    ax2.plot(temps["since"] / 60, temps["value"], "o-", color="tab:red", label="finger temp")
    ax2.set_ylabel("finger temperature (C)")
ax1.legend(loc="upper right")
plt.title(f"{name} / {FINGER}")
plt.tight_layout()
plt.savefig(name + "_plot.png", dpi=150)
print("Plot saved:", name + "_plot.png")