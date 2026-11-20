"""Generate reference values for the AnalytIQ Studio stats tests.

Every number here comes from SciPy / NumPy / statsmodels, independently of the
JavaScript implementation, and is written to src/lib/stats/__tests__/fixtures/.

Run with:  npm run fixtures
"""

import json
import math
from pathlib import Path

from fractions import Fraction

import numpy as np
from scipy import stats
from statsmodels.stats.proportion import proportions_ztest

OUT = Path(__file__).resolve().parents[2] / "src" / "lib" / "stats" / "__tests__" / "fixtures"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261030)
norm = stats.norm
TAILS = {"two": "two-sided", "right": "larger", "left": "smaller"}


def write(name, data):
    (OUT / name).write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {name}")


def p_value(z, tail):
    if tail == "left":
        return float(norm.cdf(z))
    if tail == "right":
        return float(norm.sf(z))
    return float(min(1.0, 2 * norm.sf(abs(z))))


def critical(alpha, tail):
    if tail == "two":
        upper = float(norm.isf(alpha / 2))
        return {"lower": -upper, "upper": upper}
    if tail == "right":
        return {"lower": None, "upper": float(norm.isf(alpha))}
    return {"lower": float(norm.ppf(alpha)), "upper": None}


# ---------------------------------------------------------------- normal
zs = sorted(set([round(z, 4) for z in np.linspace(-38, 38, 1521)] + [0.0, 1.0, -1.0, 1.96, -1.96, 2.576, 8.3, -8.3]))
ps = sorted(
    set(
        [float(p) for p in np.linspace(0.0005, 0.9995, 1999)]
        + [float(10.0 ** -k) for k in range(1, 301, 7)]
        + [1 - float(10.0 ** -k) for k in range(1, 16)]
        + [0.5, 0.025, 0.975, 0.05, 0.95, 0.005, 0.995, 0.1, 0.9]
    )
)
alphas = [0.2, 0.1, 0.05, 0.025, 0.02, 0.01, 0.005, 0.001]
write(
    "normal.json",
    {
        "cdf": [[z, float(norm.cdf(z)), float(norm.sf(z)), float(norm.pdf(z))] for z in zs],
        "ppf": [[p, float(norm.ppf(p))] for p in ps],
        "critical": [{"alpha": a, "tail": t, **critical(a, t)} for a in alphas for t in TAILS],
    },
)

# ---------------------------------------------------------------- regression
datasets = [
    {"name": "textbook-small", "x": [1, 2, 3, 4, 5], "y": [2, 4, 5, 4, 5]},
    {"name": "study-hours", "x": [2, 3, 5, 7, 9, 10, 12, 15], "y": [62, 65, 70, 74, 80, 82, 88, 95]},
    {"name": "negative", "x": [10, 20, 30, 40, 50, 60], "y": [95.5, 81.2, 70.4, 52.9, 44.1, 30.7]},
    {"name": "decimals", "x": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7], "y": [1.05, 1.31, 1.42, 1.77, 1.86, 2.2, 2.31]},
    {"name": "perfect-positive", "x": [1, 2, 3, 4], "y": [3, 5, 7, 9]},
    {"name": "perfect-negative", "x": [1, 2, 3, 4], "y": [10, 7, 4, 1]},
    {"name": "large-offset", "x": [1e9 + i for i in range(10)], "y": [5e8 + 2.5 * i + (0.1 if i % 2 else -0.1) for i in range(10)]},
    {"name": "two-points", "x": [3, 8], "y": [4, -6]},
]
for i in range(20):
    n = int(rng.integers(3, 60))
    x = rng.normal(rng.uniform(-50, 50), rng.uniform(0.5, 30), n)
    y = rng.uniform(-3, 3) * x + rng.normal(0, rng.uniform(0.1, 40), n) + rng.uniform(-100, 100)
    datasets.append({"name": f"random-{i}", "x": [float(v) for v in x], "y": [float(v) for v in y]})

regression = []
for d in datasets:
    x = np.array(d["x"], dtype=float)
    y = np.array(d["y"], dtype=float)
    fit = stats.linregress(x, y)
    regression.append(
        {
            **d,
            "n": len(x),
            "sumX": math.fsum(x),
            "sumY": math.fsum(y),
            "sumXY": math.fsum(x * y),
            "sumX2": math.fsum(x * x),
            "sumY2": math.fsum(y * y),
            "slope": float(fit.slope),
            "intercept": float(fit.intercept),
            "r": float(fit.rvalue),
        }
    )
write("regression.json", regression)

