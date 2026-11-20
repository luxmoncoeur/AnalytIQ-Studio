// @ts-check

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Strictly parse one user-typed number. Accepts "12", "-3.5", ".5", "1e3".
 * Rejects empty strings, decimal commas ("1,5"), thousands separators, "NaN",
 * "Infinity" and anything with extra characters.
 *
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseNumber(text) {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!NUMBER_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * @typedef {'auto' | 'columns' | 'rows'} PairLayout
 *   columns: one "X Y" pair per line. rows: first line all X values, second line all Y values.
 */

/**
 * @typedef {object} ParsedPairs
 * @property {number[]} xs
 * @property {number[]} ys
 * @property {string[]} warnings
 * @property {[string, string] | null} header  Column names if a header row was found.
 * @property {'columns' | 'rows'} layout        The layout that was used.
 */

/**
 * @typedef {{ ok: true, value: ParsedPairs } | { ok: false, error: { message: string, line?: number } }} ParseResult
 */

/**
 * One delimiter is chosen for the whole text so a decimal comma such as "3,5"
 * can never be silently split into two numbers.
 * @param {string} text
 * @returns {RegExp}
 */
function detectDelimiter(text) {
  if (text.includes("\t")) return /\t/;
  if (text.includes(";")) return /;/;
  if (text.includes(",")) return /,/;
  return /\s+/;
}

/**
 * @param {string} line
 * @param {RegExp} delimiter
 */
function splitLine(line, delimiter) {
  const trimmed = line.trim();
  if (trimmed === "") return [];
  return trimmed.split(delimiter).map((t) => t.trim().replace(/^["']|["']$/g, ""));
}

const NOT_A_NUMBER_HINT = "Use a period for decimals (e.g. 2.5) and no thousands separators.";

/**
 * Parse pasted text or CSV content into X and Y.
 *
 * - columns: one (X, Y) pair per line, separated by a tab, semicolon, comma or
 *   spaces. An optional header row (e.g. "Hours,Score") is detected.
 * - rows: the first line holds every X, the second every Y. A leading label
 *   such as "X:" is ignored.
 * - auto (default): rows when there are exactly two lines that are labelled
 *   (e.g. "X: …") or hold at least four values each; columns otherwise.
 *
 * @param {string} text
 * @param {{ layout?: PairLayout }} [options]
 * @returns {ParseResult}
 */
export function parsePairs(text, { layout = "auto" } = {}) {
  const delimiter = detectDelimiter(text);
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line, index) => ({ number: index + 1, parts: splitLine(line, delimiter) }))
    .filter((entry) => entry.parts.length > 0);

  if (lines.length === 0)
    return { ok: false, error: { message: "No data found. Paste two columns of numbers." } };

  const labelled = (/** @type {string[]} */ parts) =>
    parts.length > 1 && parseNumber(parts[0]) === null;
  const useRows =
    layout === "rows" ||
    (layout === "auto" &&
      lines.length === 2 &&
      lines.every((entry) => labelled(entry.parts) || entry.parts.length >= 4) &&
      lines.every((entry) => entry.parts.length > 2));

  return useRows ? parseRows(lines) : parseColumns(lines);
}

/**
 * @param {{ number: number, parts: string[] }[]} lines
 * @returns {ParseResult}
 */
function parseRows(lines) {
  if (lines.length !== 2) {
    return {
      ok: false,
      error: {
        message: `Row layout needs exactly two lines (X values, then Y values), but found ${lines.length}.`,
      },
    };
  }
  /** @type {number[][]} */
  const rows = [];
  for (const entry of lines) {
    const parts = parseNumber(entry.parts[0]) === null ? entry.parts.slice(1) : entry.parts;
    const values = [];
    for (const part of parts) {
      const value = parseNumber(part);
      if (value === null) {
        return {
          ok: false,
          error: {
            message: `Line ${entry.number}: "${part}" is not a valid number. ${NOT_A_NUMBER_HINT}`,
            line: entry.number,
          },
        };
      }
      values.push(value);
    }
    rows.push(values);
  }
  const [xs, ys] = rows;
  if (xs.length !== ys.length) {
    return {
      ok: false,
      error: { message: `The X row has ${xs.length} values but the Y row has ${ys.length}.` },
    };
  }
  return { ok: true, value: { xs, ys, warnings: [], header: null, layout: "rows" } };
}

/**
 * @param {{ number: number, parts: string[] }[]} lines
 * @returns {ParseResult}
 */
function parseColumns(lines) {
  /** @type {[string, string] | null} */
  let header = null;
  let body = lines;
  const first = lines[0].parts;
  if (first.some((part) => parseNumber(part) === null)) {
    if (first.length < 2) {
      return {
        ok: false,
        error: {
          message: "The first line must contain two values (or two column names).",
          line: lines[0].number,
        },
      };
    }
    if (first.slice(0, 2).every((part) => parseNumber(part) === null)) {
      header = [first[0], first[1]];
      body = lines.slice(1);
    }
  }

  const xs = [];
  const ys = [];
  let extraColumns = false;
  for (const entry of body) {
    if (entry.parts.length < 2) {
      const message = /\s/.test(entry.parts[0])
        ? `Line ${entry.number} does not use the same separator as the rest of the data. Use one separator (tab, comma, semicolon or space) throughout.`
        : `Line ${entry.number} has only one value. Each line needs an X and a Y.`;
      return { ok: false, error: { message, line: entry.number } };
    }
    if (entry.parts.length > 2) extraColumns = true;
    const x = parseNumber(entry.parts[0]);
    const y = parseNumber(entry.parts[1]);
    if (x === null || y === null) {
      const bad = x === null ? entry.parts[0] : entry.parts[1];
      return {
        ok: false,
        error: {
          message: `Line ${entry.number}: "${bad}" is not a valid number. ${NOT_A_NUMBER_HINT}`,
          line: entry.number,
        },
      };
    }
    xs.push(x);
    ys.push(y);
  }

  if (xs.length === 0)
    return { ok: false, error: { message: "Only a header row was found. Add data below it." } };
  /** @type {string[]} */
  const warnings = extraColumns
    ? ["Some lines had more than two values. Only the first two columns were used as X and Y."]
    : [];
  return { ok: true, value: { xs, ys, warnings, header, layout: "columns" } };
}

/**
 * @typedef {{ ok: true, value: { samples: number[][], header: string[] | null } } | { ok: false, error: { message: string, line?: number } }} SamplesResult
 */

/**
 * Parse pasted text or CSV content into `count` independent columns (samples).
 * Columns may have different lengths: empty cells are skipped, so
 * "12,15\n14,\n" gives [[12, 14], [15]]. With count = 1, a single line of
 * values ("12 14 15") is also accepted. An optional header row is detected.
 *
 * @param {string} text
 * @param {number} count  Number of columns to read (extra columns are ignored with a warning-free skip).
 * @returns {SamplesResult}
 */
export function parseSamples(text, count) {
  const delimiter = detectDelimiter(text);
  let lines = text
    .split(/\r\n|\r|\n/)
    .map((line, index) => ({ number: index + 1, parts: splitLine(line, delimiter) }))
    .filter((entry) => entry.parts.some((part) => part !== ""));
  if (lines.length === 0)
    return { ok: false, error: { message: "No data found. Paste a column of numbers." } };
  // One sample typed across a single line: treat every value as a row.
  if (count === 1 && lines.length === 1 && lines[0].parts.length > 1) {
    const [only] = lines;
    lines = only.parts.map((part) => ({ number: only.number, parts: [part] }));
  }

  /** @type {string[] | null} */
  let header = null;
  const first = lines[0].parts.slice(0, count);
  if (first.every((part) => part === "" || parseNumber(part) === null)) {
    header = first;
    lines = lines.slice(1);
  }

  /** @type {number[][]} */
  const samples = Array.from({ length: count }, () => []);
  for (const entry of lines) {
    for (let column = 0; column < count; column += 1) {
      const part = entry.parts[column] ?? "";
      if (part === "") continue;
      const value = parseNumber(part);
      if (value === null) {
        return {
          ok: false,
          error: {
            message: `Line ${entry.number}: "${part}" is not a valid number. ${NOT_A_NUMBER_HINT}`,
            line: entry.number,
          },
        };
      }
      samples[column].push(value);
    }
  }
  if (samples.every((sample) => sample.length === 0))
    return { ok: false, error: { message: "Only a header row was found. Add data below it." } };
  return { ok: true, value: { samples, header } };
}
