import { expect, test } from "@playwright/test";

const shows = (page, text) => expect(page.getByText(text, { exact: true }).first()).toBeAttached();

/** Expected values for each built-in example, checked against SciPy. */
const CASES = [
  // ttest_1samp(x, 12): t = 3, df = 9, p = 0.014956
  { test: "One sample", t: "3.0000", critical: "±2.2622", p: "0.0150", df: "df = 9" },
  // ttest_ind(…, equal_var=False, alternative="greater"): t = 3.1615, df = 12.5422, p = 0.0039
  { test: "Two samples", t: "3.1615", critical: "1.7759", p: "0.0039", df: "df = 12.5422" },
  // ttest_rel(before, after, alternative="greater"): t = 4.6888, df = 7, p = 0.0011
  { test: "Paired", t: "4.6888", critical: "1.8946", p: "0.0011", df: "df = 7" },
];

test.describe("t-tests", () => {
  for (const item of CASES) {
    test(`${item.test}: example matches SciPy`, async ({ page }) => {
      await page.goto("/t-test");
      await page.getByRole("radio", { name: new RegExp(item.test) }).click();
      await page.getByRole("button", { name: "Load example" }).click();
      await shows(page, item.t);
      await shows(page, item.critical);
      await shows(page, item.p);
      await expect(page.getByText(item.df).first()).toBeAttached();
      await expect(page.getByRole("heading", { name: "Reject H₀" })).toBeVisible();
      await expect(page.getByRole("img", { name: /t distribution curve/ })).toBeVisible();
      await expect(page.getByText(/confidence (interval|bound)/).first()).toBeVisible();
    });
  }

  test("pooled option switches to df = n₁ + n₂ − 2", async ({ page }) => {
    await page.goto("/t-test");
    await page.getByRole("radio", { name: /Two samples/ }).click();
    await page.getByLabel(/Assume equal variances/).click();
    await page.getByRole("button", { name: "Load example" }).click();
    // ttest_ind(…, equal_var=True, alternative="greater"): t = 3.0880, df = 13
    await shows(page, "3.0880");
    await expect(page.getByText("df = 13").first()).toBeAttached();
  });

  test("summary statistics give the same answer as raw data", async ({ page }) => {
    await page.goto("/t-test");
    await page.getByRole("button", { name: "Load example" }).click();
    await page.getByRole("radio", { name: /Summary/ }).click();
    await page.getByRole("button", { name: "Compute" }).click();
    await shows(page, "3.0000");
  });

  test("pasted data loads into the table", async ({ page }) => {
    await page.goto("/t-test");
    await page.getByLabel(/Hypothesized mean/).fill("12");
    await page.getByRole("tab", { name: "Paste" }).click();
    await page.getByRole("textbox", { name: /Paste from/ }).fill("12 14 11 15 13 16 12 14 15 13");
    await page.getByRole("button", { name: "Use this data" }).click();
    await page.getByRole("button", { name: "Compute" }).click();
    await shows(page, "3.0000");
  });

  test("explains invalid input", async ({ page }) => {
    await page.goto("/t-test");
    await page.getByRole("radio", { name: /Paired/ }).click();
    await page.getByLabel(/Hypothesized mean difference/).fill("0");
    await page.getByLabel("Row 1, x₁").fill("5");
    await page.getByLabel("Row 1, x₂").fill("4");
    await page.getByLabel("Row 2, x₁").fill("7");
    await page.getByLabel("Row 2, x₂").fill("6");
    await page.getByLabel("Row 3, x₁").fill("9");
    await page.getByRole("button", { name: "Compute" }).click();
    await expect(page.getByText(/Paired data needs one value in each column/)).toBeVisible();

    await page.getByRole("radio", { name: /One sample/ }).click();
    await page.getByRole("radio", { name: /Summary/ }).click();
    await page.getByLabel(/Hypothesized mean/).fill("0");
    await page.getByLabel(/Sample mean/).fill("3");
    await page.getByLabel(/Sample standard deviation/).fill("1");
    await page.getByLabel(/Sample size/).fill("1");
    await page.getByRole("button", { name: "Compute" }).click();
    await expect(page.getByText(/must be at least 2/)).toBeVisible();
  });
});
