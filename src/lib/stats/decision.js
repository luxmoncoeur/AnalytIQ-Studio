// @ts-check
import { fail, ok } from "./result.js";

/**
 * Shared second half of every z- and t-test: critical values, p-value,
 * decision, conclusion and the closing solution steps. The distribution is
 * passed in, so the same code and wording serve both tests.
 */

/** @typedef {import('./normal.js').Tail} Tail */

/**
 * Substitution token: literal text, a computed number (formatted to the chosen
 * decimals), or a user input shown exactly as entered (`exact: true`).
 * @typedef {string | { value: number, exact?: boolean }} Token
 */

/**
 * @typedef {object} Step
 * @property {string} id
 * @property {string} title
 * @property {string} formula
 * @property {Token[]} substitution
 * @property {number | null} result
 * @property {string} explanation
 */

/**
 * How the test statistic is distributed under H₀.
 * @typedef {object} Distribution
 * @property {'z' | 't'} symbol                  Statistic symbol shown in the steps.
 * @property {(alpha: number, tail: Tail) => { lower: number | null, upper: number | null }} critical
 * @property {(statistic: number, tail: Tail) => number} pValue
 * @property {{ two: string, right: string, left: string }} criticalFormula
 * @property {Token[]} criticalPrefix            Tokens shown before "α = …" (e.g. "df = 9, ").
 * @property {string} probability                Probability text, e.g. "P(Z ≥ " or "P(T₉ ≥ ".
 * @property {number | null} df
 */

/**
 * @typedef {object} TestResult
 * @property {string} test
 * @property {Tail} tail
 * @property {number} alpha
 * @property {string} parameter      Symbol of the parameter tested, e.g. "μ".
 * @property {number} nullValue      Value of the parameter under H₀.
 * @property {{ null: string, alternative: string }} hypotheses
 * @property {number} estimate       Point estimate (x̄, p̂, x̄₁ − x̄₂, …).
 * @property {number} standardError
 * @property {'z' | 't'} symbol
 * @property {number} statistic      The z or t value.
 * @property {number | null} df      Degrees of freedom (null for z).
 * @property {{ lower: number | null, upper: number | null }} critical
 * @property {number} pValue
 * @property {boolean} reject        Decision by the critical-value rule.
 * @property {boolean} rejectByPValue Decision by the p-value rule (p ≤ α).
 * @property {string} conclusion
 * @property {Record<string, number>} details  Intermediate values.
 * @property {Step[]} steps
 * @property {string[]} warnings
 */

export const TAIL_OPERATOR = /** @type {const} */ ({ two: "≠", right: ">", left: "<" });

/** @param {number} value @returns {{ value: number }} */
export const v = (value) => ({ value });
/** @param {number} value @returns {{ value: number, exact: true }} */
export const exact = (value) => ({ value, exact: true });

/**
 * @param {number} statistic
 * @param {Tail} tail
 * @param {{ lower: number | null, upper: number | null }} critical
 */
function inRejectionRegion(statistic, tail, critical) {
  if (tail === "two")
    return (
      statistic <= /** @type {number} */ (critical.lower) ||
      statistic >= /** @type {number} */ (critical.upper)
    );
  if (tail === "right") return statistic >= /** @type {number} */ (critical.upper);
  return statistic <= /** @type {number} */ (critical.lower);
}

/**
 * @param {Array<import('./validation.js').Failure | null>} checks
 */
export function firstFailure(checks) {
  return checks.find((check) => check !== null) ?? null;
}

/**
 * @param {object} spec
 * @param {string} spec.test
 * @param {Tail} spec.tail
 * @param {number} spec.alpha
 * @param {string} spec.parameter
 * @param {number} spec.nullValue
 * @param {number} spec.estimate
 * @param {number} spec.standardError
 * @param {number} [spec.difference]  estimate − nullValue when the caller computed it more accurately.
 * @param {Distribution} spec.dist
 * @param {Step[]} [spec.preSteps]  Steps shown before the critical value (e.g. degrees of freedom).
 * @param {Step[]} spec.setupSteps   Test-specific steps (estimate, standard error).
 * @param {Step} spec.statStep       Test-specific statistic step (result filled in here).
 * @param {Record<string, number>} spec.details
 * @param {string[]} spec.warnings
 * @param {string} [spec.zeroErrorMessage]
 * @returns {import('./result.js').Result<TestResult>}
 */
