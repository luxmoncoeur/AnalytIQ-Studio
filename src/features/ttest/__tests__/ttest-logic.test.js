// @ts-check
import { describe, expect, it } from "vitest";
import { readAlpha } from "@/features/hypothesis/hooks/use-ztest";
import { T_TEST_ORDER, T_TESTS } from "../config";
import { buildTInput, readSampleRows, rowsFromColumns } from "../hooks/use-ttest";

describe("t-test form logic", () => {
  it("reads table columns independently, skipping blanks and flagging bad cells", () => {
    const rows = [
      { id: "a", data1: "1", data2: "2" },
      { id: "b", data1: "", data2: "4" },
      { id: "c", data1: "x", data2: " 5 " },
    ];
    const { samples, errors } = readSampleRows(rows, ["data1", "data2"]);
    expect(samples).toEqual({ data1: [1], data2: [2, 4, 5] });
    expect(errors).toEqual({ c: { data1: "Not a number" } });
  });

  it("builds rows from columns of different lengths", () => {
    const rows = rowsFromColumns({ data1: [1, 2, 3], data2: [4] });
    expect(rows.map((r) => [r.data1, r.data2])).toEqual([
      ["1", "4"],
      ["2", ""],
      ["3", ""],
    ]);
  });

  it.each(T_TEST_ORDER)("%s example runs in both input modes", (id) => {
    const test = T_TESTS[id];
    const { example } = test;
    for (const mode of ["raw", "summary"]) {
      const { input, errors } = buildTInput({
        test,
        mode,
        values: example.values,
        rows: rowsFromColumns(example.data),
        tail: example.tail,
        alpha: readAlpha(example.alpha, ""),
        pooled: false,
      });
      expect(errors).toEqual({});
      const result = test.run(input);
      expect(result.ok).toBe(true);
    }
  });

  it("raw and summary examples agree to the precision of the summary values", () => {
    const test = T_TESTS["one-sample"];
    const run = (mode) =>
      test.run(
        buildTInput({
          test,
          mode,
          values: test.example.values,
          rows: rowsFromColumns(test.example.data),
          tail: "two",
          alpha: readAlpha("0.05", ""),
          pooled: false,
        }).input,
      );
    const raw = run("raw");
    const summary = run("summary");
    expect(
      raw.ok && summary.ok && Math.abs(raw.value.statistic - summary.value.statistic),
    ).toBeLessThan(1e-6);
  });

  it("reports missing fields, bad cells and stats-level errors", () => {
    const test = T_TESTS.paired;
    const missing = buildTInput({
      test,
      mode: "summary",
      values: {},
      rows: [],
      tail: "two",
      alpha: readAlpha("custom", "2"),
      pooled: false,
    });
    expect(missing.errors).toMatchObject({
      delta0: "Enter μ_d₀",
      n: "Enter n",
      alpha: expect.any(String),
    });

    const badCell = buildTInput({
      test,
      mode: "raw",
      values: { delta0: "0" },
      rows: [{ id: "r", data1: "1", data2: "abc" }],
      tail: "two",
      alpha: readAlpha("0.05", ""),
      pooled: false,
    });
    expect(badCell.errors.data).toMatch(/not numbers/);
    expect(badCell.cellErrors).toEqual({ r: { data2: "Not a number" } });

    const mismatch = buildTInput({
      test,
      mode: "raw",
      values: { delta0: "0" },
      rows: rowsFromColumns({ data1: [1, 2, 3], data2: [1, 2] }),
      tail: "two",
      alpha: readAlpha("0.05", ""),
      pooled: false,
    });
    expect(mismatch.errors.data).toMatch(/Paired data needs one value in each column/);

    const notNumber = buildTInput({
      test: T_TESTS["two-sample"],
      mode: "summary",
      values: { ...T_TESTS["two-sample"].example.values, n1: "1" },
      rows: [],
      tail: "two",
      alpha: readAlpha("0.05", ""),
      pooled: true,
    });
    expect(notNumber.input.pooled).toBe(true);
    expect(notNumber.errors.n1).toMatch(/at least 2/);
  });
});
