// @ts-check
import { describe, expect, it } from "vitest";
import { parseNumber, parsePairs, parseSamples } from "../parse.js";

describe("parseNumber", () => {
  it.each([
    ["12", 12],
    ["-3.5", -3.5],
    ["+2", 2],
    [".5", 0.5],
    ["5.", 5],
    ["1e3", 1000],
    ["-2.5E-2", -0.025],
    ["  7  ", 7],
    [4, 4],
  ])("parses %j", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it.each([
    "",
    "  ",
    "abc",
    "1,5",
    "1 000",
    "1.2.3",
    "NaN",
    "Infinity",
    "--1",
    "1e",
    "0x10",
    null,
    undefined,
    Infinity,
    Number.NaN,
  ])("rejects %j", (input) => {
    expect(parseNumber(input)).toBeNull();
  });
});

describe("parsePairs", () => {
  it("reads tab-separated columns pasted from a spreadsheet", () => {
    const result = parsePairs("1\t2\n2\t4\n3\t5\n");
    expect(result).toEqual({
      ok: true,
      value: { xs: [1, 2, 3], ys: [2, 4, 5], warnings: [], header: null, layout: "columns" },
    });
  });

  it("reads CSV with a header row and Windows line endings", () => {
    const result = parsePairs('"Hours","Score"\r\n2,62\r\n3,65.5\r\n');
    expect(result.ok && result.value).toEqual({
      xs: [2, 3],
      ys: [62, 65.5],
      warnings: [],
      header: ["Hours", "Score"],
      layout: "columns",
    });
  });

  it("reads semicolons and mixed spacing", () => {
    const result = parsePairs("1; 2\n  3 ;4  \n\n5;6");
    expect(result.ok && result.value.xs).toEqual([1, 3, 5]);
    expect(result.ok && result.value.ys).toEqual([2, 4, 6]);
  });

  it("reads the two-row layout with labels", () => {
    const result = parsePairs("X: 1 2 3\nY: 2 4 5");
    expect(result.ok && result.value).toMatchObject({
      xs: [1, 2, 3],
      ys: [2, 4, 5],
      layout: "rows",
    });
  });

  it("auto-detects unlabelled rows of four or more values", () => {
    const result = parsePairs("1 2 3 4\n2 4 5 4");
    expect(result.ok && result.value).toMatchObject({
      xs: [1, 2, 3, 4],
      ys: [2, 4, 5, 4],
      layout: "rows",
    });
  });

  it("honours an explicit layout", () => {
    expect(parsePairs("1 2 3\n4 5 6", { layout: "rows" })).toMatchObject({
      ok: true,
      value: { xs: [1, 2, 3], ys: [4, 5, 6] },
    });
    expect(parsePairs("1 2 3 4\n2 4 5 4", { layout: "columns" })).toMatchObject({
      ok: true,
      value: { xs: [1, 2], ys: [2, 4] },
    });
  });

  it("reports mismatched rows in the two-row layout", () => {
    const result = parsePairs("1 2 3 4\n2 4 5", { layout: "rows" });
    expect(!result.ok && result.error.message).toMatch(/4 values but the Y row has 3/);
  });

  it("rejects bad values and wrong line counts in the row layout", () => {
    expect(parsePairs("1 2 3\n4 x 6", { layout: "rows" })).toMatchObject({
      ok: false,
      error: { line: 2 },
    });
    expect(parsePairs("1 2 3", { layout: "rows" }).ok).toBe(false);
  });

  it("treats two lines of two values as two points", () => {
    const result = parsePairs("1 2\n3 4");
    expect(result.ok && result.value).toMatchObject({ xs: [1, 3], ys: [2, 4] });
  });

  it("uses the first two columns and warns about extras", () => {
    const result = parsePairs("1,2,9\n3,4,9");
    expect(result.ok && result.value.xs).toEqual([1, 3]);
    expect(result.ok && result.value.warnings).toHaveLength(1);
  });

  it.each([
    ["", /No data/],
    ["   \n  ", /No data/],
    ["1\n2", /Line 1 has only one value/],
    ["1 2\n3 abc", /Line 2: "abc" is not a valid number/],
    ["1 2\n3,5 4", /two values/],
    ["1;2\n5 6", /Line 2 does not use the same separator/],
    ["1;2\n3,5;4", /Line 2: "3,5" is not a valid number. Use a period/],
    ["1,2\nx,4", /Line 2: "x"/],
    ["X", /first line must contain two values/],
    ["Hours,Score", /Only a header row/],
  ])("rejects %j", (text, message) => {
    const result = parsePairs(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(message);
  });
});

describe("parseSamples", () => {
  it("reads ragged columns and skips empty cells", () => {
    const r = parseSamples("12,15\n14,\n13,16\n,17", 2);
    expect(r).toEqual({
      ok: true,
      value: {
        samples: [
          [12, 14, 13],
          [15, 16, 17],
        ],
        header: null,
      },
    });
  });

  it("detects a header and ignores extra columns", () => {
    const r = parseSamples("Before\tAfter\tNote\n1\t2\tx\n3\t4\ty", 2);
    expect(r.ok && r.value).toEqual({
      samples: [
        [1, 3],
        [2, 4],
      ],
      header: ["Before", "After"],
    });
  });

  it("accepts one sample typed on a single line", () => {
    const r = parseSamples("12 14 15.5 13", 1);
    expect(r.ok && r.value.samples).toEqual([[12, 14, 15.5, 13]]);
  });

  it("explains bad input", () => {
    expect(parseSamples("  \n ", 1)).toMatchObject({ ok: false });
    const nan = parseSamples("1;2\n3;abc", 2);
    expect(!nan.ok && nan.error).toMatchObject({ line: 2 });
    expect(!nan.ok && nan.error.message).toMatch(/"abc" is not a valid number/);
    const onlyHeader = parseSamples("A,B", 2);
    expect(!onlyHeader.ok && onlyHeader.error.message).toMatch(/Only a header/);
  });
});
