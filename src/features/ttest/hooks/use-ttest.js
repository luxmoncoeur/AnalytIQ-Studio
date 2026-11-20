"use client";

import { useCallback, useMemo, useState } from "react";
import { readAlpha } from "@/features/hypothesis/hooks/use-ztest";
import { toast } from "@/hooks/use-toast";
import { MAX_POINTS, parseNumber, parseSamples } from "@/lib/stats";
import { T_TESTS } from "../config";

let nextId = 0;
/** @param {Record<string, string>} [cells] */
const newRow = (cells = {}) => ({
  id: `t-row-${(nextId += 1)}`,
  data: "",
  data1: "",
  data2: "",
  ...cells,
});
const blankRows = (count) => Array.from({ length: count }, () => newRow());

/**
 * Rows of the raw-data table from one array of strings per column.
 * @param {Record<string, (string | number)[]>} columns
 */
export function rowsFromColumns(columns) {
  const length = Math.max(1, ...Object.values(columns).map((values) => values.length));
  return Array.from({ length }, (_, i) =>
    newRow(
      Object.fromEntries(
        Object.entries(columns).map(([key, values]) => [
          key,
          values[i] === undefined ? "" : String(values[i]),
        ]),
      ),
    ),
  );
}

/**
 * Read the raw-data table. Each column is an independent sample, so blank cells
 * are skipped (samples may have different sizes); anything else must be a number.
 * @param {Record<string, string>[]} rows
 * @param {string[]} keys
 */
export function readSampleRows(rows, keys) {
  /** @type {Record<string, number[]>} */
  const samples = Object.fromEntries(keys.map((key) => [key, []]));
  /** @type {Record<string, Record<string, string>>} */
  const errors = {};
  for (const row of rows) {
    for (const key of keys) {
      const text = (row[key] ?? "").trim();
      if (text === "") continue;
      const value = parseNumber(text);
      if (value === null) errors[row.id] = { ...errors[row.id], [key]: "Not a number" };
      else samples[key].push(value);
    }
  }
  return { samples, errors };
}

/**
 * Turn the form into the stats-function input, collecting a message for every
 * missing or invalid field (keyed by field name, or `data` for the table).
 */
export function buildTInput({ test, mode, values, rows, tail, alpha, pooled }) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, unknown>} */
  const input = { tail };
  const fields = mode === "raw" ? [test.nullField] : [test.nullField, ...test.fields];
  for (const field of fields) {
    const raw = values[field.name] ?? "";
    const parsed = parseNumber(raw);
    if (raw.trim() === "") errors[field.name] = `Enter ${field.symbol}`;
    else if (parsed === null) errors[field.name] = "Not a valid number (use a period for decimals)";
    else input[field.name] = parsed;
  }
  /** @type {Record<string, Record<string, string>>} */
  let cellErrors = {};
  if (mode === "raw") {
    const read = readSampleRows(
      rows,
      test.columns.map((column) => column.key),
    );
    cellErrors = read.errors;
    if (Object.keys(read.errors).length > 0) errors.data = "Some cells are not numbers.";
    Object.assign(input, read.samples);
  }
  if (test.id === "two-sample") input.pooled = pooled;
  if (alpha.error || alpha.value === null) errors.alpha = alpha.error ?? "Choose α";
  else input.alpha = alpha.value;

  if (Object.keys(errors).length === 0) {
    const result = test.run(input);
    if (!result.ok && result.error.field) {
      const key = result.error.field.startsWith("data") ? "data" : result.error.field;
      errors[key] = result.error.message;
    }
  }
  return { input, errors, cellErrors };
}

