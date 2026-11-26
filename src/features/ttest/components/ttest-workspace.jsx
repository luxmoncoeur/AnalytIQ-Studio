"use client";

import {
  ClipboardPaste,
  Eraser,
  FlaskConical,
  RefreshCw,
  Sigma,
  Table2,
  Upload,
} from "lucide-react";
import { ComputeButton } from "@/components/shared/compute-button";
import { PageHeader } from "@/components/shared/page-header";
import { Reveal } from "@/components/shared/reveal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VerdictCard, ZTestDetails } from "@/features/hypothesis/components/hypothesis-results";
import {
  AlphaPanel,
  HypothesesPanel,
  SampleInputs,
  TestPicker,
} from "@/features/hypothesis/components/test-inputs";
import { DataTableEditor } from "@/features/regression/components/data-table-editor";
import { PastePanel, UploadPanel } from "@/features/regression/components/import-panels";
import { T_TEST_ORDER, T_TESTS } from "../config";
import { useTTest } from "../hooks/use-ttest";
import { TTestReport } from "./ttest-report";

function SectionTitle({ number, id, children }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
      <span
        className="grid size-5 shrink-0 place-items-center rounded-md border border-border/80 bg-muted font-mono text-[11px] font-semibold text-foreground"
        aria-hidden="true"
      >
        {number}
      </span>
      {children}
    </h2>
  );
}

const PASTE_HINTS = {
  1: {
    placeholder: "Hours\n12\n14\n11\n15\n\nor on one line: 12 14 11 15",
    hint: "One value per line (or all on one line). Use a period for decimals. A header row is detected automatically.",
    upload: "One column of values.",
  },
  2: {
    placeholder: "Before\tAfter\n82\t78\n75\t74\n90\t84",
    hint: "Two columns, separated by tabs, commas, semicolons or spaces. For two independent samples the columns may have different lengths (leave cells empty).",
    upload: "First column = sample 1, second column = sample 2.",
  },
};

/** Raw data entry: table, paste or CSV, one column per sample. */
function RawDataInputs({ tt }) {
  const columns = tt.test.columns;
  const hints = PASTE_HINTS[columns.length];
  return (
    <div className="space-y-2">
      <Tabs defaultValue="table" className="gap-3">
        <TabsList className="grid h-8 w-full grid-cols-3">
          <TabsTrigger value="table" className="text-xs">
            <Table2 className="size-3.5" aria-hidden="true" /> Table
          </TabsTrigger>
          <TabsTrigger value="paste" className="text-xs">
            <ClipboardPaste className="size-3.5" aria-hidden="true" /> Paste
          </TabsTrigger>
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="size-3.5" aria-hidden="true" /> CSV
          </TabsTrigger>
        </TabsList>
        <TabsContent value="table">
          <DataTableEditor
            rows={tt.rows}
            columns={columns}
            errors={tt.cellErrors}
            showErrors={tt.showErrors}
            onCellChange={tt.updateCell}
            onAddRow={tt.addRow}
            onRemoveRow={tt.removeRow}
            caption="Sample values. Empty cells are skipped. Press Enter to move to the next cell."
          />
        </TabsContent>
        <TabsContent value="paste">
          <PastePanel onImport={tt.importText} placeholder={hints.placeholder} hint={hints.hint} />
        </TabsContent>
        <TabsContent value="upload">
          <UploadPanel onImport={tt.importText} hint={hints.upload} />
        </TabsContent>
      </Tabs>
      {tt.fieldErrors.data ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {tt.fieldErrors.data}
        </p>
      ) : null}
    </div>
  );
}

