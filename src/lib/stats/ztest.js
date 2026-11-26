// @ts-check
import { decide, exact, firstFailure, TAIL_OPERATOR, v } from "./decision.js";
import { criticalZ, pValue } from "./normal.js";
import { fail, ok } from "./result.js";
import {
  checkAlpha,
  checkClosedProbability,
  checkFinite,
  checkOpenProbability,
  checkSampleSize,
  checkSigma,
  checkTail,
} from "./validation.js";

/** @typedef {import('./normal.js').Tail} Tail */
/** @typedef {'one-mean' | 'one-proportion' | 'two-means' | 'two-proportions'} ZTestType */
/** @typedef {import('./decision.js').Step} Step */

/**
 * A z-test result: the shared TestResult plus `z` (same value as `statistic`).
 * @typedef {import('./decision.js').TestResult & { test: ZTestType, z: number }} ZTestResult
 */

export { TAIL_OPERATOR };

/** @type {import('./decision.js').Distribution} */
const Z_DIST = {
  symbol: "z",
  critical: criticalZ,
  pValue,
  criticalFormula: {
    two: "z_(α/2) = Φ⁻¹(1 − α/2)",
    right: "z_α = Φ⁻¹(1 − α)",
    left: "−z_α = Φ⁻¹(α)",
  },
  criticalPrefix: [],
  probability: "P(Z ≥ ",
  df: null,
};

/**
 * Run the shared decision with the normal distribution and add the `z` alias.
 * @param {Omit<Parameters<typeof decide>[0], 'dist' | 'statStep'> & { zStep: Step }} spec
 * @returns {import('./result.js').Result<ZTestResult>}
 */
function decideZ({ zStep, ...spec }) {
  const outcome = decide({ ...spec, dist: Z_DIST, statStep: zStep });
  if (!outcome.ok) return outcome;
  return ok({
    ...outcome.value,
    test: /** @type {ZTestType} */ (spec.test),
    z: outcome.value.statistic,
  });
}

/**
 * One-sample z-test for a mean (population σ known).
 * z = (x̄ − μ₀) / (σ / √n)
 *
 * @param {{ sampleMean: number, mu0: number, sigma: number, n: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<ZTestResult>}
 */
