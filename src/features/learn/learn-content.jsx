"use client";

import { BookOpenText, Cpu } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, roundHalfUp } from "@/lib/format";
import { criticalZ, normalCdf, STRENGTH_SCALE, tIsf } from "@/lib/stats";

const SECTIONS = [
  { id: "regression", label: "Regression" },
  { id: "correlation", label: "Correlation scale" },
  { id: "z-tests", label: "Z-tests" },
  { id: "t-tests", label: "t-tests" },
  { id: "decision", label: "Decision rules" },
  { id: "critical-values", label: "Critical values" },
  { id: "z-table", label: "Z-table" },
  { id: "t-table", label: "t-table" },
  { id: "methods", label: "Numerical methods" },
];

const REGRESSION_FORMULAS = [
  {
    name: "Means",
    formula: "X̄ = ΣX / n,   Ȳ = ΣY / n",
    note: "The regression line always passes through (X̄, Ȳ).",
  },
  {
    name: "Slope",
    formula: "b = [nΣXY − (ΣX)(ΣY)] / [nΣX² − (ΣX)²]",
    note: "Change in predicted Y for a 1-unit increase in X.",
  },
  { name: "Y-intercept", formula: "a = Ȳ − bX̄", note: "Predicted Y when X = 0." },
  {
    name: "Regression equation",
    formula: "Ŷ = a + bX",
    note: "Least-squares line: minimises Σ(Y − Ŷ)².",
  },
  {
    name: "Pearson correlation coefficient",
    formula: "r = [nΣXY − (ΣX)(ΣY)] / √{[nΣX² − (ΣX)²][nΣY² − (ΣY)²]}",
    note: "Strength and direction of the linear relationship, −1 ≤ r ≤ 1.",
  },
  {
    name: "Coefficient of determination",
    formula: "r² = (r)²",
    note: "Share of the variation in Y explained by X.",
  },
];

const Z_TESTS = [
  {
    name: "One-sample mean (σ known)",
    formula: "z = (x̄ − μ₀) / (σ / √n)",
    assumptions: "Random sample; population normal or n ≥ 30; σ known.",
  },
  {
    name: "One-sample proportion",
    formula: "z = (p̂ − p₀) / √[p₀(1 − p₀) / n]",
    assumptions: "Random sample; np₀ ≥ 10 and n(1 − p₀) ≥ 10.",
  },
  {
    name: "Two-sample means (σ₁, σ₂ known)",
    formula: "z = [(x̄₁ − x̄₂) − D₀] / √(σ₁²/n₁ + σ₂²/n₂)",
    assumptions: "Independent random samples; populations normal or n₁, n₂ ≥ 30.",
  },
  {
    name: "Two-sample proportions (pooled)",
    formula: "z = (p̂₁ − p̂₂) / √[p̄(1 − p̄)(1/n₁ + 1/n₂)],   p̄ = (x₁ + x₂) / (n₁ + n₂)",
    assumptions: "Independent random samples; at least 10 successes and 10 failures in each.",
  },
];

const T_TESTS = [
  {
    name: "One-sample mean (σ unknown)",
    formula: "t = (x̄ − μ₀) / (s / √n),   df = n − 1",
    assumptions: "Random sample; population approximately normal (less important as n grows).",
  },
  {
    name: "Paired samples",
    formula: "t = (d̄ − μ_d₀) / (s_d / √n),   d = x₁ − x₂,   df = n − 1",
    assumptions: "Pairs are independent of each other; the differences are approximately normal.",
  },
  {
    name: "Two independent samples (Welch, default)",
    formula:
      "t = [(x̄₁ − x̄₂) − D₀] / √(s₁²/n₁ + s₂²/n₂),   df = (s₁²/n₁ + s₂²/n₂)² / [(s₁²/n₁)²/(n₁ − 1) + (s₂²/n₂)²/(n₂ − 1)]",
    assumptions:
      "Independent random samples; populations approximately normal; variances may differ.",
  },
  {
    name: "Two independent samples (pooled)",
    formula:
      "t = [(x̄₁ − x̄₂) − D₀] / [s_p √(1/n₁ + 1/n₂)],   s_p² = [(n₁ − 1)s₁² + (n₂ − 1)s₂²] / (n₁ + n₂ − 2),   df = n₁ + n₂ − 2",
    assumptions: "As Welch, plus equal population variances.",
  },
  {
    name: "Confidence interval (two-tailed)",
    formula: "estimate ± t(α/2, df) · SE",
    assumptions:
      "One-tailed tests use a one-sided bound: estimate − t(α, df)·SE for Hₐ: >, estimate + t(α, df)·SE for Hₐ: <.",
  },
];

