// @ts-check
import { describe, expect, it } from "vitest";
import { oneSampleTTest, pairedTTest, twoSampleTTest } from "../ttest.js";
import fixtures from "./fixtures/t.json";
import { expectRelClose, unwrap } from "./helpers.js";

const RUNNERS = {
  "one-sample": oneSampleTTest,
  "two-sample": twoSampleTTest,
  paired: pairedTTest,
};

/** @param {number | null} actual @param {number | null} expected @param {string} label */
function expectBound(actual, expected, label) {
  if (expected === null) expect(actual, label).toBeNull();
  else expectRelClose(/** @type {number} */ (actual), expected, 1e-11, label);
}

describe("t-tests vs SciPy", () => {
  it.each(fixtures.tests)("$test, $tail-tailed, α = $alpha", (fx) => {
    const { name: _name, ...input } = /** @type {Record<string, unknown>} */ (fx.input);
    const run =
      /** @type {(input: any) => import('../result.js').Result<import('../ttest.js').TTestResult>} */ (
        RUNNERS[/** @type {keyof typeof RUNNERS} */ (fx.test)]
      );
    const result = unwrap(run({ ...input, alpha: fx.alpha, tail: fx.tail }));
    expectRelClose(result.statistic, fx.t, 1e-12, "t");
    expectRelClose(/** @type {number} */ (result.df), fx.df, 1e-12, "df");
    expectRelClose(result.pValue, fx.pValue, 1e-11, "p");
    expectBound(result.critical.lower, fx.critical.lower, "critical.lower");
    expectBound(result.critical.upper, fx.critical.upper, "critical.upper");
    expectBound(result.ci.lower, fx.ci.lower, "ci.lower");
    expectBound(result.ci.upper, fx.ci.upper, "ci.upper");
    expect(result.reject).toBe(result.rejectByPValue);
  });
});

describe("oneSampleTTest — textbook example", () => {
  // x = 12,14,11,15,13,16,12,14,15,13: x̄ = 13.5, s = 1.5811, n = 10, μ₀ = 12 → t = 3.0
  const data = [12, 14, 11, 15, 13, 16, 12, 14, 15, 13];

  it("computes t, df, p, the CI and every step", () => {
    const r = unwrap(oneSampleTTest({ data, mu0: 12, alpha: 0.05, tail: "two" }));
    expect(r.symbol).toBe("t");
    expect(r.df).toBe(9);
    expect(r.estimate).toBe(13.5);
    expect(r.statistic).toBeCloseTo(3, 12);
    expect(r.critical.upper).toBeCloseTo(2.262157163, 9);
    expect(r.pValue).toBeCloseTo(0.0149564, 6);
    expect(r.reject).toBe(true);
    expect(r.ci.lower).toBeLessThan(13.5);
    expect(r.ci.level).toBe(0.95);
    expect(r.steps.map((s) => s.id)).toEqual([
      "hypotheses",
      "sample-mean",
      "sample-sd",
      "df",
      "critical",
      "standard-error",
      "t",
      "p-value",
      "decision",
      "ci",
    ]);
    expect(r.warnings[0]).toMatch(/n < 30/);
  });

  it("gives the same answer from summary statistics", () => {
    const raw = unwrap(oneSampleTTest({ data, mu0: 12, alpha: 0.05, tail: "right" }));
    const sum = unwrap(
      oneSampleTTest({
        mean: 13.5,
        sd: raw.details.sd,
        n: 10,
        mu0: 12,
        alpha: 0.05,
        tail: "right",
      }),
    );
    expectRelClose(sum.statistic, raw.statistic, 1e-14);
    expect(sum.steps.map((s) => s.id)).not.toContain("sample-mean");
    expect(sum.ci.upper).toBeNull();
    expect(sum.steps.at(-1)?.title).toMatch(/one-sided/);
  });

  it("left-tailed gives an upper bound", () => {
    const r = unwrap(oneSampleTTest({ data, mu0: 15, alpha: 0.05, tail: "left" }));
    expect(r.ci.lower).toBeNull();
    expect(/** @type {number} */ (r.ci.upper)).toBeLessThan(15);
    expect(r.reject).toBe(true);
  });

  it("drops the small-sample warning for n ≥ 30", () => {
    const big = Array.from({ length: 30 }, (_, i) => i % 7);
    expect(
      unwrap(oneSampleTTest({ data: big, mu0: 3, alpha: 0.05, tail: "two" })).warnings,
    ).toEqual([]);
  });
});

