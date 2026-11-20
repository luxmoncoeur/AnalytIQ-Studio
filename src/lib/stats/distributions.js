// @ts-check
import { inverseNormalCdf } from "./normal.js";
import { logBeta, regIncBeta, regIncBetaHalfLargeA } from "./special.js";

/**
 * Student's t distribution (and, in later sections, χ² and F) built on the
 * regularized incomplete beta function in special.js.
 *
 * Upper-tail areas are computed directly from Iₓ, never as 1 − CDF, so small
 * p-values keep full relative precision. Quantiles are found by a safeguarded
 * Newton iteration on ln(upper tail), which stays well-conditioned for tiny α.
 */

/** @typedef {import('./normal.js').Tail} Tail */

const MAX_SOLVER_STEPS = 400;
/** Above this ν the BGRAT expansion is more accurate than the continued fraction (≈ ν·ε error). */
const LARGE_DF = 1000;

/**
 * Tail area beyond |t|: P(T ≥ |t|) = ½·I_{ν/(ν+t²)}(ν/2, ½).
 * @param {number} t
 * @param {number} df
 */
function tTailBeyond(t, df) {
  const t2 = t * t;
  const x = 1 / (1 + t2 / df); // ν/(ν + t²)
  const y = 1 / (1 + df / t2); // t²/(ν + t²), exact for small t
  return (
    0.5 * (df >= LARGE_DF ? regIncBetaHalfLargeA(df / 2, x, y) : regIncBeta(df / 2, 0.5, x, y))
  );
}

/**
 * Student's t density.
 * @param {number} t
 * @param {number} df  Degrees of freedom ν > 0.
 */
export function tPdf(t, df) {
  return (
    Math.exp(-((df + 1) / 2) * Math.log1p((t * t) / df) - logBeta(df / 2, 0.5)) / Math.sqrt(df)
  );
}

/**
 * P(T ≤ t).
 * @param {number} t
 * @param {number} df
 */
export function tCdf(t, df) {
  const beyond = tTailBeyond(t, df);
  return t <= 0 ? beyond : 1 - beyond;
}

/**
 * P(T ≥ t), computed directly.
 * @param {number} t
 * @param {number} df
 */
export function tSf(t, df) {
  const beyond = tTailBeyond(t, df);
  return t >= 0 ? beyond : 1 - beyond;
}

/**
 * Find x ≥ 0 with sf(x) = q, for a decreasing upper-tail function sf.
 * Newton on ln sf(x) − ln q, kept inside a bracket that shrinks every step and
 * falls back to bisection whenever Newton would leave it.
 *
 * @param {(x: number) => number} sf
 * @param {(x: number) => number} pdf
 * @param {number} q      Target upper-tail area, 0 < q < sf(0).
 * @param {number} guess  Starting point > 0.
 * @returns {number}
 */
export function solveUpperQuantile(sf, pdf, q, guess) {
  const target = Math.log(q);
  let lo = 0;
  let hi = Math.max(guess, 1);
  while (sf(hi) > q) {
    lo = hi;
    hi *= 2;
  }
  let x = guess > lo && guess < hi ? guess : (lo + hi) / 2;
  for (let i = 0; i < MAX_SOLVER_STEPS; i += 1) {
    const s = sf(x);
    if (s > q) lo = x;
    else hi = x;
    const density = pdf(x);
    let next = density > 0 ? x + ((Math.log(s) - target) * s) / density : Number.NaN;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - x) <= 2e-16 * Math.abs(next) || next === lo || next === hi) return next;
    x = next;
  }
  /* v8 ignore next -- @preserve */
  return x; // shortcut: Newton converges in < 20 steps on every fixture; 400 is a hard stop.
}

/**
 * Upper quantile of t: the value with P(T ≥ t) = q.
 * Closed forms for ν = 1 and ν = 2, Newton otherwise.
 * @param {number} q   0 < q < 1
 * @param {number} df
 * @returns {number}
 */
export function tIsf(q, df) {
  if (q > 0.5) return -tIsf(1 - q, df);
  if (q === 0.5) return 0;
  if (df === 1) return 1 / Math.tan(Math.PI * q);
  if (df === 2) return (1 - 2 * q) / Math.sqrt(2 * q * (1 - q));
  // Cornish–Fisher start from the normal quantile.
  const z = -inverseNormalCdf(q);
  const z3 = z * z * z;
  const guess = z + (z3 + z) / (4 * df) + (5 * z3 * z * z + 16 * z3 + 3 * z) / (96 * df * df);
  return solveUpperQuantile(
    (t) => tSf(t, df),
    (t) => tPdf(t, df),
    q,
    guess,
  );
}

/**
 * Inverse CDF of t: the value with P(T ≤ t) = p.
 * @param {number} p  0 < p < 1
 * @param {number} df
 */
export function tInv(p, df) {
  return -tIsf(p, df);
}

/**
 * Critical t-value(s) bounding the rejection region for α.
 * @param {number} alpha
 * @param {Tail} tail
 * @param {number} df
 * @returns {{ lower: number | null, upper: number | null }}
 */
export function criticalT(alpha, tail, df) {
  if (tail === "two") {
    const upper = tIsf(alpha / 2, df);
    return { lower: -upper, upper };
  }
  if (tail === "right") return { lower: null, upper: tIsf(alpha, df) };
  return { lower: -tIsf(alpha, df), upper: null };
}

/**
 * p-value of an observed t statistic.
 * @param {number} t
 * @param {Tail} tail
 * @param {number} df
 */
export function tPValue(t, tail, df) {
  if (tail === "left") return tCdf(t, df);
  if (tail === "right") return tSf(t, df);
  return Math.min(1, 2 * tTailBeyond(t, df));
}
