import { expect, test } from "@playwright/test";
import { emptyCamp } from "../src/camp/model";
test("empty camp, editable fighter, opponent, dated plan and backup survive reload without fabricated metrics", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Fight date not set", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Opponent not set", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/No improvements confirmed yet/)).toBeVisible();
  await page.goto("/#/profile");
  await page
    .getByLabel("Stance", { exact: true })
    .fill("Southpaw — synthetic test entry");
  await page
    .getByLabel("Development priorities")
    .fill("Synthetic test-only priority");
  await page.getByRole("button", { name: "Save fighter profile" }).click();
  await page.reload();
  await expect(page.getByLabel("Stance", { exact: true })).toHaveValue(
    "Southpaw — synthetic test entry",
  );
  await page.goto("/#/opponents");
  await page.getByLabel("Opponent name").fill("Synthetic opponent");
  await page
    .getByLabel("Source notes and uncertainty")
    .fill("Coach note, not verified AI output");
  await page
    .getByRole("button", { name: "Save opponent", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Edit Synthetic opponent" }),
  ).toBeVisible();
  await page.goto("/#/plan");
  await page.getByLabel("Camp name").fill("Synthetic test camp");
  await page.getByLabel("Camp start date").fill("2026-11-01");
  await page.getByLabel("Fight date", { exact: true }).fill("2026-12-01");
  await page
    .getByLabel("Next opponent")
    .selectOption({ label: "Synthetic opponent" });
  await page.getByLabel("Camp status", { exact: true }).selectOption("in-camp");
  await page.getByLabel("Coach’s camp notes").fill("Synthetic camp note");
  await page.getByRole("button", { name: "Save camp details" }).click();
  await page.goto("/");
  await expect(page.getByText("Vince vs Synthetic opponent")).toBeVisible();
  await expect(page.getByText("Synthetic camp note")).toBeVisible();
  await page.goto("/#/settings");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export camp backup", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("identifier-q-camp.json");
});

test("timestamped coaching chain, follow-up evidence and training draft stay distinct from AI findings", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/#/analysis");
  await expect(
    page.getByText(/Secure resumable 1 GB uploads are not implemented/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Fight analysis/ }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Cross-angle identity tracking/ }),
  ).toBeVisible();
  for (const [title, date] of [
    ["Synthetic source round", "2026-11-10"],
    ["Synthetic follow-up round", "2026-11-11"],
  ]) {
    await page
      .getByRole("button", { name: "New session", exact: true })
      .click();
    await page.getByLabel("Session title").fill(title);
    await page.getByLabel("Session date", { exact: true }).fill(date);
    await page
      .getByLabel("Original footage filename or source reference")
      .fill("synthetic.webm");
    await page.getByLabel("Manual identity confirmation").selectOption("yes");
    await page.getByRole("button", { name: "Save session record" }).click();
  }
  await page.goto("/#/development");
  await page
    .getByLabel("Source session", { exact: true })
    .selectOption({ label: "2026-11-10 / Synthetic source round / fight" });
  await page.getByLabel("Evidence classification").selectOption("hypothesis");
  await page.getByLabel("Evidence start (seconds)").fill("14");
  await page.getByLabel("Evidence end (seconds, optional)").fill("16");
  for (const [label, text] of [
    [
      "Evidence sequence / what is visible",
      "Synthetic source sequence; coach must verify",
    ],
    ["Observation — what visibly happened", "Synthetic test observation"],
    ["Diagnosis — why it matters", "Synthetic test diagnosis"],
    [
      "Consequence — vulnerability or opportunity",
      "Synthetic tactical consequence",
    ],
    ["Correction — what should change", "Synthetic correction"],
    [
      "Training application — specific drill and dosage",
      "Synthetic drill, two technical rounds",
    ],
  ])
    await page.getByLabel(label, { exact: true }).fill(text);
  await page.getByRole("button", { name: "Save coaching finding" }).click();
  await expect(
    page.getByText("HYPOTHESIS · UNVERIFIED", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/0:14–0:16/)).toBeVisible();
  await page.getByText("Add follow-up review", { exact: true }).click();
  const finding = page.locator(".finding-card");
  await finding
    .getByLabel("Source session", { exact: true })
    .last()
    .selectOption({ label: "2026-11-11 / Synthetic follow-up round / fight" });
  await page.getByLabel("Follow-up timestamp (seconds)").fill("20");
  await page
    .getByLabel("Coach’s development assessment")
    .selectOption("improving");
  await page
    .getByLabel("Visible follow-up sequence")
    .fill("Synthetic follow-up evidence");
  await page
    .getByLabel("What changed or persisted")
    .fill("Synthetic documented improvement");
  await page.getByRole("button", { name: "Save follow-up evidence" }).click();
  await page
    .getByLabel("Earlier session / round")
    .selectOption({ label: "2026-11-10 / Synthetic source round / fight" });
  await page
    .getByLabel("Later session / round")
    .selectOption({ label: "2026-11-11 / Synthetic follow-up round / fight" });
  await expect(page.locator(".comparison-round")).toHaveCount(2);
  await page.goto("/#/plan");
  await page
    .getByRole("button", { name: "Draft objective from priority" })
    .click();
  await expect(page.locator(".objective-card")).toContainText("draft");
  await expect(page.locator(".objective-card")).toContainText(
    "Synthetic correction",
  );
  await page.goto("/");
  await expect(
    page.getByText("Synthetic documented improvement"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Synthetic documented improvement"),
  ).toBeVisible();
});

test("invalid backups and corrupted camp storage preserve both original camp and legacy records", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("identifier-q.camp.v1", "unreadable-camp-original");
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "original data was preserved",
  );
  await page.goto("/#/profile");
  await page
    .getByLabel("Stance", { exact: true })
    .fill("Must not overwrite corrupted data");
  await page.getByRole("button", { name: "Save fighter profile" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("identifier-q.camp.v1")),
  ).toBe("unreadable-camp-original");
  await page.goto("/#/settings");
  await page.getByLabel("Restore camp backup", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"wrong"}'),
  });
  await expect(page.getByText(/Invalid camp backup/)).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("identifier-q.camp.v1")),
  ).toBe("unreadable-camp-original");
});

test("validated camp restore downloads recovery first and preserves the existing report library", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const legacy = await page.evaluate(() =>
    localStorage.getItem("identifier-q.reports.v1"),
  );
  const workspace = emptyCamp();
  workspace.profile.notes = "Synthetic restored coach note";
  await page
    .getByLabel("Restore camp backup", { exact: true })
    .setInputFiles({
      name: "camp.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "identifier-q-camp", version: 1, workspace }),
      ),
    });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download recovery and replace camp" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "identifier-q-raw-recovery.json",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("identifier-q.reports.v1")),
  ).toBe(legacy);
  await page.goto("/");
  await expect(page.getByText("Synthetic restored coach note")).toBeVisible();
});
