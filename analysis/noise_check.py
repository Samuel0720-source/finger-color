import sys
import pandas as pd

df = pd.read_csv(sys.argv[1])

print("finger   raw_L  L    raw_a aa    a improved")
for finger, g in df.groupby("finger"):
    raw_L_sd = g["raw_L"].std()
    L_sd = g["L"].std()
    raw_a_sd = g["raw_a"].std()
    a_sd = g["a"].std()
    improve = (1 - a_sd / raw_a_sd) * 100
    print(f"{finger:8s} {raw_L_sd:5.2f}  {L_sd:5.2f} {raw_a_sd:5.2f}  {a_sd:5.2f} {improve:5.1f}%")