export function oneMeanZTest({ sampleMean, mu0, sigma, n, alpha, tail }) {
  const failure = firstFailure([
    checkFinite(sampleMean, "sampleMean", "The sample mean x̄"),
    checkFinite(mu0, "mu0", "The hypothesized mean μ₀"),
    checkSigma(sigma, "sigma", "The population standard deviation σ"),
    checkSampleSize(n, "n", "The sample size n"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  const sqrtN = Math.sqrt(n);
  const standardError = sigma / sqrtN;
  const difference = sampleMean - mu0;
  return decideZ({
    test: "one-mean",
    tail,
    alpha,
    parameter: "μ",
    nullValue: mu0,
    estimate: sampleMean,
    standardError,
    details: { standardError },
    warnings:
      n < 30
        ? [
            "The sample is small (n < 30). The z-test is valid only if the population is normally distributed.",
          ]
        : [],
    setupSteps: [
      {
        id: "standard-error",
        title: "Standard error of the mean",
        formula: "σ_x̄ = σ / √n",
        substitution: [
          "σ_x̄ = ",
          exact(sigma),
          " / √",
          exact(n),
          " = ",
          exact(sigma),
          " / ",
          v(sqrtN),
          " = ",
          v(standardError),
        ],
        result: standardError,
        explanation: "How much the sample mean is expected to vary from sample to sample.",
      },
    ],
    zStep: {
      id: "z",
      title: "Test statistic z",
      formula: "z = (x̄ − μ₀) / σ_x̄",
      substitution: [
        "z = (",
        exact(sampleMean),
        " − ",
        exact(mu0),
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
      explanation: "How many standard errors the sample mean lies from the hypothesized mean.",
    },
  });
}

/**
 * One-sample z-test for a proportion.
 * z = (p̂ − p₀) / √(p₀(1 − p₀) / n)
 *
 * Give either `successes` (a whole number from 0 to n) or `sampleProportion`.
 *
 * @param {{ successes?: number, sampleProportion?: number, n: number, p0: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<ZTestResult>}
 */
export function oneProportionZTest({ successes, sampleProportion, n, p0, alpha, tail }) {
  const failure = firstFailure([
    checkSampleSize(n, "n", "The sample size n"),
    successes !== undefined
      ? checkSuccesses(successes, n, "successes", "The number of successes x")
      : checkClosedProbability(sampleProportion, "sampleProportion", "The sample proportion p̂"),
    checkOpenProbability(p0, "p0", "The hypothesized proportion p₀"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  const pHat = successes !== undefined ? successes / n : /** @type {number} */ (sampleProportion);
  const variance = (p0 * (1 - p0)) / n;
  const standardError = Math.sqrt(variance);
  const difference = pHat - p0;
  /** @type {string[]} */
  const warnings = [];
  if (n * p0 < 10 || n * (1 - p0) < 10) {
    warnings.push(
      `np₀ = ${round6(n * p0)} and n(1 − p₀) = ${round6(n * (1 - p0))} should both be at least 10 for the normal approximation to be accurate.`,
    );
  }

  /** @type {Step[]} */
  const setupSteps = [];
  if (successes !== undefined) {
    setupSteps.push({
      id: "p-hat",
      title: "Sample proportion",
      formula: "p̂ = x / n",
      substitution: ["p̂ = ", exact(successes), " / ", exact(n), " = ", v(pHat)],
      result: pHat,
      explanation: "The proportion of successes observed in the sample.",
    });
  }
  setupSteps.push({
    id: "standard-error",
    title: "Standard error of the proportion",
    formula: "σ_p̂ = √[p₀(1 − p₀) / n]",
    substitution: [
      "σ_p̂ = √[",
      exact(p0),
      "(1 − ",
      exact(p0),
      ") / ",
      exact(n),
      "] = √",
      v(variance),
      " = ",
      v(standardError),
    ],
    result: standardError,
    explanation: "Uses p₀ (not p̂) because the test assumes H₀ is true.",
  });

  return decideZ({
    test: "one-proportion",
    tail,
    alpha,
    parameter: "p",
    nullValue: p0,
    estimate: pHat,
    standardError,
    details: { sampleProportion: pHat, standardError },
    warnings,
    setupSteps,
    zStep: {
      id: "z",
      title: "Test statistic z",
      formula: "z = (p̂ − p₀) / σ_p̂",
      substitution: [
        "z = (",
        v(pHat),
        " − ",
        exact(p0),
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
      explanation:
        "How many standard errors the sample proportion lies from the hypothesized proportion.",
    },
  });
}

/**
 * Two-sample z-test for the difference of means (both population σ known).
 * z = [(x̄₁ − x̄₂) − D₀] / √(σ₁²/n₁ + σ₂²/n₂)
 *
 * @param {{ mean1: number, sigma1: number, n1: number, mean2: number, sigma2: number, n2: number, delta0?: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<ZTestResult>}
 */
export function twoMeansZTest({ mean1, sigma1, n1, mean2, sigma2, n2, delta0 = 0, alpha, tail }) {
  const failure = firstFailure([
    checkFinite(mean1, "mean1", "The mean of sample 1 (x̄₁)"),
    checkSigma(sigma1, "sigma1", "σ₁"),
    checkSampleSize(n1, "n1", "n₁"),
    checkFinite(mean2, "mean2", "The mean of sample 2 (x̄₂)"),
    checkSigma(sigma2, "sigma2", "σ₂"),
    checkSampleSize(n2, "n2", "n₂"),
    checkFinite(delta0, "delta0", "The hypothesized difference D₀"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  const var1 = (sigma1 * sigma1) / n1;
  const var2 = (sigma2 * sigma2) / n2;
  const standardError = Math.sqrt(var1 + var2);
  const estimate = mean1 - mean2;
  const difference = estimate - delta0;

  return decideZ({
    test: "two-means",
    tail,
    alpha,
    parameter: "μ₁ − μ₂",
    nullValue: delta0,
    estimate,
    standardError,
    details: { difference: estimate, standardError },
    warnings:
      n1 < 30 || n2 < 30
        ? [
            "At least one sample is small (n < 30). The z-test is valid only if both populations are normally distributed.",
          ]
        : [],
    setupSteps: [
      {
        id: "difference",
        title: "Difference of sample means",
        formula: "x̄₁ − x̄₂",
        substitution: [exact(mean1), " − ", exact(mean2), " = ", v(estimate)],
        result: estimate,
        explanation: "The observed difference between the two sample means.",
      },
      {
        id: "standard-error",
        title: "Standard error of the difference",
        formula: "σ_(x̄₁−x̄₂) = √(σ₁²/n₁ + σ₂²/n₂)",
        substitution: [
          "√(",
          exact(sigma1),
          "²/",
          exact(n1),
          " + ",
          exact(sigma2),
          "²/",
          exact(n2),
          ") = √(",
          v(var1),
          " + ",
          v(var2),
          ") = ",
          v(standardError),
        ],
        result: standardError,
        explanation: "Combines the variability of both sample means.",
      },
    ],
    zStep: {
      id: "z",
      title: "Test statistic z",
      formula: "z = [(x̄₁ − x̄₂) − D₀] / σ_(x̄₁−x̄₂)",
      substitution: [
        "z = (",
        v(estimate),
        " − ",
        exact(delta0),
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
      explanation:
        "How many standard errors the observed difference lies from the hypothesized difference D₀.",
    },
  });
}

/**
 * Two-sample z-test for the difference of proportions (pooled, H₀: p₁ = p₂).
 * z = (p̂₁ − p̂₂) / √[p̄(1 − p̄)(1/n₁ + 1/n₂)],  p̄ = (x₁ + x₂) / (n₁ + n₂)
 *
 * Give either `x1`/`x2` (successes) or `p1`/`p2` (sample proportions).
 *
 * @param {{ x1?: number, n1: number, x2?: number, n2: number, p1?: number, p2?: number, alpha: number, tail: Tail }} input
 * @returns {import('./result.js').Result<ZTestResult>}
 */
export function twoProportionsZTest({ x1, n1, x2, n2, p1, p2, alpha, tail }) {
  const useCounts = x1 !== undefined || x2 !== undefined;
  const failure = firstFailure([
    checkSampleSize(n1, "n1", "n₁"),
    checkSampleSize(n2, "n2", "n₂"),
    useCounts ? checkSuccesses(x1, n1, "x1", "x₁") : checkClosedProbability(p1, "p1", "p̂₁"),
    useCounts ? checkSuccesses(x2, n2, "x2", "x₂") : checkClosedProbability(p2, "p2", "p̂₂"),
    checkAlpha(alpha),
    checkTail(tail),
  ]);
  if (failure) return failure;

  const successes1 = useCounts ? /** @type {number} */ (x1) : /** @type {number} */ (p1) * n1;
  const successes2 = useCounts ? /** @type {number} */ (x2) : /** @type {number} */ (p2) * n2;
  const pHat1 = useCounts ? successes1 / n1 : /** @type {number} */ (p1);
  const pHat2 = useCounts ? successes2 / n2 : /** @type {number} */ (p2);
  const pooled = (successes1 + successes2) / (n1 + n2);
  const inverseSum = 1 / n1 + 1 / n2;
  const standardError = Math.sqrt(pooled * (1 - pooled) * inverseSum);
  const estimate = pHat1 - pHat2;

  /** @type {string[]} */
  const warnings = [];
  if ([successes1, n1 - successes1, successes2, n2 - successes2].some((count) => count < 10)) {
    warnings.push(
      "Each sample should have at least 10 successes and 10 failures for the normal approximation to be accurate.",
    );
  }

  /** @type {Step[]} */
  const setupSteps = [];
  if (useCounts) {
    setupSteps.push({
      id: "p-hats",
      title: "Sample proportions",
      formula: "p̂₁ = x₁ / n₁,  p̂₂ = x₂ / n₂",
      substitution: [
        "p̂₁ = ",
        exact(successes1),
        " / ",
        exact(n1),
        " = ",
        v(pHat1),
        ",  p̂₂ = ",
        exact(successes2),
        " / ",
        exact(n2),
        " = ",
        v(pHat2),
      ],
      result: null,
      explanation: "The proportion of successes in each sample.",
    });
  }
  setupSteps.push(
    {
      id: "pooled",
      title: "Pooled proportion",
      formula: "p̄ = (x₁ + x₂) / (n₁ + n₂)",
      substitution: [
        "p̄ = (",
        useCounts ? exact(successes1) : v(successes1),
        " + ",
        useCounts ? exact(successes2) : v(successes2),
        ") / (",
        exact(n1),
        " + ",
        exact(n2),
        ") = ",
        v(pooled),
      ],
      result: pooled,
      explanation:
        "Under H₀ both populations share one proportion, so both samples are combined to estimate it.",
    },
    {
      id: "standard-error",
      title: "Standard error of the difference",
      formula: "σ_(p̂₁−p̂₂) = √[p̄(1 − p̄)(1/n₁ + 1/n₂)]",
      substitution: [
        "√[",
        v(pooled),
        "(1 − ",
        v(pooled),
        ")(1/",
        exact(n1),
        " + 1/",
        exact(n2),
        ")] = ",
        v(standardError),
      ],
      result: standardError,
      explanation: "The expected variability of p̂₁ − p̂₂ if H₀ is true.",
    },
  );

  return decideZ({
    test: "two-proportions",
    tail,
    alpha,
    parameter: "p₁ − p₂",
    nullValue: 0,
    estimate,
    standardError,
    details: {
      sampleProportion1: pHat1,
      sampleProportion2: pHat2,
      pooledProportion: pooled,
      standardError,
    },
    warnings,
    setupSteps,
    zStep: {
      id: "z",
      title: "Test statistic z",
      formula: "z = (p̂₁ − p̂₂) / σ_(p̂₁−p̂₂)",
      substitution: [
        "z = (",
        v(pHat1),
        " − ",
        v(pHat2),
        ") / ",
        v(standardError),
        " = ",
        v(estimate),
        " / ",
        v(standardError),
        " = ",
        v(estimate / standardError),
      ],
      result: null,
      explanation: "How many standard errors apart the two sample proportions are.",
    },
  });
}

/**
 * @param {unknown} successes
 * @param {number} n
 * @param {string} field
 * @param {string} label
 */
function checkSuccesses(successes, n, field, label) {
  return Number.isSafeInteger(successes) &&
    /** @type {number} */ (successes) >= 0 &&
    /** @type {number} */ (successes) <= n
    ? null
    : fail("SUCCESSES_OUT_OF_RANGE", `${label} must be a whole number from 0 to ${n}.`, field);
}

/** @param {number} value */
function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
