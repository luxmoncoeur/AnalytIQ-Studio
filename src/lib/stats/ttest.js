// @ts-check
import { decide, exact, firstFailure, v } from "./decision.js";
import { criticalT, tIsf, tPValue } from "./distributions.js";
import { MAX_POINTS } from "./regression.js";
import { fail, ok } from "./result.js";
import { compensatedSum } from "./summation.js";
import {
  checkAlpha,
  checkDataList,
  checkFinite,
  checkMinSampleSize,
  checkSigma,
  checkTail,
} from "./validation.js";

/**
 * Student's t-tests: one sample, two independent samples (Welch by default,
 * pooled variance as an option) and paired samples. Each accepts raw data or
 * summary statistics (mean, standard deviation, n).
 */

/** @typedef {import('./normal.js').Tail} Tail */
/** @typedef {import('./decision.js').Step} Step */
/** @typedef {'one-sample' | 'two-sample' | 'paired'} TTestType */

/**
 * Confidence interval for the tested parameter at level 1 − α. One-tailed tests
 * get a one-sided bound (as SciPy does), so the interval always agrees with the decision.
 * @typedef {{ lower: number | null, upper: number | null, level: number }} ConfidenceInterval
 */

/**
 * @typedef {import('./decision.js').TestResult & { test: TTestType, df: number, ci: ConfidenceInterval }} TTestResult
 */

/**
 * @typedef {object} Summary
 * @property {number} n
 * @property {number} mean
 * @property {number} offset  mean − center, computed without cancellation.
 * @property {number} sd
 * @property {{ sum: number, ss: number } | null} raw  Sums shown in the steps when raw data was given.
 */

const TOO_LARGE =
  "The values are too large to compute reliably. Try rescaling the data (for example, use thousands instead of units).";

/**
 * Mean and standard deviation of raw data, worked relative to a nearby `center`
 * (μ₀ or the first observation): x − center is exact for nearby values, so
 * x̄ − center and the deviations keep full precision even for data like
 * 1e9 + 0.1 or 5.000001. The mean gets one correction pass; deviations are
 * scaled by their largest magnitude before squaring so s cannot overflow.
 * @param {number[]} values
 * @param {number} center
 * @returns {Summary}
 */
function summarize(values, center) {
  const n = values.length;
  const shifted = values.map((x) => x - center);
  let offset = compensatedSum(shifted) / n;
  offset += compensatedSum(shifted.map((u) => u - offset)) / n;
  const deviations = shifted.map((u) => u - offset);
  const scale = Math.max(...deviations.map(Math.abs));
  const uu = scale === 0 ? 0 : compensatedSum(deviations.map((d) => (d / scale) ** 2));
  return {
    n,
    mean: center + offset,
    offset,
    sd: scale * Math.sqrt(uu / (n - 1)),
    raw: { sum: compensatedSum(values), ss: scale * scale * uu },
  };
}

/**
 * Summary statistics typed in by the user.
 * @param {number} n
 * @param {number} mean
 * @param {number} sd
 * @param {number} center
 * @returns {Summary}
 */
function given(n, mean, sd, center) {
  return { n, mean, offset: mean - center, sd, raw: null };
}

/**
 * Distribution descriptor for decide(): Student's t with `df` degrees of freedom.
 * @param {number} df
 * @returns {import('./decision.js').Distribution}
 */
function tDistribution(df) {
  return {
    symbol: "t",
    critical: (alpha, tail) => criticalT(alpha, tail, df),
    pValue: (t, tail) => tPValue(t, tail, df),
    criticalFormula: {
      two: "t_(α/2, df): P(T ≥ t) = α/2",
      right: "t_(α, df): P(T ≥ t) = α",
      left: "−t_(α, df): P(T ≤ t) = α",
    },
    criticalPrefix: ["df = ", Number.isInteger(df) ? exact(df) : v(df), ", "],
    probability: "P(T ≥ ",
    df,
  };
}

/**
 * "Sample statistics" step for raw data: x̄ and s with the sums substituted.
 * @param {Summary} s
 * @param {string} id
 * @param {string} label   e.g. "Sample 1" or "Differences".
 * @param {{ x: string, mean: string, sd: string, n: string }} sym
 * @returns {Step[]}
 */
