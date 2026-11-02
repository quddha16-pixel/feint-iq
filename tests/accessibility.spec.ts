import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { makeReport } from "./fixture";
test("main screens and populated report meet automated WCAG 2.1 AA checks", async ({
  page,
}) => {
  await page.goto("/");
  for (const path of ["/", "/new", "/history", "/report", "/settings"]) {
    await page.goto(`/#${path}`);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations,
      `${path}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
  await page.evaluate(
    (r) => localStorage.setItem("identifier-q.reports.v1", JSON.stringify([r])),
    makeReport(),
  );
  await page.goto("/#/report/test-report");
  await page.reload();
  for (const tab of ["Overview", "Technical breakdown", "Improvement"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations,
      `${tab}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
});
