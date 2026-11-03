import { expect, test, type Page } from "@playwright/test";
import { readFileSync, statSync } from "node:fs";
import { makeReport } from "./fixture";
const videoPath = "/tmp/identifier-q-tests/test-footage.webm";
async function upload(page: Page) {
  await page
    .locator('input[aria-label="Choose video file"]')
    .setInputFiles(videoPath);
  await expect(page.getByText(/Local preview ready/)).toBeVisible();
}
async function importReport(page: Page, id = "test-report", score = 70) {
  const r = makeReport(id, score);
  r.video.size = statSync(videoPath).size;
  await page.locator('input[aria-label="Import report JSON"]').setInputFiles({
    name: `${id}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(r)),
  });
  return r;
}
test("four-step workflow, validated footage and honest unavailable analysis", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "boxing", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Use identifierQ", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Select a browser-compatible video",
  );
  await page.locator('input[aria-label="Choose video file"]').setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("no"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose an MP4" }),
  ).toBeVisible();
  await upload(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Fighter name or identifier").fill("Alex");
  await page.getByRole("radio", { name: /Red corner/ }).check();
  await page.getByLabel(/Identification notes/).fill("White shorts");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "kickboxing", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("Kicking technique", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Competitive ruleset").selectOption("low-kick");
  await expect(page.getByText("Knee techniques · N/A")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Alex · Red corner")).toBeVisible();
  await page
    .getByRole("button", { name: "Generate performance analysis" })
    .dblclick();
  await expect(
    page.getByRole("status").filter({ hasText: "engine is not connected" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Your footage has not been uploaded or analyzed/),
  ).toBeVisible();
  const d = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("identifier-q.draft.v1")!),
  );
  expect(d.method).toBe("red");
  expect(d.discipline).toBe("kickboxing");
  expect(d.notes).toBe("White shorts");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("Fighter name or identifier")).toHaveValue(
    "Alex",
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "kickboxing", exact: true }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Select a browser-compatible video",
  );
});
test("manual identification, replacement resets fighter hints and preserves workflow navigation", async ({
  page,
}) => {
  await page.goto("/#/new");
  await upload(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Fighter name or identifier").fill("Alex");
  await page.getByRole("radio", { name: /Manual identification/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("representative frame");
  await page.getByRole("button", { name: "Use current frame center" }).click();
  await expect(page.getByText("Reference selected at")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configure analysis", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /STEP 1 Upload footage/ }).click();
  await page.getByRole("button", { name: "Remove video" }).click();
  await upload(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Manual identification/ }),
  ).not.toBeChecked();
  await expect(page.getByLabel(/Identification notes/)).toHaveValue("");
});
test("import, report evidence seeking, immutable discipline, comparison and reload persistence", async ({
  page,
}) => {
  await page.goto("/#/history");
  await expect(
    page.getByText("A clean slate. A clear direction."),
  ).toBeVisible();
  await importReport(page);
  await expect(
    page.getByRole("heading", { name: "1 saved assessment" }),
  ).toBeVisible();
  await importReport(page, "test-report-2", 80);
  await page
    .getByRole("link", { name: /Synthetic test athlete/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Performance overview" }),
  ).toBeVisible();
  await expect(page.getByText("Not assessed", { exact: true })).not.toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "kickboxing", exact: true })
    .first()
    .click();
  await expect(page.getByText(/BOXING ·/)).toBeVisible();
  await expect(
    page.getByText("Kicking technique", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Choose original video").setInputFiles(videoPath);
  await page.locator("video").evaluate(
    (v: HTMLVideoElement) =>
      new Promise<void>((resolve) => {
        if (v.readyState >= 1) resolve();
        else v.onloadedmetadata = () => resolve();
      }),
  );
  await page.getByRole("button", { name: /0:01 Synthetic test event/ }).click();
  await expect(
    page.getByRole("tab", { name: "Technical breakdown" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("video")).toHaveJSProperty("currentTime", 1);
  await expect(
    page.getByRole("heading", { name: "Test observation" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Improvement", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Engineer your improvement" }),
  ).toBeVisible();
  await page.getByText("Test drill", { exact: false }).click();
  await expect(page.getByText("Test execution")).toBeVisible();
  await page.goto("/#/history");
  await page.getByRole("checkbox").nth(0).check();
  await page.getByRole("checkbox").nth(1).check();
  await expect(page.getByText("+10", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Repeated weakness dimensions")).toBeVisible();
  await page
    .getByLabel("Filter by discipline", { exact: true })
    .selectOption("kickboxing");
  await expect(page.getByText("No matching assessments")).toBeVisible();
  await page
    .getByLabel("Filter by discipline", { exact: true })
    .selectOption("boxing");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "2 saved assessments" }),
  ).toBeVisible();
});
test("rejects malformed imports and preserves corrupted local storage for explicit recovery", async ({
  page,
}) => {
  await page.goto("/#/history");
  await page.locator('input[aria-label="Import report JSON"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"id":"bad"}'),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Import failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "0 saved assessments" }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("identifier-q.reports.v1", "broken"),
  );
  await page.reload();
  await expect(
    page.getByRole("status").filter({ hasText: "unreadable data" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("identifier-q.reports.v1")),
  ).toBe("broken");
  await page.goto("/#/settings");
  await page
    .getByRole("button", { name: "Clear this browser’s workspace" })
    .click();
  await page.getByRole("button", { name: "Delete local data" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("identifier-q.reports.v1")),
  ).toBeNull();
});
for (const width of [320, 375, 390, 430, 768, 1440])
  test(`navigation and overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    for (const path of ["/", "/new", "/history", "/report", "/settings"]) {
      await page.goto(`/#${path}`);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/");
    await page
      .getByRole("main")
      .getByRole("link", { name: "Use identifierQ", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/new$/);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: /Every movement/ }),
    ).toBeVisible();
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `/tmp/identifier-q-tests/dashboard-${width}.png`,
        fullPage: true,
      });
  });
test("unsupported codec gives actionable feedback", async ({ page }) => {
  await page.goto("/#/new");
  await page.locator('input[aria-label="Choose video file"]').setInputFiles({
    name: "invalid.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync(videoPath).subarray(0, 20),
  });
  await expect(page.getByRole("alert")).toContainText("could not decode");
});
test("keyboard navigation and accessible workspace guide", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace guide" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close guide" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Got it" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Workspace guide" }),
  ).toBeFocused();
});
test("report and workflow fit a 320px screen including real imported content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto("/#/history");
  await importReport(page);
  await page.getByRole("link", { name: /Synthetic test athlete/ }).click();
  for (const tab of ["Overview", "Technical breakdown", "Improvement"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/#/new");
  await upload(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Fighter name or identifier").fill("Alex");
  await page.getByRole("radio", { name: /Blue corner/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "kickboxing", exact: true })
    .last()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