# ---------------------------------------------------------------- z-tests
ztests = []
for i in range(12):
    for tail in TAILS:
        alpha = [0.1, 0.05, 0.01][i % 3]

        # one mean (σ known): formula + SciPy normal distribution
        n = int(rng.integers(5, 200))
        sigma = float(rng.uniform(0.5, 40))
        mu0 = float(round(rng.uniform(-100, 500), 2))
        mean = float(round(mu0 + rng.normal(0, 2.2) * sigma / math.sqrt(n), 3))
        z = (mean - mu0) / (sigma / math.sqrt(n))
        ztests.append({"test": "one-mean", "tail": tail, "alpha": alpha,
                       "input": {"sampleMean": mean, "mu0": mu0, "sigma": sigma, "n": n},
                       "z": z, "pValue": p_value(z, tail), "critical": critical(alpha, tail)})

        # one proportion: statsmodels proportions_ztest with prop_var = p0
        n = int(rng.integers(30, 2000))
        p0 = float(round(rng.uniform(0.05, 0.95), 2))
        x = int(min(n, max(0, round(n * p0 + rng.normal(0, 2) * math.sqrt(n * p0 * (1 - p0))))))
        z, p = proportions_ztest(x, n, value=p0, alternative=TAILS[tail], prop_var=p0)
        ztests.append({"test": "one-proportion", "tail": tail, "alpha": alpha,
                       "input": {"successes": x, "n": n, "p0": p0},
                       "z": float(z), "pValue": float(p), "critical": critical(alpha, tail)})

        # two means (σ₁, σ₂ known): formula + SciPy
        n1, n2 = int(rng.integers(10, 300)), int(rng.integers(10, 300))
        s1, s2 = float(rng.uniform(1, 30)), float(rng.uniform(1, 30))
        d0 = float([0, 0, 2.5][i % 3])
        m1 = float(round(rng.uniform(20, 80), 2))
        m2 = float(round(m1 - d0 + rng.normal(0, 2) * math.sqrt(s1**2 / n1 + s2**2 / n2), 2))
        z = ((m1 - m2) - d0) / math.sqrt(s1**2 / n1 + s2**2 / n2)
        ztests.append({"test": "two-means", "tail": tail, "alpha": alpha,
                       "input": {"mean1": m1, "sigma1": s1, "n1": n1, "mean2": m2, "sigma2": s2, "n2": n2, "delta0": d0},
                       "z": z, "pValue": p_value(z, tail), "critical": critical(alpha, tail)})

        # two proportions (pooled): statsmodels proportions_ztest
        n1, n2 = int(rng.integers(40, 1500)), int(rng.integers(40, 1500))
        base = float(rng.uniform(0.1, 0.9))
        x1 = int(rng.binomial(n1, base))
        x2 = int(rng.binomial(n2, min(0.99, max(0.01, base + rng.normal(0, 0.05)))))
        z, p = proportions_ztest([x1, x2], [n1, n2], alternative=TAILS[tail])
        ztests.append({"test": "two-proportions", "tail": tail, "alpha": alpha,
                       "input": {"x1": x1, "n1": n1, "x2": x2, "n2": n2},
                       "z": float(z), "pValue": float(p), "critical": critical(alpha, tail)})

write("ztest.json", ztests)

# ---------------------------------------------------------------- t distribution
# df = 1, 2, 3 exercise the closed forms and heavy tails; fractional df come from
# Welch; 1e3+ exercises the large-df expansion. |t| < 1e-4 is left out at df = 1
# because SciPy's t.cdf loses ~1e-9 absolute accuracy there (checked with mpmath);
# the JS value matches the exact Cauchy CDF ½ + atan(t)/π.
T_DFS = [1, 2, 3, 4.5, 5, 7.3, 10, 17.85, 30, 100, 999, 1000, 1e4, 1e6, 1e7]
T_TS = [0, 1e-4, 0.001, 0.25, 0.5, 1, 1.5, 1.96, 2.5, 3, 4, 6, 10, 25, 40, 100, 1e3, 1e6]
T_QS = [0.4, 0.25, 0.1, 0.05, 0.025, 0.01, 0.005, 1e-3, 1e-4, 1e-6, 1e-8, 1e-10, 1e-12]
t_cdf = []
for df in T_DFS:
    for t in T_TS:
        if df == 1 and 0 < t < 1e-3:
            continue
        for s in ([t] if t == 0 else [t, -t]):
            t_cdf.append([s, df, float(stats.t.cdf(s, df)), float(stats.t.sf(s, df)), float(stats.t.pdf(s, df))])