function ReadingGuide() {
  return (
    <Card className="gap-3 shadow-xs">
      <CardHeader>
        <CardTitle>When to use a t-test</CardTitle>
        <CardDescription>
          Use t instead of z when the population standard deviation σ is unknown and you estimate it
          with the sample standard deviation s.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["One sample", "Is the mean of one group different from a stated value μ₀?"],
            [
              "Two samples",
              "Do two independent groups have different means? Welch's test is the safe default.",
            ],
            ["Paired", "Did the same subjects change between two measurements (before / after)?"],
          ].map(([term, text]) => (
            <li key={term} className="rounded-lg border border-border/80 bg-card p-3 shadow-2xs">
              <span className="text-sm font-semibold">{term}</span>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Press <span className="font-medium text-foreground">Load example</span> to see a full
          worked answer.
        </p>
      </CardContent>
    </Card>
  );
}

export function TTestWorkspace() {
  const tt = useTTest();
  const result = tt.outcome?.ok ? tt.outcome.value : null;
  const summaryTest = { ...tt.test, modes: undefined };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow="Module 3"
        icon={Sigma}
        title="t-Tests"
        description="Test a mean when σ is unknown: one sample, two independent samples (Welch or pooled) or paired data. Enter raw data or summary statistics and get the verdict, the t curve, a confidence interval and the full solution."
      />

      <TestPicker
        value={tt.testId}
        onChange={tt.chooseTest}
        tests={T_TESTS}
        order={T_TEST_ORDER}
        label="Type of t-test"
        className="grid-cols-1 sm:grid-cols-3"
      />

      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Reveal className="min-w-0 xl:col-span-5" distance={16}>
          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle>{tt.test.title} t-test</CardTitle>
              <CardDescription>{tt.test.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4">
              <section aria-labelledby="t-sec-hyp" className="space-y-3">
                <SectionTitle number={1} id="t-sec-hyp">
                  Hypotheses
                </SectionTitle>
                <HypothesesPanel
                  test={tt.test}
                  tail={tt.tail}
                  onTailChange={tt.setTail}
                  values={tt.values}
                  onValueChange={tt.setValue}
                  statements={tt.statements}
                  onStatementsChange={tt.setStatements}
                  errors={tt.fieldErrors}
                />
              </section>
              <section aria-labelledby="t-sec-alpha" className="space-y-3">
                <SectionTitle number={2} id="t-sec-alpha">
                  Level of significance (α)
                </SectionTitle>
                <AlphaPanel
                  choice={tt.alphaChoice}
                  onChoiceChange={tt.setAlphaChoice}
                  customText={tt.customAlpha}
                  onCustomChange={tt.setCustomAlpha}
                  error={
                    tt.alphaChoice === "custom" && tt.customAlpha !== ""
                      ? tt.alpha.error
                      : tt.fieldErrors.alpha
                  }
                />
              </section>
              <section aria-labelledby="t-sec-sample" className="space-y-3">
                <SectionTitle number={3} id="t-sec-sample">
                  Sample
                </SectionTitle>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={tt.mode}
                  onValueChange={(val) => {
                    if (val) tt.setMode(val);
                  }}
                  aria-label="How to enter the sample"
                  className="h-8 w-full text-xs"
                >
                  <ToggleGroupItem value="raw" className="h-8 flex-1 px-2 text-xs">
                    Raw data
                  </ToggleGroupItem>
                  <ToggleGroupItem value="summary" className="h-8 flex-1 px-2 text-xs">
                    Summary (x̄, s, n)
                  </ToggleGroupItem>
                </ToggleGroup>
                {tt.mode === "raw" ? (
                  <RawDataInputs tt={tt} />
                ) : (
                  <SampleInputs
                    test={summaryTest}
                    fields={tt.test.fields}
                    values={tt.values}
                    onValueChange={tt.setValue}
                    errors={tt.fieldErrors}
                  />
                )}
                {tt.testId === "two-sample" ? (
                  <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/30 p-3">
                    <Switch id="t-pooled" checked={tt.pooled} onCheckedChange={tt.setPooled} />
                    <div className="grid gap-0.5">
                      <Label htmlFor="t-pooled" className="text-xs font-medium sm:text-sm">
                        Assume equal variances (pooled t-test)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Off: Welch&apos;s test with Welch–Satterthwaite df (recommended).
                      </p>
                    </div>
                  </div>
                ) : null}
              </section>
            </CardContent>
            <CardFooter className="gap-2 border-t px-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={tt.loadExample}
              >
                Load example
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={tt.reset}
              >
                <Eraser className="size-3.5" aria-hidden="true" /> Clear
              </Button>
              <ComputeButton onClick={tt.compute} className="ml-auto" />
            </CardFooter>
          </Card>
        </Reveal>

        <div className="min-w-0 space-y-4 xl:col-span-7" aria-live="polite">
          {tt.stale && result ? (
            <Alert>
              <RefreshCw aria-hidden="true" />
              <AlertTitle>The inputs have changed</AlertTitle>
              <AlertDescription>Press Compute to update the verdict.</AlertDescription>
            </Alert>
          ) : null}
          {tt.outcome && !tt.outcome.ok ? (
            <Alert variant="destructive">
              <FlaskConical aria-hidden="true" />
              <AlertTitle>Cannot run the test</AlertTitle>
              <AlertDescription>{tt.outcome.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {result ? (
            <>
              <VerdictCard result={result} statements={tt.submitted?.statements} />
              <ZTestDetails
                result={result}
                action={<TTestReport result={result} submitted={tt.submitted} />}
              />
            </>
          ) : (
            <ReadingGuide />
          )}
        </div>
      </div>
    </div>
  );
}