/** State and actions for the t-test workspace. */
export function useTTest() {
  const [testId, setTestId] = useState("one-sample");
  const [mode, setMode] = useState("raw");
  const [tail, setTail] = useState("two");
  const [alphaChoice, setAlphaChoice] = useState("0.05");
  const [customAlpha, setCustomAlpha] = useState("");
  const [pooled, setPooled] = useState(false);
  const [values, setValues] = useState(/** @type {Record<string, string>} */ ({}));
  const [rows, setRows] = useState(() => blankRows(5));
  const [statements, setStatements] = useState({ h0: "", ha: "" });
  const [showErrors, setShowErrors] = useState(false);
  const [submitted, setSubmitted] = useState(
    /** @type {null | { testId: string, mode: string, input: Record<string, unknown>, statements: { h0: string, ha: string } }} */ (
      null
    ),
  );

  const test = T_TESTS[testId];
  const alpha = readAlpha(alphaChoice, customAlpha);
  const built = useMemo(
    () =>
      buildTInput({
        test,
        mode,
        values,
        rows,
        tail,
        alpha: readAlpha(alphaChoice, customAlpha),
        pooled,
      }),
    [test, mode, values, rows, tail, alphaChoice, customAlpha, pooled],
  );

  const outcome = useMemo(
    () => (submitted ? T_TESTS[submitted.testId].run(submitted.input) : null),
    [submitted],
  );
  const stale =
    submitted !== null &&
    (submitted.testId !== testId ||
      JSON.stringify(submitted.input) !== JSON.stringify(built.input));

  const setValue = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
  }, []);
  const updateCell = useCallback((id, key, value) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  }, []);
  const addRow = useCallback(() => setRows((current) => [...current, newRow()]), []);
  const removeRow = useCallback(
    (id) =>
      setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== id) : current)),
    [],
  );

  const chooseTest = useCallback((id) => {
    setTestId(id);
    setShowErrors(false);
    setSubmitted(null);
  }, []);

  /** Load pasted or uploaded text into the table. Returns an error message or null. */
  const importText = useCallback(
    (text) => {
      const keys = test.columns.map((column) => column.key);
      const parsed = parseSamples(text, keys.length);
      if (!parsed.ok) return parsed.error.message;
      const { samples } = parsed.value;
      const longest = Math.max(...samples.map((sample) => sample.length));
      if (longest > MAX_POINTS)
        return `Too many values: ${longest.toLocaleString("en-US")}. The limit is ${MAX_POINTS.toLocaleString("en-US")}.`;
      setRows(rowsFromColumns(Object.fromEntries(keys.map((key, i) => [key, samples[i]]))));
      setMode("raw");
      setShowErrors(false);
      toast.success(
        `Loaded ${samples.map((sample, i) => `${sample.length} values in ${test.columns[i].label}`).join(", ")}`,
      );
      return null;
    },
    [test],
  );

  const run = useCallback((next) => {
    const result = buildTInput(next);
    if (Object.keys(result.errors).length === 0)
      setSubmitted({
        testId: next.test.id,
        mode: next.mode,
        input: result.input,
        statements: next.statements,
      });
    return result;
  }, []);

  const loadExample = useCallback(() => {
    const { example } = test;
    const nextRows = rowsFromColumns(example.data);
    setRows(nextRows);
    setValues(example.values);
    setTail(example.tail);
    setAlphaChoice(example.alpha);
    setStatements(example.statements);
    setShowErrors(false);
    run({
      test,
      mode,
      values: example.values,
      rows: nextRows,
      tail: example.tail,
      alpha: readAlpha(example.alpha, ""),
      pooled,
      statements: example.statements,
    });
  }, [mode, pooled, run, test]);

  /**
   * Restore a complete state (used by shared links). Inputs are strings, exactly
   * as if typed, so they go through the same parsing and validation.
   */
  const restore = useCallback(
    (state) => {
      const nextTest = T_TESTS[state.testId];
      const nextRows = state.mode === "raw" ? rowsFromColumns(state.columns) : blankRows(5);
      setTestId(state.testId);
      setMode(state.mode);
      setTail(state.tail);
      setAlphaChoice(state.alphaChoice);
      setCustomAlpha(state.customAlpha);
      setPooled(state.pooled);
      setValues(state.values);
      setRows(nextRows);
      setShowErrors(true);
      return run({
        test: nextTest,
        mode: state.mode,
        values: state.values,
        rows: nextRows,
        tail: state.tail,
        alpha: readAlpha(state.alphaChoice, state.customAlpha),
        pooled: state.pooled,
        statements: { h0: "", ha: "" },
      });
    },
    [run],
  );

  const reset = useCallback(() => {
    setValues({});
    setRows(blankRows(5));
    setStatements({ h0: "", ha: "" });
    setShowErrors(false);
    setSubmitted(null);
  }, []);

  const compute = useCallback(() => {
    setShowErrors(true);
    if (Object.keys(built.errors).length > 0) {
      toast.error("Check the highlighted inputs.");
      return;
    }
    setSubmitted({ testId, mode, input: built.input, statements });
  }, [built, mode, statements, testId]);

  return {
    testId,
    test,
    chooseTest,
    mode,
    setMode,
    tail,
    setTail,
    alphaChoice,
    setAlphaChoice,
    customAlpha,
    setCustomAlpha,
    alpha,
    pooled,
    setPooled,
    values,
    setValue,
    rows,
    updateCell,
    addRow,
    removeRow,
    importText,
    statements,
    setStatements,
    fieldErrors: showErrors ? built.errors : {},
    cellErrors: built.cellErrors,
    showErrors,
    outcome,
    submitted,
    stale,
    loadExample,
    restore,
    reset,
    compute,
  };
}