t_isf = [[q, df, float(stats.t.isf(q, df))] for df in T_DFS for q in T_QS]


def t_critical(alpha, tail, df):
    if tail == "two":
        upper = float(stats.t.isf(alpha / 2, df))
        return {"lower": -upper, "upper": upper}
    if tail == "right":
        return {"lower": None, "upper": float(stats.t.isf(alpha, df))}
    return {"lower": float(stats.t.ppf(alpha, df)), "upper": None}


def ci_of(res, alpha):
    ci = res.confidence_interval(confidence_level=1 - alpha)
    lo, hi = float(ci.low), float(ci.high)
    return {"lower": None if math.isinf(lo) else lo, "upper": None if math.isinf(hi) else hi}


T_ALT = {"two": "two-sided", "right": "greater", "left": "less"}
t_tests = []


def exact_summary(values):
    """Exact mean and sum of squares of the stored doubles (rational arithmetic)."""
    xs = [Fraction(x) for x in values]
    m = sum(xs) / len(xs)
    return len(xs), m, sum((x - m) ** 2 for x in xs)


def add_exact(test, tail, alpha, inp):
    """Edge cases where SciPy's float arithmetic is the less accurate side (1e9
    offsets, 5.000001-style data): t, df and the CI come from exact rational
    arithmetic on the stored inputs, then SciPy's t distribution gives p and t_crit."""
    if test == "two-sample":
        n1, m1, ss1 = exact_summary(inp["data1"])
        n2, m2, ss2 = exact_summary(inp["data2"])
        a1, a2 = ss1 / (n1 - 1) / n1, ss2 / (n2 - 1) / n2
        df = float((a1 + a2) ** 2 / (a1**2 / (n1 - 1) + a2**2 / (n2 - 1)))
        se = math.sqrt(float(a1 + a2))
        diff = m1 - m2
        null = Fraction(inp.get("delta0", 0))
    else:
        values = inp["data"] if test == "one-sample" else [Fraction(a) - Fraction(b) for a, b in zip(inp["data1"], inp["data2"])]
        n, diff, ss = exact_summary(values)
        df = n - 1
        se = math.sqrt(float(ss / (n - 1) / n))
        null = Fraction(inp.get("mu0", inp.get("delta0", 0)))
    t = float(diff - null) / se
    p = {"two": min(1.0, 2 * float(stats.t.sf(abs(t), df))), "right": float(stats.t.sf(t, df)), "left": float(stats.t.cdf(t, df))}[tail]
    est = float(diff)
    if tail == "two":
        m = float(stats.t.isf(alpha / 2, df)) * se
        ci = {"lower": est - m, "upper": est + m}
    elif tail == "right":
        ci = {"lower": est - float(stats.t.isf(alpha, df)) * se, "upper": None}
    else:
        ci = {"lower": None, "upper": est + float(stats.t.isf(alpha, df)) * se}
    t_tests.append({"test": test, "tail": tail, "alpha": alpha, "input": inp, "t": t, "df": float(df),
                    "pValue": p, "critical": t_critical(alpha, tail, df), "ci": ci})


def add_t(test, tail, alpha, inp, res, df, ci):
    t_tests.append({"test": test, "tail": tail, "alpha": alpha, "input": inp,
                    "t": float(res.statistic), "df": float(df), "pValue": float(res.pvalue),
                    "critical": t_critical(alpha, tail, df), "ci": ci})


def samples(n, mean, sd):
    return [float(round(x, 4)) for x in rng.normal(mean, sd, n)]


