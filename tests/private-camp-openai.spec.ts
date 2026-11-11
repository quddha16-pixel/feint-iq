import { test, expect } from "@playwright/test";
import { createBackend } from "../server/app";
import { OpenAIProvider } from "../server/openai-provider";
import { coachingOpenAI, openAIResponse } from "./openai-fixture";
const token = "synthetic-integration-pilot-token-not-real";
const providerKey = "synthetic-integration-openai-key-not-real";

test("private camp records survive actual decoding and OpenAI-shaped NDJSON analysis with usage and drills", async ({
  page,
}) => {
  test.setTimeout(90000);
  const calls: string[] = [];
  const backend = await createBackend({
    origin: "http://127.0.0.1:5173",
    accessToken: token,
    provider: new OpenAIProvider(providerKey, {
      maxRequestUsd: 4.5,
      request: async (url, init) => {
        calls.push(String(url));
        if (String(url).endsWith("/input_tokens"))
          return new Response(
            JSON.stringify({
              object: "response.input_tokens",
              input_tokens: 12000,
            }),
          );
        if (String(url) !== "https://api.openai.com/v1/responses")
          throw new Error("External calls are forbidden in this test");
        const body = JSON.parse(String(init?.body));
        const frames = body.input[0].content
          .filter((c: { type: string }) => c.type === "input_text")
          .map((c: { text: string }) => JSON.parse(c.text))
          .filter((c: { role?: string }) => c.role === "sequence-evidence");
        expect(frames.length).toBeGreaterThan(2);
        const assessment = {
          ...coachingOpenAI,
          observations: [
            {
              ...coachingOpenAI.observations[0],
              frameIds: [frames[1].frameId],
            },
          ],
        };
        return new Response(JSON.stringify(openAIResponse(assessment)));
      },
    }),
  });
  await backend.listen({ host: "127.0.0.1", port: 0 });
  try {
    await page.goto("/#/profile");
    await page
      .getByLabel("Coach observations", { exact: true })
      .fill("Synthetic coach note retained across analysis");
    await page.getByRole("button", { name: "Save fighter profile" }).click();
    await page.goto("/#/plan");
    await page.getByLabel("Camp name").fill("Synthetic integrated camp");
    await page.getByRole("button", { name: "Save camp details" }).click();
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
    await page
      .getByRole("button", { name: "Generate performance analysis" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Performance overview" }),
    ).toBeVisible({ timeout: 20000 });
    const jobId = new URL(page.url()).hash.split("/").at(-1)!;
    const receipt = await (
      await fetch(`${backend.listeningOrigin}/analyses/${jobId}/usage`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    expect(receipt.preflight.limitUsd).toBe(4.5);
    expect(receipt.tokens.total).toBe(13000);
    expect(calls).toEqual([
      "https://api.openai.com/v1/responses/input_tokens",
      "https://api.openai.com/v1/responses",
    ]);
    await page.getByRole("tab", { name: "Improvement", exact: true }).click();
    await expect(
      page.getByText("Two technical rounds", { exact: true }),
    ).toBeVisible();
    await page.goto("/#/analysis");
    await page
      .getByLabel("Session title")
      .fill("Synthetic reviewed sparring round");
    await page.getByLabel("Session date", { exact: true }).fill("2026-11-10");
    await page
      .getByLabel("Attach existing analysis report")
      .selectOption(jobId);
    await page.getByRole("button", { name: "Save session record" }).click();
    await page.goto("/");
    await expect(
      page.getByText("Synthetic reviewed sparring round", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Read attached analysis/ }),
    ).toBeVisible();
    await expect(
      page.getByText("Synthetic integrated camp", { exact: true }),
    ).toBeVisible();
    await page.goto("/#/profile");
    await expect(
      page.getByLabel("Coach observations", { exact: true }),
    ).toHaveValue("Synthetic coach note retained across analysis");
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain(providerKey);
  } finally {
    await backend.close();
  }
});
