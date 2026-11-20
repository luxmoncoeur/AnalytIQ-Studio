"use client";

import { useSettings } from "@/components/providers";
import {
  ReportDialog,
  ReportFacts,
  ReportSection,
  ReportSteps,
} from "@/components/shared/report-dialog";
import { TAILS } from "@/features/hypothesis/config";
import { ciText } from "@/features/hypothesis/components/hypothesis-results";
import { NormalCurveChart } from "@/features/hypothesis/components/normal-curve-chart";
import { formatExact, formatNumber, formatPValue } from "@/lib/format";
import { T_TESTS } from "../config";

/**
 * Given values for the report: the value in H₀, then either the sample sizes
 * and statistics computed from the raw data or the summary values as entered.
 */
export function tGivenValues(result, submitted) {
  const test = T_TESTS[submitted.testId];
  const { input } = submitted;
  /** @type {[string, string][]} */
  const items = [
    [
      `${test.nullField.symbol} · ${test.nullField.label.toLowerCase()}`,
      formatExact(input[test.nullField.name]),
    ],
  ];
  if (submitted.mode === "raw") {
    for (const column of test.columns)
      items.push([`${column.label} (${column.tag})`, `${input[column.key].length} values`]);
  } else {
    for (const field of test.fields)
      items.push([
        `${field.symbol} · ${field.group ? `${field.group} ` : ""}${field.label.toLowerCase()}`,
        formatExact(input[field.name]),
      ]);
  }
  if (test.id === "two-sample")
    items.push([
      "Variances",
      input.pooled ? "Pooled (assumed equal)" : "Welch (not assumed equal)",
    ]);
  items.push(["α", String(result.alpha)]);
  return items;
}

/** Print-ready t-test report: hypotheses, given values, decision, CI, curve and solution. */
export function TTestReport({ result, submitted }) {
  const { decimals } = useSettings();
  const test = T_TESTS[submitted.testId];
  const tail = TAILS.find((t) => t.value === result.tail);
  const tc = result.tail === "left" ? result.critical.lower : result.critical.upper;
  const critical =
    result.tail === "two"
      ? `±${formatNumber(Math.abs(tc), decimals, { fixed: true })}`
      : formatNumber(tc, decimals, { fixed: true });
  const statements = submitted.statements;

  return (
    <ReportDialog title={`${test.title} t-test`} subtitle={`${tail?.label} · α = ${result.alpha}`}>
      <ReportSection number={1} title="Hypotheses">
        <div className="grid gap-2 font-mono text-sm sm:grid-cols-2">
          {[
            ["h0", "H₀", result.hypotheses.null, statements?.h0],
            ["ha", "Hₐ", result.hypotheses.alternative, statements?.ha],
          ].map(([side, label, formula, words]) => (
            <div key={side} className="rounded-md border px-3 py-2">
              <p>
                <span className="text-muted-foreground">{label}: </span>
                <span className="font-semibold">{formula}</span>
              </p>
              {words ? <p className="mt-1 font-sans text-sm">{words}</p> : null}
            </div>
          ))}
        </div>
      </ReportSection>

      <ReportSection number={2} title="Given">
        <ReportFacts items={tGivenValues(result, submitted)} />
      </ReportSection>

      <ReportSection number={3} title="Decision">
        <ReportFacts
          items={[
            ["Test statistic t", formatNumber(result.statistic, decimals, { fixed: true })],
            ["Degrees of freedom", formatNumber(result.df, decimals)],
            ["Critical t", critical],
            ["p-value", formatPValue(result.pValue, decimals)],
            ["Decision", result.reject ? "Reject H₀" : "Fail to reject H₀"],
          ]}
        />
        <p className="rounded-md border-l-4 border-foreground bg-muted px-4 py-3 text-sm leading-relaxed">
          {result.conclusion}
        </p>
        <p className="font-mono text-sm">{ciText(result, decimals)}</p>
        {result.warnings.map((warning) => (
          <p key={warning} className="text-sm text-muted-foreground">
            Note: {warning}
          </p>
        ))}
      </ReportSection>

      <ReportSection number={4} title="t distribution">
        <NormalCurveChart result={result} showPValue />
      </ReportSection>

      <ReportSection number={5} title="Step-by-step solution">
        <ReportSteps steps={result.steps} />
      </ReportSection>
    </ReportDialog>
  );
}
