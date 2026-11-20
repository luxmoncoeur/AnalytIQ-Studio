// @ts-check
import { erfc } from "./normal.js";

/**
 * Special functions behind the t, χ² and F distributions.
 *
 * - logGamma: Stirling series for x ≥ 10, shifted up by the recurrence
 *   Γ(x + 1) = x·Γ(x) below that, so every value comes from one formula.
 * - logBeta: the Stirling form with log1p, so the large terms of
 *   lnΓ(a) + lnΓ(b) − lnΓ(a + b) cancel analytically, not numerically
 *   (needed for df in the millions).
 * - regIncBeta: the regularized incomplete beta function Iₓ(a, b), evaluated with
 *   the continued fraction of Numerical Recipes §6.4 using the modified Lentz
 *   method. x and y = 1 − x are both passed in so callers can supply whichever
 *   one they can compute exactly (e.g. y = t²/(ν + t²) for a small t).
 */

const HALF_LOG_2PI = 0.9189385332046728; // ½·ln(2π)
const STIRLING_MIN = 10;
const EPS = 1e-16;
const TINY = 1e-300;
const MAX_ITERATIONS = 100_000;

/** Lentz's guard against a zero denominator. @param {number} z */
const nonZero = (z) => (Math.abs(z) < TINY ? TINY : z);

/**
 * Stirling remainder δ(x) = lnΓ(x) − [(x − ½)ln x − x + ½ln(2π)], for x ≥ 10.
 * Terms through x⁻¹¹; the first omitted term is below 1e-15 at x = 10.
 * @param {number} x
 */
function stirlingRemainder(x) {
  const r = 1 / (x * x);
  return (
    (1 / 12 -
      r * (1 / 360 - r * (1 / 1260 - r * (1 / 1680 - r * (1 / 1188 - (r * 691) / 360360))))) /
    x
  );
}

/**
 * Natural log of the gamma function for x > 0.
 * @param {number} x
 * @returns {number}
 */
export function logGamma(x) {
  if (!(x > 0)) return Number.NaN;
  if (x >= STIRLING_MIN) return (x - 0.5) * Math.log(x) - x + HALF_LOG_2PI + stirlingRemainder(x);
  let product = 1;
  let shifted = x;
  while (shifted < STIRLING_MIN) {
    product *= shifted;
    shifted += 1;
  }
  return logGamma(shifted) - Math.log(product);
}

/**
 * lnΓ(a) − lnΓ(a + b) for a ≥ 10, without subtracting two large numbers.
 * @param {number} a
 * @param {number} b
 */
function logGammaRatio(a, b) {
  return (
    -(a - 0.5) * Math.log1p(b / a) -
    b * Math.log(a + b) +
    b +
    stirlingRemainder(a) -
    stirlingRemainder(a + b)
  );
}

/**
 * Natural log of the beta function B(a, b) = Γ(a)Γ(b)/Γ(a + b), for a, b > 0.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export function logBeta(a, b) {
  const small = Math.min(a, b);
  const large = Math.max(a, b);
  if (large < STIRLING_MIN) return logGamma(small) + logGamma(large) - logGamma(small + large);
  return logGamma(small) + logGammaRatio(large, small);
}

/**
 * Continued fraction for Iₓ(a, b) (converges fast for x < (a + 1)/(a + b + 2)).
 * @param {number} a
 * @param {number} b
 * @param {number} x
 */
function betaContinuedFraction(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 / nonZero(1 - (qab * x) / qap);
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 / nonZero(1 + aa * d);
    c = nonZero(1 + aa / c);
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 / nonZero(1 + aa * d);
    c = nonZero(1 + aa / c);
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) <= EPS) return h;
  }
  /* v8 ignore next -- @preserve */
  return h; // shortcut: not reached for a, b ≤ 1e7 (the inputs' range); add asymptotics beyond that.
}

