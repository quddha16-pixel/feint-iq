import { expect, test } from "@playwright/test";
import { createBackend } from "../server/app";
import type { AnalysisConfiguration } from "../src/domain/contracts";
const token = "synthetic-browser-test-token-not-for-production";
let backend: Awaited<ReturnType<typeof createBackend>>;
let captured: AnalysisConfiguration | undefined;
let holdAnalysis = false;
let providerCanceled = false;
test.beforeAll(async () => {
  backend = await createBackend({
    accessToken: token,
    origin: "http://127.0.0.1:5173",
    provider: {
      name: "SYNTHETIC BROWSER TEST ADAPTER",
      model: "not-a-real-analysis",
      analyze: async (video, configuration, signal) => {
        captured = configuration;
        if (holdAnalysis)
          await new Promise((_, reject) =>
            signal.addEventListener(
              "abort",
              () => {
                providerCanceled = true;
                reject(new Error("Synthetic test cancellation"));
              },
              { once: true },
            ),
          );
        return {
          identityConfirmed: true,
          identityExplanation:
            "Synthetic assertion for browser transport testing only.",
          summary:
            "Synthetic test output. This is not a genuine fight assessment.",
          observations: [
            {
              metricId: "defense",
              category: "defense",
              finding: "Synthetic browser test finding",
              explanation:
                "This finding exists only inside the automated test adapter.",
              polarity: "neutral",
              frameIds: [video.frames.find((f) => !f.identityReference)!.id],
              correctiveAction: null,
            },
          ],
        };
      },
    },
  });
  await backend.listen({ host: "127.0.0.1", port: 0 });
});
test.afterAll(async () => {
  await backend.close();
});
for (const width of [320, 390, 1440])
  test(`Feint Labs branding, about page, and compact layout at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.locator(width < 761 ? ".mobile-brand" : ".brand-mark"),
    ).toHaveText(width < 761 ? "iQ /" : "iQ");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: "Use identifierQ", exact: true }),
    ).toBeVisible();
    await page.goto("/#/about");
    await expect(
      page.getByRole("heading", {
        name: "A clearer view of combat performance.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/Quentin Warminsky, an undefeated combat sports coach/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/");
    await page.screenshot({
      path: `/tmp/identifier-q-tests/refined-${width}.png`,
      fullPage: true,
    });
  });
test("identity references remain independent of screen position and can be removed", async ({
  page,
}) => {
  await page.goto("/#/new");
  await page
    .getByLabel("Choose video file")
    .setInputFiles("/tmp/identifier-q-tests/test-footage.webm");
  await expect(page.getByText(/Local preview ready/)).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Fighter name or identifier").fill("Test athlete");
  await page.getByRole("radio", { name: /Initially on the left/ }).check();
  const video = page.getByLabel("Fighter identification video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Use current frame center" }).click();
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 2;
  });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBe(2);
  await page.getByRole("button", { name: "Use current frame center" }).click();
  await expect(page.locator(".identity-references li")).toHaveCount(2);
  await page.getByRole("radio", { name: /Red corner/ }).check();
  await expect(page.locator(".identity-references li")).toHaveCount(2);
  await page.getByRole("button", { name: "Remove identity frame 1" }).click();
  await expect(page.locator(".identity-references li")).toHaveCount(1);
});
test("real HTTP upload, media decoding, streamed completion and report rendering with an explicitly synthetic provider", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByLabel("Backend URL").fill(backend.listeningOrigin);
  await page.getByLabel("Pilot session access token").fill(token);
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(
    page.getByText(/provider configured but live accuracy/),
  ).toBeVisible();
  await expect(page.getByLabel("Pilot session access token")).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    token,
  );
  await page.goto("/#/new");
  await page
    .getByLabel("Choose video file")
    .setInputFiles("/tmp/identifier-q-tests/test-footage.webm");
  await expect(page.getByText(/Local preview ready/)).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Fighter name or identifier")
    .fill("Synthetic transport test athlete");
  await page.getByRole("radio", { name: /Red corner/ }).check();
  await expect
    .poll(() =>
      page
        .getByLabel("Fighter identification video")
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Use current frame center" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate performance analysis" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Performance overview" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(
      "Synthetic test output. This is not a genuine fight assessment.",
    ),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(captured?.fighter.subjectId).toBeTruthy();
  expect(captured?.fighter.confirmationFrames).toHaveLength(1);
  expect(captured?.fighter.tracking?.identityIndependentOfPosition).toBe(true);
  await page.getByRole("tab", { name: "Technical breakdown" }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic browser test finding" }),
  ).toBeVisible();
  await expect(page.getByText("Verified source-frame time")).toBeVisible();
  await page.reload();
  await page.goto("/#/settings");
  await expect(
    page.getByText(/Local workspace available. A separately hosted/),
  ).toBeVisible();
});
test("backend connection failures do not claim an analysis or lose the local workspace", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByLabel("Backend URL").fill("http://127.0.0.1:1");
  await page.getByLabel("Pilot session access token").fill(token);
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(page.getByRole("alert")).toContainText("backend request failed");
  await page.goto("/#/new");
  await expect(
    page.getByRole("heading", { name: "Upload footage", exact: true }),
  ).toBeVisible();
});
test("duration validation enforces 10 seconds through 5 minutes", async ({
  page,
}) => {
  await page.goto("/#/new");
  for (const seconds of [8, 301]) {
    await page
      .getByLabel("Choose video file")
      .setInputFiles(`/tmp/identifier-q-tests/duration-${seconds}.webm`);
    await expect(page.getByRole("alert")).toContainText(
      "10 seconds to 5 minutes",
    );
    await page.getByRole("button", { name: "Remove video" }).click();
  }
  await page
    .getByLabel("Choose video file")
    .setInputFiles("/tmp/identifier-q-tests/test-footage.webm");
  await expect(page.getByText(/Local preview ready/)).toBeVisible();
});
test("Shades Of renders supported comparisons with evidence links, and does not invent them for older reports", async ({
  page,
}) => {
  const { makeReport } = await import("./fixture");
  const report = makeReport("style-ui-test");
  report.styleComparisons = [
    {
      referenceId: "dmitry-bivol",
      explanation: "Synthetic test explanation of a shared technical pattern.",
      observationIds: ["obs"],
    },
    {
      referenceId: "muhammad-ali",
      explanation: "Another test-only technical pattern.",
      observationIds: ["obs"],
    },
  ];
  await page.goto("/");
  await page.evaluate(
    (r) => localStorage.setItem("identifier-q.reports.v1", JSON.stringify([r])),
    report,
  );
  await page.goto("/#/report/style-ui-test");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Shades Of", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dmitry Bivol", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Muhammad Ali", exact: true }),
  ).toBeVisible();
  await page
    .locator(".shades-of")
    .getByRole("button", { name: /Test observation/ })
    .first()
    .click();
  await expect(
    page.getByRole("tab", { name: "Technical breakdown" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".observation.focused")).toContainText(
    "Test observation",
  );
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => localStorage.removeItem("identifier-q.reports.v1"));
  const legacy = makeReport("legacy-test");
  await page.evaluate(
    (r) => localStorage.setItem("identifier-q.reports.v1", JSON.stringify([r])),
    legacy,
  );
  await page.goto("/#/report/legacy-test");
  await page.reload();
  await expect(
    page.getByText("More evidence before a comparison."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dmitry Bivol", exact: true }),
  ).toHaveCount(0);
});

test("real processing stages lock configuration and cancel an active request without a partial report", async ({
  page,
}) => {
  holdAnalysis = true;
  providerCanceled = false;
  await page.goto("/#/settings");
  await page.getByLabel("Backend URL").fill(backend.listeningOrigin);
  await page.getByLabel("Pilot session access token").fill(token);
  await page.getByRole("button", { name: "Connect backend" }).click();
  await expect(
    page.getByText(/provider configured but live accuracy/),
  ).toBeVisible();
  await page.goto("/#/new");
  await page
    .getByLabel("Choose video file")
    .setInputFiles("/tmp/identifier-q-tests/test-footage.webm");
  await expect(page.getByText(/Local preview ready/)).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Fighter name or identifier")
    .fill("Synthetic cancellation test");
  await page.getByRole("radio", { name: /Red corner/ }).check();
  await expect
    .poll(() =>
      page
        .getByLabel("Fighter identification video")
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "Use current frame center" }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate performance analysis" })
    .click();
  await expect(page.getByText(/Reviewing sampled frames/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "boxing", exact: true }).first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel analysis", exact: true })
    .first()
    .click();
  await expect.poll(() => providerCanceled).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Performance overview" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("identifier-q.reports.v1") ?? "[]"),
    ),
  ).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "boxing", exact: true }).first(),
  ).toBeEnabled();
  holdAnalysis = false;
});
