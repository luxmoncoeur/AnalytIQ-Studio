// @ts-check
import { describe, expect, it } from "vitest";
import { criticalT, tCdf, tInv, tIsf, tPdf, tPValue, tSf } from "../distributions.js";
import {
  logBeta,
  logGamma,
  regIncBeta,
  regIncBetaComplement,
  regIncBetaHalfLargeA,
} from "../special.js";
import fixtures from "./fixtures/t.json";
import { expectRelClose } from "./helpers.js";

describe("t distribution vs SciPy", () => {
  it.each(fixtures.cdf)("t = %s, df = %s", (t, df, cdf, sf, pdf) => {
    expectRelClose(tCdf(t, df), cdf, 1e-11, "cdf");
    expectRelClose(tSf(t, df), sf, 1e-11, "sf");
    expectRelClose(tPdf(t, df), pdf, 1e-11, "pdf");
  });

  it.each(fixtures.isf)("upper quantile q = %s, df = %s", (q, df, expected) => {
    expectRelClose(tIsf(q, df), expected, 1e-12, "isf");
    expectRelClose(tInv(q, df), -expected, 1e-12, "inv");
  });
});

describe("t distribution properties", () => {
  it("matches textbook critical values", () => {
    expect(tIsf(0.025, 1)).toBeCloseTo(12.7062047, 6);
    expect(tIsf(0.025, 10)).toBeCloseTo(2.2281389, 6);
    expect(tIsf(0.05, 30)).toBeCloseTo(1.6972609, 6);
  });

  it("is symmetric and handles q above ½", () => {
    expect(tIsf(0.5, 7)).toBe(0);
    expectRelClose(tIsf(0.975, 12), -tIsf(0.025, 12), 1e-15);
    expect(tCdf(0, 5)).toBe(0.5);
    expect(tSf(0, 5000)).toBe(0.5);
  });

  it("gives critical values and p-values for every tail", () => {
    const two = criticalT(0.05, "two", 9);
    expect(two.lower).toBe(-(/** @type {number} */ (two.upper)));
    expect(criticalT(0.05, "right", 9).lower).toBeNull();
    expect(criticalT(0.05, "left", 9).upper).toBeNull();
    expectRelClose(tPValue(2.1, "two", 9), 2 * tSf(2.1, 9), 1e-15);
    expectRelClose(tPValue(-2.1, "two", 9), 2 * tCdf(-2.1, 9), 1e-15);
    expect(tPValue(-2.1, "left", 9)).toBe(tCdf(-2.1, 9));
    expect(tPValue(-2.1, "right", 9)).toBe(tSf(-2.1, 9));
  });

  it("approaches the normal distribution for large df", () => {
    expect(tIsf(0.025, 1e7)).toBeCloseTo(1.959963985, 6);
  });
});

describe("special functions", () => {
  it("logGamma matches known values", () => {
    expect(logGamma(1)).toBeCloseTo(0, 14);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 14);
    expectRelClose(logGamma(25), Math.log(6.204484017332394e23), 1e-15);
    expect(logGamma(0)).toBeNaN();
  });

  it("logBeta is symmetric and exact for small integers", () => {
    expectRelClose(logBeta(2, 3), Math.log(1 / 12), 1e-14);
    expect(logBeta(3, 50)).toBe(logBeta(50, 3));
  });

  it("regIncBeta handles the endpoints and the complement", () => {
    expect(regIncBeta(2, 3, 0)).toBe(0);
    expect(regIncBeta(2, 3, 1)).toBe(1);
    expectRelClose(regIncBeta(2, 3, 0.4) + regIncBetaComplement(2, 3, 0.4), 1, 1e-15);
    // I_x(1, 1) = x
    expectRelClose(regIncBeta(1, 1, 0.3), 0.3, 1e-14);
  });

  it("BGRAT handles the endpoints", () => {
    expect(regIncBetaHalfLargeA(500, 0, 1)).toBe(0);
    expect(regIncBetaHalfLargeA(500, 1, 0)).toBe(1);
    expect(regIncBetaHalfLargeA(500, 1e-300, 1)).toBe(0);
  });
});
