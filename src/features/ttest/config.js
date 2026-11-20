import { ArrowLeftRight, Sigma, Split } from "lucide-react";
import { oneSampleTTest, pairedTTest, twoSampleTTest } from "@/lib/stats";

/** @typedef {import('@/features/hypothesis/config').FieldDef} FieldDef */

/**
 * t-test definitions.
 * - `columns`: raw-data columns (key = stats-function input name).
 * - `fields`: summary-statistic inputs.
 * - `nullField`: the value in H₀.
 * - `example`: raw data and summary statistics for the same worked example.
 */
export const T_TESTS = {
  "one-sample": {
    id: "one-sample",
    title: "One sample",
    subtitle: "μ, σ unknown",
    description:
      "Compare a sample mean with a hypothesized population mean μ₀ when the population standard deviation is unknown.",
    icon: Sigma,
    parameter: "μ",
    nullField: { name: "mu0", label: "Hypothesized mean", symbol: "μ₀" },
    columns: [{ key: "data", label: "Sample", tag: "x" }],
    fields: [
      { name: "mean", label: "Sample mean", symbol: "x̄" },
      {
        name: "sd",
        label: "Sample standard deviation",
        symbol: "s",
        hint: "Must be greater than 0",
      },
      { name: "n", label: "Sample size", symbol: "n", integer: true, hint: "At least 2" },
    ],
    run: oneSampleTTest,
    example: {
      // x̄ = 13.5, s = 1.5811, t = 3.0000 with df = 9: reject H₀ at α = 0.05.
      data: { data: ["12", "14", "11", "15", "13", "16", "12", "14", "15", "13"] },
      values: { mu0: "12", mean: "13.5", sd: "1.58113883", n: "10" },
      tail: "two",
      alpha: "0.05",
      statements: {
        h0: "The mean study time is 12 hours a week.",
        ha: "The mean study time is different from 12 hours a week.",
      },
      story: "Ten students log their weekly study hours. Is the mean different from 12 hours?",
    },
  },
  "two-sample": {
    id: "two-sample",
    title: "Two samples",
    subtitle: "μ₁ − μ₂, independent",
    description:
      "Compare the means of two independent groups. Welch's test (default) does not assume equal variances; the pooled test does.",
    icon: Split,
    parameter: "μ₁ − μ₂",
    nullField: {
      name: "delta0",
      label: "Hypothesized difference",
      symbol: "D₀",
      hint: "Usually 0",
    },
    columns: [
      { key: "data1", label: "Sample 1", tag: "x₁" },
      { key: "data2", label: "Sample 2", tag: "x₂" },
    ],
    fields: [
      { name: "mean1", label: "Mean", symbol: "x̄₁", group: "Sample 1" },
      { name: "sd1", label: "Standard deviation", symbol: "s₁", group: "Sample 1" },
      { name: "n1", label: "Size", symbol: "n₁", integer: true, group: "Sample 1" },
      { name: "mean2", label: "Mean", symbol: "x̄₂", group: "Sample 2" },
      { name: "sd2", label: "Standard deviation", symbol: "s₂", group: "Sample 2" },
      { name: "n2", label: "Size", symbol: "n₂", integer: true, group: "Sample 2" },
    ],
    run: twoSampleTTest,
    example: {
      data: {
        data1: ["78", "85", "82", "88", "75", "90", "84", "79"],
        data2: ["72", "80", "76", "74", "79", "70", "77"],
      },
      values: {
        delta0: "0",
        mean1: "82.625",
        sd1: "5.0973",
        n1: "8",
        mean2: "75.4286",
        sd2: "3.645",
        n2: "7",
      },
      tail: "right",
      alpha: "0.05",
      statements: {
        h0: "Both teaching methods give the same mean score.",
        ha: "The new method gives a higher mean score.",
      },
      story:
        "Scores from a class taught with a new method (Sample 1) and a class taught the usual way (Sample 2).",
    },
  },
  paired: {
    id: "paired",
    title: "Paired",
    subtitle: "μ_d, before / after",
    description:
      "Compare two measurements on the same subjects (e.g. before and after) using the differences d = x₁ − x₂.",
    icon: ArrowLeftRight,
    parameter: "μ_d",
    nullField: {
      name: "delta0",
      label: "Hypothesized mean difference",
      symbol: "μ_d₀",
      hint: "Usually 0",
    },
    columns: [
      { key: "data1", label: "Before", tag: "x₁" },
      { key: "data2", label: "After", tag: "x₂" },
    ],
    fields: [
      { name: "meanDiff", label: "Mean of the differences", symbol: "d̄" },
      {
        name: "sdDiff",
        label: "Standard deviation of the differences",
        symbol: "s_d",
        hint: "Must be greater than 0",
      },
      { name: "n", label: "Number of pairs", symbol: "n", integer: true, hint: "At least 2" },
    ],
    run: pairedTTest,
    example: {
      data: {
        data1: ["82", "75", "90", "68", "77", "85", "71", "80"],
        data2: ["78", "74", "84", "66", "75", "80", "70", "76"],
      },
      values: { delta0: "0", meanDiff: "3.125", sdDiff: "1.8851", n: "8" },
      tail: "right",
      alpha: "0.05",
      statements: {
        h0: "The program does not change resting heart rate.",
        ha: "Resting heart rate is lower after the program.",
      },
      story: "Resting heart rate of eight people before and after a six-week exercise program.",
    },
  },
};

export const T_TEST_ORDER = ["one-sample", "two-sample", "paired"];
