"""Small, readable statistics used by every validation report.

Each function does one calculation that the protocols name. No hidden steps.
"""
import numpy as np


def agreement(app, reference):
    """Bland-Altman agreement: how far `app` is from `reference`.

    Returns the bias (average of app - reference), the standard deviation of the
    differences, and the 95% limits of agreement (bias +/- 1.96 x SD).
    """
    diff = np.asarray(app, float) - np.asarray(reference, float)
    bias = diff.mean()
    sd = diff.std(ddof=1)  # sample standard deviation
    return {
        "n": int(diff.size),
        "bias": float(bias),
        "sd": float(sd),
        "loa_low": float(bias - 1.96 * sd),
        "loa_high": float(bias + 1.96 * sd),
        "mean_abs_error": float(np.abs(diff).mean()),
    }


def icc_2_1(table):
    """ICC(2,1): two-way random effects, absolute agreement, single measurement.

    `table` is a 2-D array: one row per person, one column per session.
    1.0 means every session gave the same value; near 0 means the sessions
    disagree as much as different people do. (Shrout and Fleiss, 1979.)
    """
    x = np.asarray(table, float)
    n, k = x.shape
    grand = x.mean()
    ss_rows = k * ((x.mean(axis=1) - grand) ** 2).sum()  # between people
    ss_cols = n * ((x.mean(axis=0) - grand) ** 2).sum()  # between sessions
    ss_total = ((x - grand) ** 2).sum()
    ss_error = ss_total - ss_rows - ss_cols
    ms_rows = ss_rows / (n - 1)
    ms_cols = ss_cols / (k - 1)
    ms_error = ss_error / ((n - 1) * (k - 1))
    return float((ms_rows - ms_error) / (ms_rows + (k - 1) * ms_error + k * (ms_cols - ms_error) / n))


def rate(hits, total):
    """A share as a fraction, e.g. 24 found out of 30 = 0.8."""
    return {"hits": int(hits), "total": int(total), "rate": hits / total if total else float("nan")}


def p95(values):
    """95th percentile: 95 out of 100 values are at or below this."""
    return float(np.percentile(np.asarray(values, float), 95))
