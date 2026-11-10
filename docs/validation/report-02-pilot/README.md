# Report 02: pilot (not started)

Empty data sheets for the pilot are in `data/`. Fill one row per reading, following the protocols:

- Trigger finger: [VP-TF-001](../protocol-trigger-finger.md), steps 1 to 3, normal light.
- Raynaud's: [VP-RAY-001](../protocol-raynaud.md), steps 1 to 5, normal light.

Then run:

```
python analysis/validation/trigger.py docs/validation/report-02-pilot/data/trigger --figures docs/validation/report-02-pilot/figures
python analysis/validation/raynaud.py docs/validation/report-02-pilot/data/raynaud --figures docs/validation/report-02-pilot/figures
```

With only 3 people the pass or fail table is provisional.
