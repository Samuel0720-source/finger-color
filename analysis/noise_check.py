"""Check how much the grey card correction reduces noise.

Usage:
    python noise_check.py recovery_20261030_1752_data.csv

Only works for recordings where you tapped a grey card (the L, a, b columns are empty otherwise).
"""
import sys

import pandas as pd

df = pd.read_csv(sys.argv[1])
if df["L"].isna().all():
    print("No grey card was used in this recording, so there is nothing to compare.")
    sys.exit(0)

print("finger   raw_L_sd  L_sd  raw_a_sd  a_sd  a improved")
for finger, g in df.groupby("finger"):
    raw_L_sd = g["raw_L"].std()
    L_sd = g["L"].std()
    raw_a_sd = g["raw_a"].std()
    a_sd = g["a"].std()
    improve = (1 - a_sd / raw_a_sd) * 100
    print(f"{finger:8s} {raw_L_sd:8.2f} {L_sd:5.2f} {raw_a_sd:9.2f} {a_sd:5.2f} {improve:9.1f}%")
