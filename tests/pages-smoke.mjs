import process from "node:process";
import { URL } from "node:url";
import console from "node:console";
// Check a built Pages site; no synthetic reports or footage are loaded.
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
const target = new URL(process.argv[2] || "http://127.0.0.1:4173/feint-iq/");
const local = ["127.0.0.1", "localhost"].includes(target.hostname);
const browser = await chromium.launch({
  executablePath:
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
  ...(local || !process.env.HTTPS_PROXY
    ? {}
    : { proxy: { server: process.env.HTTPS_PROXY } }),
});
try {
  const page = await browser.newPage();
  const errors = [];
  const assets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (["script", "stylesheet"].includes(response.request().resourceType()))
      assets.push({ url: response.url(), status: response.status() });
  });
  const response = await page.goto(target.href, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  if (response?.status() !== 200)
    throw new Error(`Site returned HTTP ${response?.status()}`);
  await page
    .getByRole("heading", { name: /Vince’s fight camp/ })
    .waitFor({ timeout: 10000 });
  const html = await response.text();
  if (!html.includes("/feint-iq/assets/"))
    throw new Error(
      "Production HTML does not reference the repository asset base path.",
    );
  if (
    !assets.some((a) => a.url.endsWith(".js")) ||
    !assets.some((a) => a.url.endsWith(".css"))
  )
    throw new Error("Missing JavaScript or CSS asset requests.");
  if (assets.some((a) => a.status !== 200))
    throw new Error(`Asset requests failed: ${JSON.stringify(assets)}`);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Open analysis center", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Study the round.", exact: true })
    .waitFor();
  for (const path of ["/history", "/report", "/settings", "/about", "/"]) {
    await page.goto(`${target.href}#${path}`);
    await page.locator("h1").waitFor();
    if (new URL(page.url()).pathname !== target.pathname)
      throw new Error("Navigation escaped the repository base path.");
  }
  await page.reload();
  await page
    .getByRole("heading", { name: /Vince’s fight camp/ })
    .waitFor();
  if (errors.length) throw new Error(`JavaScript errors: ${errors.join("; ")}`);
  console.log(
    JSON.stringify(
      {
        site: target.href,
        result: "passed",
        assets,
        navigation:
          "dashboard, new analysis, history, report, settings, about, reload",
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