describe("t-test validation", () => {
  const base = { alpha: 0.05, tail: /** @type {const} */ ("two") };

  it.each([
    [{ data: [5], mu0: 0 }, "N_TOO_SMALL", "data"],
    [{ data: [], mu0: 0 }, "EMPTY", "data"],
    [{ data: [1, Number.NaN], mu0: 0 }, "NON_FINITE", "data"],
    [{ data: Array(10001).fill(1), mu0: 0 }, "TOO_MANY_POINTS", "data"],
    [{ data: [4, 4, 4], mu0: 0 }, "ZERO_VARIANCE", "data"],
    [{ mean: 1, sd: 0, n: 5, mu0: 0 }, "SIGMA_NONPOSITIVE", "sd"],
    [{ mean: 1, sd: 1, n: 1, mu0: 0 }, "N_TOO_SMALL", "n"],
    [{ mean: 1, sd: 1, n: 2.5, mu0: 0 }, "N_NOT_POSITIVE_INTEGER", "n"],
    [{ mean: 1, sd: 1, n: 5, mu0: Number.NaN }, "NON_FINITE", "mu0"],
  ])("one-sample %o → %s", (input, code, field) => {
    const r = oneSampleTTest(/** @type {any} */ ({ ...base, ...input }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(code);
      expect(r.error.field).toBe(field);
    }
  });

  it("rejects bad α and tail", () => {
    const r1 = oneSampleTTest({ data: [1, 2], mu0: 0, alpha: 1, tail: "two" });
    expect(!r1.ok && r1.error.code).toBe("ALPHA_OUT_OF_RANGE");
    const r2 = oneSampleTTest({
      data: [1, 2],
      mu0: 0,
      alpha: 0.05,
      tail: /** @type {any} */ ("up"),
    });
    expect(!r2.ok && r2.error.code).toBe("INVALID_TAIL");
  });

  it("paired: mismatched lengths, constant differences, summary inputs", () => {
    const mismatch = pairedTTest({ ...base, data1: [1, 2, 3], data2: [1, 2] });
    expect(!mismatch.ok && mismatch.error).toMatchObject({
      code: "LENGTH_MISMATCH",
      field: "data2",
    });
    expect(!mismatch.ok && mismatch.error.message).toMatch(/3 values but Sample 2 has 2/);
    const flat = pairedTTest({ ...base, data1: [5, 6, 7], data2: [3, 4, 5] });
    expect(!flat.ok && flat.error.code).toBe("ZERO_VARIANCE");
    const missing = pairedTTest({ ...base, data1: [1, 2, 3] });
    expect(!missing.ok && missing.error.code).toBe("EMPTY");
    const summary = unwrap(pairedTTest({ ...base, meanDiff: 1.2, sdDiff: 2, n: 16 }));
    expect(summary.statistic).toBeCloseTo(2.4, 12);
    expect(summary.parameter).toBe("μ_d");
    const bad = pairedTTest({ ...base, meanDiff: 1, sdDiff: -1, n: 5 });
    expect(!bad.ok && bad.error.field).toBe("sdDiff");
  });

  it("paired: shows the differences, abbreviated past eight", () => {
    const d1 = Array.from({ length: 10 }, (_, i) => i * 1.5);
    const d2 = d1.map((x, i) => x - (i % 3));
    const r = unwrap(pairedTTest({ ...base, data1: d1, data2: d2 }));
    const step = r.steps.find((s) => s.id === "differences");
    expect(step?.substitution.at(-1)).toBe(", … (10 differences)");
    const short = unwrap(pairedTTest({ ...base, data1: [1, 2, 4], data2: [0, 0, 1] }));
    expect(short.steps.find((s) => s.id === "differences")?.substitution.at(-1)).toBe("");
  });

  it("two-sample: zero variance in both samples, one constant sample is fine for Welch", () => {
    const both = twoSampleTTest({ ...base, data1: [2, 2, 2], data2: [5, 5] });
    expect(!both.ok && both.error.code).toBe("ZERO_VARIANCE");
    const one = unwrap(twoSampleTTest({ ...base, data1: [2, 2, 2], data2: [5, 6, 7] }));
    expect(one.df).toBeCloseTo(2, 12);
  });

  it("two-sample: summary-stat validation names the field", () => {
    const r = twoSampleTTest({ ...base, mean1: 1, sd1: 1, n1: 5, mean2: 2, sd2: 1, n2: 1 });
    expect(!r.ok && r.error.field).toBe("n2");
  });

  it("two-sample pooled: steps, warning when variances differ a lot", () => {
    const r = unwrap(
      twoSampleTTest({
        ...base,
        mean1: 10,
        sd1: 1,
        n1: 40,
        mean2: 9,
        sd2: 5,
        n2: 40,
        pooled: true,
      }),
    );
    expect(r.df).toBe(78);
    expect(r.steps.map((s) => s.id)).toContain("pooled-variance");
    expect(r.warnings.some((w) => /4 times/.test(w))).toBe(true);
    const welch = unwrap(
      twoSampleTTest({ ...base, mean1: 10, sd1: 1, n1: 40, mean2: 9, sd2: 5, n2: 40 }),
    );
    expect(welch.warnings).toEqual([]);
    expect(welch.steps.find((s) => s.id === "df")?.title).toMatch(/Welch/);
    expect(welch.critical.lower).not.toBeNull();
  });

  it("reports a t statistic too large to represent", () => {
    const r = oneSampleTTest({ ...base, mean: 1e300, sd: 1e-300, n: 4, mu0: 0 });
    expect(!r.ok && r.error.message).toMatch(/too large to compute a t statistic/);
  });

  it("reports overflow instead of returning Infinity", () => {
    const r = twoSampleTTest({ ...base, mean1: 1, sd1: 1e200, n1: 5, mean2: 0, sd2: 1e200, n2: 5 });
    expect(!r.ok && r.error.code).toBe("NON_FINITE");
  });
});