# Hand-picked edge cases: tiny samples, huge offsets, nearly constant data.
edge_one = [
    ("n=2", [3.0, 5.0], 1.0),
    ("n=3", [10.1, 9.7, 10.4], 10.0),
    ("huge-offset", [1e9 + d for d in [0.1, -0.2, 0.35, 0.05, -0.1]], 1e9),
    ("near-constant", [5.0, 5.0, 5.0, 5.0, 5.000001], 5.0),
    ("extreme-t", [100.0, 100.1, 99.9, 100.05, 99.95, 100.02], 50.0),
    ("textbook", [12.0, 14, 11, 15, 13, 16, 12, 14, 15, 13], 12.0),
]
for i, tail in enumerate(T_ALT):
    for j in range(5):
        alpha = [0.1, 0.05, 0.01, 0.025, 0.001][(i + j) % 5]
        # one sample, raw data
        n = int(rng.integers(2, 60))
        data = samples(n, rng.uniform(-50, 50), rng.uniform(0.5, 20))
        mu0 = float(round(np.mean(data) + rng.normal(0, 1.5) * np.std(data, ddof=1) / math.sqrt(n), 2))
        res = stats.ttest_1samp(data, mu0, alternative=T_ALT[tail])
        add_t("one-sample", tail, alpha, {"data": data, "mu0": mu0}, res, n - 1, ci_of(res, alpha))
        # one sample, summary stats (checked against the raw-data SciPy result)
        add_t("one-sample", tail, alpha,
              {"mean": float(np.mean(data)), "sd": float(np.std(data, ddof=1)), "n": n, "mu0": mu0},
              res, n - 1, ci_of(res, alpha))

        # two samples, Welch and pooled, raw data
        n1, n2 = int(rng.integers(2, 50)), int(rng.integers(2, 50))
        d1 = samples(n1, rng.uniform(10, 60), rng.uniform(1, 15))
        d2 = samples(n2, rng.uniform(10, 60), rng.uniform(1, 15))
        delta0 = float([0, 0, 1.5, -2, 0][j])
        shifted = [x - delta0 for x in d1]
        for pooled in (False, True):
            res = stats.ttest_ind(shifted, d2, equal_var=pooled, alternative=T_ALT[tail])
            ci = ci_of(res, alpha)
            ci = {k: (None if val is None else val + delta0) for k, val in ci.items()}
            add_t("two-sample", tail, alpha, {"data1": d1, "data2": d2, "delta0": delta0, "pooled": pooled},
                  res, res.df, ci)
        # two samples, summary stats: ttest_ind_from_stats
        m1, s1, m2, s2 = float(rng.uniform(0, 100)), float(rng.uniform(0.5, 30)), float(rng.uniform(0, 100)), float(rng.uniform(0.5, 30))
        for pooled in (False, True):
            res = stats.ttest_ind_from_stats(m1, s1, n1, m2, s2, n2, equal_var=pooled, alternative=T_ALT[tail])
            if pooled:
                df = n1 + n2 - 2
                se = math.sqrt(((n1 - 1) * s1**2 + (n2 - 1) * s2**2) / df * (1 / n1 + 1 / n2))
            else:
                a1, a2 = s1**2 / n1, s2**2 / n2
                df = (a1 + a2) ** 2 / (a1**2 / (n1 - 1) + a2**2 / (n2 - 1))
                se = math.sqrt(a1 + a2)
            if tail == "two":
                m = float(stats.t.isf(alpha / 2, df)) * se
                ci = {"lower": m1 - m2 - m, "upper": m1 - m2 + m}
            elif tail == "right":
                ci = {"lower": m1 - m2 - float(stats.t.isf(alpha, df)) * se, "upper": None}
            else:
                ci = {"lower": None, "upper": m1 - m2 + float(stats.t.isf(alpha, df)) * se}
            add_t("two-sample", tail, alpha,
                  {"mean1": m1, "sd1": s1, "n1": n1, "mean2": m2, "sd2": s2, "n2": n2, "pooled": pooled},
                  res, df, ci)

        # paired, raw data
        n = int(rng.integers(2, 40))
        before = samples(n, rng.uniform(20, 80), rng.uniform(2, 10))
        after = [float(round(b + rng.normal(rng.uniform(-3, 3), rng.uniform(0.5, 4)), 4)) for b in before]
        res = stats.ttest_rel(before, after, alternative=T_ALT[tail])
        add_t("paired", tail, alpha, {"data1": before, "data2": after}, res, n - 1, ci_of(res, alpha))

    for name, data, mu0 in edge_one:
        add_exact("one-sample", tail, 0.05, {"data": data, "mu0": mu0, "name": name})
    # Welch with very unequal variances and sizes; huge offsets
    d1 = [1e9 + x for x in [0.5, 0.7, 0.2, 0.9]]
    d2 = [1e9 + x for x in samples(40, 0.1, 0.02)]
    add_exact("two-sample", tail, 0.05, {"data1": d1, "data2": d2, "pooled": False, "name": "huge-offset-welch"})
    # paired: n = 2, and huge offsets
    add_exact("paired", tail, 0.05, {"data1": [4.0, 6.5], "data2": [3.0, 4.0], "name": "n=2"})
    add_exact("paired", tail, 0.01, {"data1": [1e9 + x for x in [0.3, 0.8, 0.1, 0.6]],
                                     "data2": [1e9 + x for x in [0.1, 0.5, 0.2, 0.2]], "name": "huge-offset-paired"})

write("t.json", {"cdf": t_cdf, "isf": t_isf, "tests": t_tests})