function summarySteps(s, id, label, sym) {
  if (!s.raw) return [];
  return [
    {
      id: `${id}-mean`,
      title: `${label}: mean`,
      formula: `${sym.mean} = Σ${sym.x} / ${sym.n}`,
      substitution: [`${sym.mean} = `, v(s.raw.sum), " / ", exact(s.n), " = ", v(s.mean)],
      result: s.mean,
      explanation: `Add the ${s.n} values and divide by how many there are.`,
    },
    {
      id: `${id}-sd`,
      title: `${label}: standard deviation`,
      formula: `${sym.sd} = √[Σ(${sym.x} − ${sym.mean})² / (${sym.n} − 1)]`,
      substitution: [`${sym.sd} = √[`, v(s.raw.ss), " / (", exact(s.n), " − 1)] = ", v(s.sd)],
      result: s.sd,
      explanation:
        "The sample standard deviation divides by n − 1 (not n) because x̄ was estimated from the same data.",
    },
  ];
}

/**
 * Confidence interval for the parameter and its solution step.
 * @param {number} estimate
 * @param {number} standardError
 * @param {number} df
 * @param {number} alpha
 * @param {Tail} tail
 * @param {string} parameter
 * @returns {{ ci: ConfidenceInterval, step: Step }}
 */
function confidenceInterval(estimate, standardError, df, alpha, tail, parameter) {
  const level = 1 - alpha;
  const percent = `${Number((level * 100).toPrecision(12))}%`;
  if (tail === "two") {
    const tc = tIsf(alpha / 2, df);
    const margin = tc * standardError;
    const ci = { lower: estimate - margin, upper: estimate + margin, level };
    return {
      ci,
      step: {
        id: "ci",
        title: `${percent} confidence interval`,
        formula: "estimate ± t_(α/2, df) · SE",
        substitution: [
          v(estimate),
          " ± ",
          v(tc),
          " · ",
          v(standardError),
          " = ",
          v(estimate),
          " ± ",
          v(margin),
          " → (",
          v(ci.lower),
          ", ",
          v(ci.upper),
          ")",
        ],
        result: null,
        explanation: `Values of ${parameter} inside this interval are not rejected at α = ${alpha}; the interval excludes the value in H₀ exactly when H₀ is rejected.`,
      },
    };
  }
  const tc = tIsf(alpha, df);
  const margin = tc * standardError;
  const right = tail === "right";
  const bound = right ? estimate - margin : estimate + margin;
  return {
    ci: right ? { lower: bound, upper: null, level } : { lower: null, upper: bound, level },
    step: {
      id: "ci",
      title: `${percent} one-sided confidence bound`,
      formula: right
        ? "lower bound = estimate − t_(α, df) · SE"
        : "upper bound = estimate + t_(α, df) · SE",
      substitution: [
        v(estimate),
        right ? " − " : " + ",
        v(tc),
        " · ",
        v(standardError),
        " = ",
        v(bound),
        ` → ${parameter} ${right ? ">" : "<"} `,
        v(bound),
      ],
      result: bound,
      explanation: `A one-tailed test pairs with a one-sided bound: H₀ is rejected exactly when the value in H₀ lies ${right ? "below" : "above"} it.`,
    },
  };
}

/**
 * Shared final stage: guard against overflow, run the decision, append the CI.
 * @param {object} spec
 * @param {TTestType} spec.test
 * @param {Tail} spec.tail
 * @param {number} spec.alpha
 * @param {string} spec.parameter
 * @param {number} spec.nullValue
 * @param {number} spec.estimate
 * @param {number} spec.standardError
 * @param {number} spec.difference
 * @param {number} spec.df
 * @param {Step[]} spec.preSteps
 * @param {Step[]} spec.setupSteps
 * @param {Step} spec.statStep
 * @param {Record<string, number>} spec.details
 * @param {string[]} spec.warnings
 * @returns {import('./result.js').Result<TTestResult>}
 */
