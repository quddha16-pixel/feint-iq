import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createBackend } from "../server/app";
import { OpenAIProvider } from "../server/openai-provider";
import { openAIResponse } from "./openai-fixture";
import { momentAssessment } from "./moment-fixture";
import { makeReport } from "./fixture";
const token = "synthetic-moment-browser-token-not-real";
test("moment sequences, playback, coach corrections and missed moments survive reload and export", async ({
  page,
}) => {
  test.setTimeout(90000);
  let calls = 0;
  const backend = await createBackend({
    origin: "http://127.0.0.1:5173",
    accessToken: token,
    provider: new OpenAIProvider("synthetic-moment-browser-provider-key", {
      request: async (_url, init) => {
        calls++;
        const payload = JSON.parse(String(init?.body));
        const metadata = JSON.parse(payload.input[0].content[0].text);
        const moments = metadata.selectedMoments.map(
          (m: { id: string; frameIds: string[] }) =>
            momentAssessment(m.id, [m.frameIds[0], m.frameIds.at(-1)!]),
        );
        return new Response(
          JSON.stringify(
            openAIResponse({
              summary: "Synthetic moment browser assessment only",
              moments,
            }),
          ),
        );
      },
    }),
  });
  await backend.listen({ host: "127.0.0.1", port: 0 });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.evaluate(
      (report) =>
        localStorage.setItem(
          "identifier-q.reports.v1",
          JSON.stringify([report]),
        ),
      makeReport(),
    );
    await page.reload();
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
    await page.getByLabel("Fighter name or identifier").fill("Vince");
    await page.getByRole("radio", { name: /Red corner/ }).check();
    await expect
      .poll(() =>
        page
          .getByLabel("Fighter identification video")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await page
      .getByRole("button", { name: "Use current frame center" })
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByLabel("Find moments and basic defensive coaching"),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Generate performance analysis" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Moment review · v0.1" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(
        /Fallback coverage samples: no suitable motion peaks found/,
      ),
    ).toBeVisible();
    const first = page.getByRole("article", {
      name: "Review moment-1",
      exact: true,
    });
    await expect(
      first.getByRole("button", { name: "Play selected moment" }),
    ).toBeDisabled();
    await page
      .getByLabel("Choose original video")
      .setInputFiles("/tmp/identifier-q-tests/test-footage.webm");
    await expect
      .poll(() =>
        page
          .getByLabel("Report footage")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    await first.getByRole("button", { name: "Play selected moment" }).click();
    await expect
      .poll(() =>
        page
          .getByLabel("Report footage")
          .evaluate((v: HTMLVideoElement) => v.currentTime),
      )
      .toBeGreaterThan(1);
    await first.getByRole("button", { name: "Incorrect", exact: true }).click();
    await first.getByRole("button", { name: "Useful", exact: true }).click();
    await first
      .getByLabel("Coach correction or note")
      .fill("Synthetic coach correction retained");
    await first.getByRole("heading").click();
    await page.getByLabel("Missed moment timestamp (seconds)").fill("10");
    await page
      .getByLabel("What was missed?")
      .fill("Synthetic quiet movement missed by motion ranking");
    await page
      .getByRole("button", { name: "Record missed moment", exact: true })
      .click();
    await page
      .getByLabel("Coach reviewed the whole recording for missed moments")
      .check();
    await page.reload();
    await expect(
      first.getByRole("button", { name: "Incorrect", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      first.getByRole("button", { name: "Useful", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(first.getByLabel("Coach correction or note")).toHaveValue(
      "Synthetic coach correction retained",
    );
    await expect(
      page.getByText(/Synthetic quiet movement missed by motion ranking/),
    ).toBeVisible();
    await expect(
      page.getByLabel("Coach reviewed the whole recording for missed moments"),
    ).toBeChecked();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
    await page
      .getByRole("heading", { name: "Moment review · v0.1" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/iq-moment-review-mobile.png" });
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export report", exact: true })
      .click();
    const exported = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(exported.momentAnalysis.missed).toHaveLength(1);
    expect(exported.momentAnalysis.moments[0].review.finding).toBe("incorrect");
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("identifier-q.reports.v1")!).length,
      ),
    ).toBe(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(calls).toBe(1);
    const original = await page.evaluate(() =>
      localStorage.getItem("identifier-q.reports.v1")!,
    );
    await page.evaluate(() =>
      localStorage.setItem("identifier-q.reports.v1", "{corrupt"),
    );
    await first.getByRole("button", { name: "Correct", exact: true }).click();
    await expect(
      page.getByText(/library changed or is not saved/),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("identifier-q.reports.v1"),
      ),
    ).toBe("{corrupt");
    await page.evaluate((raw) => {
      const reports = JSON.parse(raw);
      reports[0].assessment.summary = "Synthetic external tab change";
      localStorage.setItem("identifier-q.reports.v1", JSON.stringify(reports));
    }, original);
    await first.getByRole("button", { name: "Correct", exact: true }).click();
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("identifier-q.reports.v1")!)[0]
            .assessment.summary,
      ),
    ).toBe("Synthetic external tab change");
    await page.evaluate((raw) => {
      localStorage.setItem("identifier-q.reports.v1", raw);
      Storage.prototype.setItem = () => {
        throw new Error("Synthetic storage failure");
      };
    }, original);
    await first.getByRole("button", { name: "Correct", exact: true }).click();
    await expect(
      page.getByText(/Could not save to this browser/),
    ).toBeVisible();
    await expect(
      first.getByRole("button", { name: "Incorrect", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("identifier-q.reports.v1"),
      ),
    ).toBe(original);
  } finally {
    await backend.close();
  }
});