export function decide(spec) {
  const { test, tail, alpha, parameter, nullValue, estimate, standardError, dist } = spec;
  const s = dist.symbol;
  if (!(standardError > 0) || !Number.isFinite(standardError)) {
    return fail(
      "ZERO_STANDARD_ERROR",
      spec.zeroErrorMessage ??
        "The standard error is 0, so z cannot be computed. This happens when every observation is a success or every observation is a failure.",
    );
  }
  const statistic = (spec.difference ?? estimate - nullValue) / standardError;
  if (!Number.isFinite(statistic))
    return fail("NON_FINITE", `The values are too large to compute a ${s} statistic.`);

  const critical = dist.critical(alpha, tail);
  const p = dist.pValue(statistic, tail);
  const reject = inRejectionRegion(statistic, tail, critical);
  const operator = TAIL_OPERATOR[tail];
  const nullText = `${parameter} = ${nullValue}`;
  const altText = `${parameter} ${operator} ${nullValue}`;
  const conclusion = reject
    ? `Reject H₀. At α = ${alpha}, there is sufficient evidence to conclude that ${altText}.`
    : `Fail to reject H₀. At α = ${alpha}, there is not enough evidence to conclude that ${altText}.`;

  const sc = /** @type {number} */ (tail === "left" ? critical.lower : critical.upper);
  const criticalStep = {
    two: {
      substitution: [
        ...dist.criticalPrefix,
        "α = ",
        exact(alpha),
        ", α/2 = ",
        v(alpha / 2),
        ` → critical values ${s} = ±`,
        v(sc),
      ],
      explanation: `In a two-tailed test, α is split equally between both tails (${alpha / 2} in each), so H₀ is rejected when ${s} falls below −${s}_(α/2) or above +${s}_(α/2).`,
    },
    right: {
      substitution: [
        ...dist.criticalPrefix,
        "α = ",
        exact(alpha),
        ` → critical value ${s} = `,
        v(sc),
      ],
      explanation: `In a right-tailed test, all of α sits in the upper tail, so H₀ is rejected when ${s} is at or above the critical value.`,
    },
    left: {
      substitution: [
        ...dist.criticalPrefix,
        "α = ",
        exact(alpha),
        ` → critical value ${s} = `,
        v(sc),
      ],
      explanation: `In a left-tailed test, all of α sits in the lower tail, so H₀ is rejected when ${s} is at or below the critical value.`,
    },
  }[tail];

  const P = dist.probability;
  const pStep = {
    two: {
      formula: `p = 2 · ${P}|${s}|)`,
      substitution: [`p = 2 · ${P}`, v(Math.abs(statistic)), ") = ", v(p)],
    },
    right: { formula: `p = ${P}${s})`, substitution: [`p = ${P}`, v(statistic), ") = ", v(p)] },
    left: {
      formula: `p = ${P.replace("≥", "≤")}${s})`,
      substitution: [`p = ${P.replace("≥", "≤")}`, v(statistic), ") = ", v(p)],
    },
  }[tail];

  const decisionStep = {
    two: {
      formula: `Reject H₀ if |${s}| ≥ ${s}_(α/2)`,
      substitution: [`|${s}| = `, v(Math.abs(statistic)), reject ? " ≥ " : " < ", v(sc)],
    },
    right: {
      formula: `Reject H₀ if ${s} ≥ ${s}_α`,
      substitution: [`${s} = `, v(statistic), reject ? " ≥ " : " < ", v(sc)],
    },
    left: {
      formula: `Reject H₀ if ${s} ≤ −${s}_α`,
      substitution: [`${s} = `, v(statistic), reject ? " ≤ " : " > ", v(sc)],
    },
  }[tail];

  /** @type {Step[]} */
  const steps = [
    {
      id: "hypotheses",
      title: "State the hypotheses",
      formula: `H₀: ${nullText}    Hₐ: ${altText}`,
      substitution: [
        `H₀: ${parameter} = `,
        exact(nullValue),
        `    Hₐ: ${parameter} ${operator} `,
        exact(nullValue),
      ],
      result: null,
      explanation: `H₀ is the claim of no difference. Hₐ uses "${operator}", so this is a ${tail === "two" ? "two" : tail}-tailed test.`,
    },
    ...(spec.preSteps ?? []),
    {
      id: "critical",
      title: "Level of significance and critical value",
      formula: dist.criticalFormula[tail],
      substitution: criticalStep.substitution,
      result: sc,
      explanation: criticalStep.explanation,
    },
    ...spec.setupSteps,
    { ...spec.statStep, result: statistic },
    {
      id: "p-value",
      title: "p-value",
      formula: pStep.formula,
      substitution: pStep.substitution,
      result: p,
      explanation: `The p-value is the probability of getting a ${s} at least this extreme if H₀ were true. Smaller p-values mean stronger evidence against H₀.`,
    },
    {
      id: "decision",
      title: "Decision",
      formula: decisionStep.formula,
      substitution: [
        ...decisionStep.substitution,
        reject ? " → Reject H₀" : " → Fail to reject H₀",
      ],
      result: null,
      explanation: `Cross-check with the p-value: p ${p <= alpha ? "≤" : ">"} α (${alpha}), which leads to the same decision.`,
    },
  ];

  return ok({
    test,
    tail,
    alpha,
    parameter,
    nullValue,
    hypotheses: { null: nullText, alternative: altText },
    estimate,
    standardError,
    symbol: s,
    statistic,
    df: dist.df,
    critical,
    pValue: p,
    reject,
    rejectByPValue: p <= alpha,
    conclusion,
    details: spec.details,
    steps,
    warnings: spec.warnings,
  });
}