/**
 * Regularized incomplete beta function Iₓ(a, b), with y = 1 − x supplied by the caller.
 * @param {number} a  > 0
 * @param {number} b  > 0
 * @param {number} x  in [0, 1]
 * @param {number} [y]  1 − x, computed accurately by the caller when possible.
 * @returns {number}
 */
export function regIncBeta(a, b, x, y = 1 - x) {
  if (x <= 0) return 0;
  if (y <= 0) return 1;
  // ln of whichever of x, y is near 1 comes from log1p of the other, keeping full precision.
  const logX = x > 0.5 ? Math.log1p(-y) : Math.log(x);
  const logY = y > 0.5 ? Math.log1p(-x) : Math.log(y);
  const logFront = a * logX + b * logY - logBeta(a, b);
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(logFront) * betaContinuedFraction(a, b, x)) / a;
  return 1 - (Math.exp(logFront) * betaContinuedFraction(b, a, y)) / b;
}

/**
 * Complement 1 − Iₓ(a, b) = I_y(b, a), computed directly (keeps tiny upper tails precise).
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @param {number} [y]
 * @returns {number}
 */
export function regIncBetaComplement(a, b, x, y = 1 - x) {
  return regIncBeta(b, a, y, x);
}

/** BGRAT coefficients pₙ (Didonato & Morris 1992, eq. 9.3) for b = ½. */
const HALF_P = (() => {
  const b = 0.5;
  const terms = 30;
  /** (2m + 1)! for m = 0…terms */
  const oddFactorial = [1];
  for (let m = 1; m <= terms; m += 1)
    oddFactorial.push(oddFactorial[m - 1] * (2 * m) * (2 * m + 1));
  const p = [1];
  for (let n = 1; n < terms; n += 1) {
    let sum = 0;
    for (let m = 1; m < n; m += 1) sum += ((m * b - n) * p[n - m]) / oddFactorial[m];
    p.push(sum / n + (b - 1) / oddFactorial[n]);
  }
  return p;
})();

/**
 * Iₓ(a, ½) for large a by the BGRAT asymptotic expansion of Didonato & Morris (1992),
 * "Algorithm 708", ACM TOMS 18, 360–373, eq. 9–9.6. With b = ½ the incomplete
 * gamma term is Q(½, u) = erfc(√u), so the result keeps erfc's full precision.
 * Used for the t distribution with large ν, where the continued fraction loses
 * about ν·ε to cancellation.
 *
 * @param {number} a  ≥ 10 (ν/2)
 * @param {number} x
 * @param {number} y  1 − x
 * @returns {number}
 */
export function regIncBetaHalfLargeA(a, x, y) {
  if (x <= 0) return 0;
  if (y <= 0) return 1;
  const b = 0.5;
  const t = a + (b - 1) / 2;
  const lx = y < 0.35 ? Math.log1p(-y) : Math.log(x);
  const u = -t * lx;
  const sqrtU = Math.sqrt(u);
  // h = u^b e^(−u) / Γ(b); with b = ½, Γ(½) = √π.
  const h = (sqrtU * Math.exp(-u)) / Math.sqrt(Math.PI);
  const q = erfc(sqrtU);
  if (!(h > 0)) return 0;
  // Γ(a + b)/Γ(a) / t^b, scaled by h.
  const prefix = (h * Math.exp(-logGammaRatio(a, b))) / Math.sqrt(t);
  let j = q / h;
  let sum = prefix * j;
  const lx2 = (lx / 2) * (lx / 2);
  let lxp = 1;
  const t4 = 4 * t * t;
  let b2n = b;
  for (let n = 1; n < HALF_P.length; n += 1) {
    j = (b2n * (b2n + 1) * j + (u + b2n + 1) * lxp) / t4;
    lxp *= lx2;
    b2n += 2;
    const r = prefix * HALF_P[n] * j;
    sum += r;
    if (Math.abs(r) <= EPS * Math.abs(sum)) break;
  }
  return sum;
}