function finish(spec) {
  const { estimate, standardError, df } = spec;
  if (![estimate, standardError, df].every(Number.isFinite)) return fail("NON_FINITE", TOO_LARGE);
  const outcome = decide({
    ...spec,
    dist: tDistribution(df),
    zeroErrorMessage:
      "The standard error is 0, so t cannot be computed. The data need some variation.",
  });
  if (!outcome.ok) return outcome;
  const { ci, step } = confidenceInterval(
    estimate,
    standardError,
    df,
    spec.alpha,
    spec.tail,
    spec.parameter,
  );
  return ok({ ...outcome.value, test: spec.test, df, ci, steps: [...outcome.value.steps, step] });
}

/**
 * @param {number} n
 * @returns {string[]}
 */
function smallSampleWarning(n) {
  return n < 30
    ? ["The sample is small (n < 30). The t-test assumes the population is approximately normal."]
    : [];
}

/**
 * The one-sample core, also used by the paired test on the differences.
 * @param {object} spec
 * @param {TTestType} spec.test
 * @param {Summary} spec.s
 * @param {number} spec.nullValue
 * @param {number} spec.alpha
 * @param {Tail} spec.tail
 * @param {string} spec.parameter
 * @param {{ x: string, mean: string, sd: string, n: string, null: string }} spec.sym
 * @param {string} spec.label
 * @param {Step[]} [spec.extraSteps]
 */
function oneSampleCore({
  test,
  s,
  nullValue,
  alpha,
  tail,
  parameter,
  sym,
  label,
  extraSteps = [],
}) {
  const df = s.n - 1;
  const sqrtN = Math.sqrt(s.n);
  const standardError = s.sd / sqrtN;
  const difference = s.offset;
  return finish({
    test,
    tail,
    alpha,
    parameter,
    nullValue,
    estimate: s.mean,
    standardError,
    difference,
    df,
    details: { n: s.n, mean: s.mean, sd: s.sd, standardError, df },
    warnings: smallSampleWarning(s.n),
    preSteps: [
      ...extraSteps,
      ...summarySteps(s, "sample", label, sym),
      {
        id: "df",
        title: "Degrees of freedom",
        formula: "df = n − 1",
        substitution: ["df = ", exact(s.n), " − 1 = ", exact(df)],
        result: df,
        explanation: "One degree of freedom is used up by estimating the mean from the sample.",
      },
    ],
    setupSteps: [
      {
        id: "standard-error",
        title: "Standard error of the mean",
        formula: `SE = ${sym.sd} / √n`,
        substitution: [
          "SE = ",
          s.raw ? v(s.sd) : exact(s.sd),
          " / √",
          exact(s.n),
          " = ",
          s.raw ? v(s.sd) : exact(s.sd),
          " / ",
          v(sqrtN),
          " = ",
          v(standardError),
        ],
        result: standardError,
        explanation: `Uses the sample standard deviation ${sym.sd} because σ is unknown, which is why the t distribution is used instead of z.`,
      },
    ],
    statStep: {
      id: "t",
      title: "Test statistic t",
      formula: `t = (${sym.mean} − ${sym.null}) / SE`,
      substitution: [
        "t = (",
        s.raw ? v(s.mean) : exact(s.mean),
        " − ",
        exact(nullValue),
        ") / ",
        v(standardError),
        " = ",
        v(difference),
        " / ",
        v(standardError),
        " = ",
        v(difference / standardError),
      ],
      result: null,
      explanation: `How many standard errors the ${label.toLowerCase()} mean lies from the value in H₀.`,
    },
  });
}

/**
 * @param {Summary} s
 * @param {string} field
 * @param {string} message
 */
function checkVariation(s, field, message) {
  return s.sd > 0 ? null : fail("ZERO_VARIANCE", message, field);
}

/**
 * One-sample t-test for a mean (σ unknown).
 * t = (x̄ − μ₀) / (s / √n), df = n − 1.
 *
 * Give either `data` (raw values) or `mean`, `sd` and `n`.
 *
 * @param {{ data?: number[], mean?: number, sd?: number, n?: number, mu0: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<TTestResult>}
 */