/** One-tailed areas for the t-table columns (two-tailed α is twice these). */
const T_TABLE_AREAS = [0.1, 0.05, 0.025, 0.01, 0.005, 0.001, 0.0005];
const T_TABLE_DFS = [
  ...Array.from({ length: 30 }, (_, i) => i + 1),
  40,
  50,
  60,
  80,
  100,
  120,
  1000,
];

const ALPHAS = [0.1, 0.05, 0.025, 0.02, 0.01, 0.005, 0.001];
const Z_ROWS = Array.from({ length: 35 }, (_, i) => i / 10);
const Z_COLS = Array.from({ length: 10 }, (_, i) => i / 100);

function Formula({ children }) {
  return (
    <p className="rounded-md border border-border/80 bg-muted/40 px-3 py-2 font-mono text-xs break-words text-foreground sm:text-sm">
      {children}
    </p>
  );
}

function Section({ id, title, description, children }) {
  return (
    <div id={id} className="scroll-mt-32">
      <Reveal>
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>{title}</h2>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </Reveal>
    </div>
  );
}

export function LearnContent() {
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Reference"
        icon={BookOpenText}
        title="Formulas & Tables"
        description="Every formula the system uses, the interpretation scale, critical values, and full standard normal and t tables, all generated by the same engine that runs the analyses."
      />

      <nav
        aria-label="On this page"
        className="sticky top-14 z-10 -mx-1 overflow-x-auto bg-background/90 px-1 py-2 backdrop-blur-md"
      >
        <ul className="flex w-max gap-1 rounded-lg border border-border/80 bg-card/95 p-1 shadow-xs">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section
        id="regression"
        title="Simple linear regression"
        description="Least-squares fit of Y on X."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {REGRESSION_FORMULAS.map((item) => (
            <div key={item.name} className="space-y-1.5">
              <p className="text-xs font-semibold sm:text-sm">{item.name}</p>
              <Formula>{item.formula}</Formula>
              <p className="text-xs text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="correlation"
        title="Interpreting r"
        description="Strength from |r| (Evans, 1996); direction from the sign of r."
      >
        <div className="overflow-x-auto rounded-md border border-border/80 bg-card">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-muted/80">
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">
                  |r|
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Strength
                </th>
              </tr>
            </thead>
            <tbody>
              {STRENGTH_SCALE.map((band) => (
                <tr
                  key={band.label}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2 font-mono">{band.range}</td>
                  <td className="px-3 py-2 font-medium">{band.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
          r &gt; 0: positive (Y tends to rise with X). r &lt; 0: negative (Y tends to fall as X
          rises).
        </p>
      </Section>

      <Section
        id="z-tests"
        title="Z-test statistics"
        description="Each z measures how many standard errors the sample result is from the value in H₀."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {Z_TESTS.map((item) => (
            <div key={item.name} className="space-y-1.5">
              <p className="text-xs font-semibold sm:text-sm">{item.name}</p>
              <Formula>{item.formula}</Formula>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Assumptions:</span> {item.assumptions}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="t-tests"
        title="t-test statistics"
        description="Used when σ is unknown and estimated by the sample standard deviation s. Each t follows Student's t distribution with df degrees of freedom when H₀ is true."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {T_TESTS.map((item) => (
            <div key={item.name} className="space-y-1.5">
              <p className="text-xs font-semibold sm:text-sm">{item.name}</p>
              <Formula>{item.formula}</Formula>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Assumptions:</span> {item.assumptions}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="decision"
        title="Decision rules"
        description="Both rules always give the same decision. For t-tests, replace z with t, Z with T and use the t critical value for the test's df."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Two-tailed (Hₐ: ≠)", "Reject H₀ if z ≤ −z(α/2) or z ≥ z(α/2)", "p = 2 · P(Z ≥ |z|)"],
            ["Right-tailed (Hₐ: >)", "Reject H₀ if z ≥ z(α)", "p = P(Z ≥ z)"],
            ["Left-tailed (Hₐ: <)", "Reject H₀ if z ≤ −z(α)", "p = P(Z ≤ z)"],
          ].map(([name, rule, p]) => (
            <div
              key={name}
              className="space-y-1.5 rounded-lg border border-border/80 bg-card p-3.5 shadow-2xs"
            >
              <p className="text-xs font-semibold sm:text-sm">{name}</p>
              <p className="font-mono text-xs">{rule}</p>
              <p className="font-mono text-xs text-muted-foreground">{p}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground sm:text-sm">
          p-value rule: reject H₀ when p ≤ α. Otherwise, fail to reject H₀ (this is not the same as
          proving H₀ true).
        </p>
      </Section>

      <Section
        id="critical-values"
        title="Critical values"
        description="Computed with the inverse normal CDF to full precision; z-tables round these to two or three decimals."
      >
        <div
          className="overflow-x-auto rounded-md border border-border/80 bg-card"
          tabIndex={0}
          role="region"
          aria-label="Critical values table"
        >
          <table className="w-full min-w-[520px] font-mono text-xs tabular-nums sm:text-sm">
            <thead className="bg-muted/80 text-xs">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          α
                        </span>
                      }
                    />
                    <TooltipContent>Significance level (Type I error probability)</TooltipContent>
                  </Tooltip>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          Two-tailed ±z(α/2)
                        </span>
                      }
                    />
                    <TooltipContent>
                      Critical cutoffs for Hₐ: ≠ with rejection region split across both tails
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          Right-tailed z(α)
                        </span>
                      }
                    />
                    <TooltipContent>
                      Critical cutoff for Hₐ: &gt; with rejection region in the upper tail
                    </TooltipContent>
                  </Tooltip>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          Left-tailed −z(α)
                        </span>
                      }
                    />
                    <TooltipContent>
                      Critical cutoff for Hₐ: &lt; with rejection region in the lower tail
                    </TooltipContent>
                  </Tooltip>
                </th>
              </tr>
            </thead>
            <tbody>
              {ALPHAS.map((alpha) => (
                <tr
                  key={alpha}
                  className="border-t border-border/60 transition-colors hover:bg-muted/30"
                >
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-foreground">
                    {alpha}
                  </th>
                  <td className="px-3 py-2 text-right">
                    ±{formatNumber(criticalZ(alpha, "two").upper, 4, { fixed: true })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatNumber(criticalZ(alpha, "right").upper, 4, { fixed: true })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatNumber(criticalZ(alpha, "left").lower, 4, { fixed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="z-table"
        title="Standard normal table"
        description="Area to the left of z, P(Z ≤ z), for z ≥ 0. For negative z use P(Z ≤ −z) = 1 − P(Z ≤ z)."
      >
        <div
          className="max-h-[560px] overflow-auto rounded-md border border-border/80 bg-card"
          tabIndex={0}
          role="region"
          aria-label="Standard normal table"
        >
          <table className="w-full min-w-[720px] font-mono text-xs tabular-nums">
            <caption className="sr-only">
              Standard normal cumulative probabilities. Row: z to one decimal. Column: second
              decimal.
            </caption>
            <thead className="sticky top-0 bg-muted/90 backdrop-blur">
              <tr>
                <th scope="col" className="px-2.5 py-2 text-left font-semibold text-foreground">
                  z
                </th>
                {Z_COLS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-2 py-2 text-right font-medium text-muted-foreground"
                  >
                    {column.toFixed(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Z_ROWS.map((row) => (
                <tr
                  key={row}
                  className="border-t border-border/60 transition-colors odd:bg-muted/20 hover:bg-muted/30"
                >
                  <th scope="row" className="px-2.5 py-1.5 text-left font-semibold text-foreground">
                    {row.toFixed(1)}
                  </th>
                  {Z_COLS.map((column) => (
                    <td key={column} className="px-2 py-1.5 text-right text-muted-foreground">
                      {roundHalfUp(normalCdf(Math.round((row + column) * 100) / 100), 4).toFixed(4)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="t-table"
        title="t-table (critical values)"
        description="t(α, df) with upper-tail area α: P(T ≥ t) = α. For a two-tailed test at level α, use the column α/2. Computed by the same engine that runs the t-tests."
      >
        <div
          className="max-h-[560px] overflow-auto rounded-md border border-border/80 bg-card"
          tabIndex={0}
          role="region"
          aria-label="t-table"
        >
          <table className="w-full min-w-[620px] font-mono text-xs tabular-nums">
            <caption className="sr-only">
              Critical values of Student&apos;s t. Row: degrees of freedom. Column: upper-tail area
              α (two-tailed α in brackets).
            </caption>
            <thead className="sticky top-0 bg-muted/90 backdrop-blur">
              <tr>
                <th scope="col" className="px-2.5 py-2 text-left font-semibold text-foreground">
                  df
                </th>
                {T_TABLE_AREAS.map((area) => (
                  <th
                    key={area}
                    scope="col"
                    className="px-2 py-2 text-right font-medium text-muted-foreground"
                  >
                    {area}{" "}
                    <span className="font-normal">({Number((2 * area).toPrecision(6))})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {T_TABLE_DFS.map((df) => (
                <tr
                  key={df}
                  className="border-t border-border/60 transition-colors odd:bg-muted/20 hover:bg-muted/30"
                >
                  <th scope="row" className="px-2.5 py-1.5 text-left font-semibold text-foreground">
                    {df}
                  </th>
                  {T_TABLE_AREAS.map((area) => (
                    <td key={area} className="px-2 py-1.5 text-right text-muted-foreground">
                      {formatNumber(tIsf(area, df), 3, { fixed: true })}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border/60">
                <th scope="row" className="px-2.5 py-1.5 text-left font-semibold text-foreground">
                  ∞ (z)
                </th>
                {T_TABLE_AREAS.map((area) => (
                  <td key={area} className="px-2 py-1.5 text-right text-muted-foreground">
                    {formatNumber(criticalZ(area, "right").upper, 3, { fixed: true })}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="methods"
        title="How the numbers are computed"
        description="For the methodology section of the paper."
      >
        <ul className="space-y-3 text-sm leading-relaxed">
          {[
            [
              "Normal CDF Φ(z) and upper tail 1 − Φ(z)",
              "W. J. Cody (1969), rational Chebyshev approximation of erfc. Relative error below 2 × 10⁻¹³ against SciPy over |z| ≤ 38; upper tails are computed directly, never as 1 − Φ.",
            ],
            [
              "Critical values Φ⁻¹(p)",
              "M. J. Wichura (1988), Algorithm AS 241 (PPND16). Relative error about 10⁻¹⁶.",
            ],
            [
              "Student's t distribution",
              "Regularized incomplete beta function: Lentz continued fraction (Numerical Recipes §6.4) for df < 1000, Didonato & Morris (1992) BGRAT expansion with erfc for larger df. Relative error below 10⁻¹³ against SciPy and mpmath for df from 1 to 10⁷.",
            ],
            [
              "t critical values",
              "Closed forms for df = 1 and 2; otherwise Newton's method on the log upper tail, safeguarded by bisection. Relative error below 10⁻¹⁴.",
            ],
            [
              "Sample mean and standard deviation",
              "Computed relative to a nearby centre (μ₀ or the first value) with a correction pass, so data such as 1,000,000,000.1 or 5.000001 keep their significant digits.",
            ],
            [
              "Sums ΣX, ΣY, ΣXY, ΣX², ΣY²",
              "Neumaier compensated summation, so long or mixed-magnitude data lose no digits.",
            ],
            [
              "Slope and r",
              "Centred (two-pass) sums of squares, scaled to avoid overflow; identical to the textbook formulas but stable for data with large offsets.",
            ],
            [
              "Rounding",
              "Everything is computed in double precision; values are rounded half away from zero only when displayed (1.005 → 1.01).",
            ],
            [
              "Verification",
              "Thousands of automated tests compare every result with SciPy and statsmodels reference values, plus property-based tests (−1 ≤ r ≤ 1, symmetry of the normal curve, agreement of the p-value and critical-value rules).",
            ],
          ].map(([name, text]) => (
            <li key={name} className="flex gap-3">
              <Cpu className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="font-semibold text-foreground">{name}.</span>{" "}
                <span className="text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-md font-mono text-xs font-normal">
            Double precision (IEEE 754)
          </Badge>
          <Badge variant="outline" className="rounded-md font-mono text-xs font-normal">
            SciPy 1.18 reference
          </Badge>
          <Badge variant="outline" className="rounded-md font-mono text-xs font-normal">
            statsmodels 0.15 reference
          </Badge>
        </div>
      </Section>
    </div>
  );
}