export function oneSampleTTest({ data, mean, sd, n, mu0, alpha, tail }) {
  const failure = firstFailure([
    ...(data !== undefined
      ? [checkDataList(data, 2, MAX_POINTS, "data", "The sample")]
      : [
          checkFinite(mean, "mean", "The sample mean x̄"),
          checkSigma(sd, "sd", "The sample standard deviation s"),
          checkMinSampleSize(n, 2, "n", "The sample size n"),
        ]),
    checkFinite(mu0, "mu0", "The hypothesized mean μ₀"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;
  const s =
    data !== undefined
      ? summarize(data, mu0)
      : given(
          /** @type {number} */ (n),
          /** @type {number} */ (mean),
          /** @type {number} */ (sd),
          mu0,
        );
  const flat = checkVariation(
    s,
    "data",
    "Every value in the sample is the same, so the standard deviation s is 0 and t is undefined. A t-test needs some variation in the data.",
  );
  if (flat) return flat;
  return oneSampleCore({
    test: "one-sample",
    s,
    nullValue: mu0,
    alpha,
    tail,
    parameter: "μ",
    sym: { x: "x", mean: "x̄", sd: "s", n: "n", null: "μ₀" },
    label: "Sample",
  });
}

/**
 * Paired t-test: a one-sample t-test on the differences d = x₁ − x₂.
 *
 * Give either `data1` and `data2` (equal lengths, one pair per row) or
 * `meanDiff`, `sdDiff` and `n` (number of pairs).
 *
 * @param {{ data1?: number[], data2?: number[], meanDiff?: number, sdDiff?: number, n?: number, delta0?: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<TTestResult>}
 */
export function pairedTTest({ data1, data2, meanDiff, sdDiff, n, delta0 = 0, alpha, tail }) {
  const raw = data1 !== undefined || data2 !== undefined;
  const failure = firstFailure([
    ...(raw
      ? [
          checkDataList(data1, 2, MAX_POINTS, "data1", "Sample 1"),
          checkDataList(data2, 2, MAX_POINTS, "data2", "Sample 2"),
        ]
      : [
          checkFinite(meanDiff, "meanDiff", "The mean difference d̄"),
          checkSigma(sdDiff, "sdDiff", "The standard deviation of the differences s_d"),
          checkMinSampleSize(n, 2, "n", "The number of pairs n"),
        ]),
    checkFinite(delta0, "delta0", "The hypothesized mean difference μ_d₀"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  /** @type {Summary} */
  let s;
  /** @type {Step[]} */
  const extraSteps = [];
  if (raw) {
    const x1 = /** @type {number[]} */ (data1);
    const x2 = /** @type {number[]} */ (data2);
    if (x1.length !== x2.length)
      return fail(
        "LENGTH_MISMATCH",
        `Sample 1 has ${x1.length} values but Sample 2 has ${x2.length}. Paired data needs one value in each column for every subject.`,
        "data2",
      );
    const diffs = x1.map((x, i) => x - x2[i]);
    s = summarize(diffs, delta0);
    extraSteps.push({
      id: "differences",
      title: "Differences",
      formula: "dᵢ = x₁ᵢ − x₂ᵢ",
      substitution: [
        "d = ",
        ...diffs.slice(0, 8).flatMap((d, i) => [i === 0 ? "" : ", ", v(d)]),
        diffs.length > 8 ? `, … (${diffs.length} differences)` : "",
      ],
      result: null,
      explanation:
        "A paired test works on the difference within each pair, which removes the variation between subjects.",
    });
  } else {
    s = given(
      /** @type {number} */ (n),
      /** @type {number} */ (meanDiff),
      /** @type {number} */ (sdDiff),
      delta0,
    );
  }
  const flat = checkVariation(
    s,
    "data2",
    "Every pair has the same difference, so the standard deviation of the differences is 0 and t is undefined.",
  );
  if (flat) return flat;
  return oneSampleCore({
    test: "paired",
    s,
    nullValue: delta0,
    alpha,
    tail,
    parameter: "μ_d",
    sym: { x: "d", mean: "d̄", sd: "s_d", n: "n", null: "μ_d₀" },
    label: "Differences",
    extraSteps,
  });
}

/**
 * Two-sample t-test for μ₁ − μ₂. Welch's test (unequal variances) by default;
 * `pooled: true` assumes equal variances.
 *
 * Welch:  SE = √(s₁²/n₁ + s₂²/n₂), df by Welch–Satterthwaite.
 * Pooled: SE = s_p·√(1/n₁ + 1/n₂), df = n₁ + n₂ − 2.
 *
 * Give either `data1` and `data2` or `mean1`, `sd1`, `n1`, `mean2`, `sd2`, `n2`.
 *
 * @param {{ data1?: number[], data2?: number[], mean1?: number, sd1?: number, n1?: number, mean2?: number, sd2?: number, n2?: number, delta0?: number, pooled?: boolean, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<TTestResult>}
 */
export function twoSampleTTest(input) {
  const { data1, data2, delta0 = 0, pooled = false, alpha, tail } = input;
  const raw = data1 !== undefined || data2 !== undefined;
  const failure = firstFailure([
    ...(raw
      ? [
          checkDataList(data1, 2, MAX_POINTS, "data1", "Sample 1"),
          checkDataList(data2, 2, MAX_POINTS, "data2", "Sample 2"),
        ]
      : [
          checkFinite(input.mean1, "mean1", "The mean of sample 1 x̄₁"),
          checkSigma(input.sd1, "sd1", "The standard deviation of sample 1 s₁"),
          checkMinSampleSize(input.n1, 2, "n1", "The size of sample 1 n₁"),
          checkFinite(input.mean2, "mean2", "The mean of sample 2 x̄₂"),
          checkSigma(input.sd2, "sd2", "The standard deviation of sample 2 s₂"),
          checkMinSampleSize(input.n2, 2, "n2", "The size of sample 2 n₂"),
        ]),
    checkFinite(delta0, "delta0", "The hypothesized difference D₀"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  // One shared center keeps x̄₁ − x̄₂ precise when both samples sit far from 0.
  const center = raw ? /** @type {number[]} */ (data1)[0] : 0;
  const toSummary = (/** @type {1 | 2} */ k) =>
    raw
      ? summarize(/** @type {number[]} */ (k === 1 ? data1 : data2), center)
      : given(
          /** @type {number} */ (input[`n${k}`]),
          /** @type {number} */ (input[`mean${k}`]),
          /** @type {number} */ (input[`sd${k}`]),
          0,
        );
  const s1 = toSummary(1);
  const s2 = toSummary(2);
  if (!(s1.sd > 0 || s2.sd > 0))
    return fail(
      "ZERO_VARIANCE",
      "Every value within each sample is the same, so both standard deviations are 0 and t is undefined.",
      "data1",
    );

  const tok = (/** @type {Summary} */ s, /** @type {number} */ value) =>
    s.raw ? v(value) : exact(value);
  const var1 = s1.sd * s1.sd;
  const var2 = s2.sd * s2.sd;
  const a1 = var1 / s1.n;
  const a2 = var2 / s2.n;
  const estimate = s1.offset - s2.offset; // = x̄₁ − x̄₂, without cancelling two large means
  /** @type {Step[]} */
  const preSteps = [
    ...summarySteps(s1, "sample1", "Sample 1", { x: "x₁", mean: "x̄₁", sd: "s₁", n: "n₁" }),
    ...summarySteps(s2, "sample2", "Sample 2", { x: "x₂", mean: "x̄₂", sd: "s₂", n: "n₂" }),
  ];
  /** @type {Step} */
  let seStep;
  let standardError;
  let df;
  /** @type {Record<string, number>} */
  const details = { n1: s1.n, mean1: s1.mean, sd1: s1.sd, n2: s2.n, mean2: s2.mean, sd2: s2.sd };
  /** @type {string[]} */
  const warnings =
    s1.n < 30 || s2.n < 30
      ? [
          "At least one sample is small (n < 30). The t-test assumes both populations are approximately normal.",
        ]
      : [];

  if (pooled) {
    df = s1.n + s2.n - 2;
    const pooledVar = ((s1.n - 1) * var1 + (s2.n - 1) * var2) / df;
    const sp = Math.sqrt(pooledVar);
    const root = Math.sqrt(1 / s1.n + 1 / s2.n);
    standardError = sp * root;
    details.pooledVariance = pooledVar;
    if (Math.max(var1, var2) > 4 * Math.min(var1, var2))
      warnings.push(
        "One sample variance is more than 4 times the other, so the equal-variance assumption is doubtful. Welch's test (the default) does not need it.",
      );
    preSteps.push(
      {
        id: "pooled-variance",
        title: "Pooled variance",
        formula: "s_p² = [(n₁ − 1)s₁² + (n₂ − 1)s₂²] / (n₁ + n₂ − 2)",
        substitution: [
          "s_p² = [(",
          exact(s1.n),
          " − 1)(",
          tok(s1, s1.sd),
          ")² + (",
          exact(s2.n),
          " − 1)(",
          tok(s2, s2.sd),
          ")²] / ",
          exact(df),
          " = ",
          v(pooledVar),
        ],
        result: pooledVar,
        explanation:
          "Both samples are assumed to share one population variance, so their variances are combined, weighted by their degrees of freedom.",
      },
      {
        id: "df",
        title: "Degrees of freedom",
        formula: "df = n₁ + n₂ − 2",
        substitution: ["df = ", exact(s1.n), " + ", exact(s2.n), " − 2 = ", exact(df)],
        result: df,
        explanation: "One degree of freedom is used for each estimated mean.",
      },
    );
    seStep = {
      id: "standard-error",
      title: "Standard error of the difference",
      formula: "SE = s_p · √(1/n₁ + 1/n₂)",
      substitution: [
        "SE = √",
        v(pooledVar),
        " · √(1/",
        exact(s1.n),
        " + 1/",
        exact(s2.n),
        ") = ",
        v(sp),
        " · ",
        v(root),
        " = ",
        v(standardError),
      ],
      result: standardError,
      explanation: "How much x̄₁ − x̄₂ is expected to vary from sample to sample.",
    };
  } else {
    standardError = Math.sqrt(a1 + a2);
    df = ((a1 + a2) * (a1 + a2)) / ((a1 * a1) / (s1.n - 1) + (a2 * a2) / (s2.n - 1));
    preSteps.push({
      id: "df",
      title: "Degrees of freedom (Welch–Satterthwaite)",
      formula: "df = (s₁²/n₁ + s₂²/n₂)² / [(s₁²/n₁)²/(n₁ − 1) + (s₂²/n₂)²/(n₂ − 1)]",
      substitution: [
        "df = (",
        v(a1),
        " + ",
        v(a2),
        ")² / [",
        v(a1),
        "²/",
        exact(s1.n - 1),
        " + ",
        v(a2),
        "²/",
        exact(s2.n - 1),
        "] = ",
        v(df),
      ],
      result: df,
      explanation:
        "Welch's test does not assume equal variances, so df is estimated from the data and is usually not a whole number.",
    });
    seStep = {
      id: "standard-error",
      title: "Standard error of the difference",
      formula: "SE = √(s₁²/n₁ + s₂²/n₂)",
      substitution: [
        "SE = √(",
        tok(s1, s1.sd),
        "²/",
        exact(s1.n),
        " + ",
        tok(s2, s2.sd),
        "²/",
        exact(s2.n),
        ") = √(",
        v(a1),
        " + ",
        v(a2),
        ") = ",
        v(standardError),
      ],
      result: standardError,
      explanation: "Each sample contributes its own variance, since they are not assumed equal.",
    };
  }
  details.standardError = standardError;
  details.df = df;

  const numerator = s1.offset - s2.offset - delta0;
  return finish({
    test: "two-sample",
    tail,
    alpha,
    parameter: "μ₁ − μ₂",
    nullValue: delta0,
    estimate,
    standardError,
    difference: numerator,
    df,
    details,
    warnings,
    preSteps,
    setupSteps: [seStep],
    statStep: {
      id: "t",
      title: "Test statistic t",
      formula: "t = [(x̄₁ − x̄₂) − D₀] / SE",
      substitution: [
        "t = [(",
        tok(s1, s1.mean),
        " − ",
        tok(s2, s2.mean),
        ") − ",
        exact(delta0),
        "] / ",
        v(standardError),
        " = ",
        v(numerator),
        " / ",
        v(standardError),
        " = ",
        v(numerator / standardError),
      ],
      result: null,
      explanation:
        "How many standard errors the observed difference lies from the difference in H₀.",
    },
  });
}
