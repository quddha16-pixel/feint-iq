import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBackend } from "./app";
import {
  GeminiProvider,
  providerResultSchema,
  type VideoAnalysisProvider,
  type ProviderResult,
} from "./provider";
import { prepareVideo, run, type PreparedVideo } from "./media";
import { buildReport } from "./report";
import { makeReport } from "../tests/fixture";
const token = "synthetic-test-session-token-not-for-production";
const metadata = () => {
  const report = makeReport();
  return {
    configuration: {
      ...report.configuration,
      fighter: {
        ...report.configuration.fighter,
        subjectId: randomUUID(),
        confirmationFrames: [{ time: 1, x: 0.5, y: 0.5 }],
        tracking: {
          identityIndependentOfPosition: true as const,
          status: "unverified" as const,
          challenges: ["position-change" as const],
        },
      },
    },
    video: { ...report.video, size: 4, duration: 12 },
  };
};
const prepared: PreparedVideo = {
  duration: 12,
  frames: [
    { id: "frame-1", time: 0, mime: "image/jpeg", data: "test-only" },
    { id: "frame-2", time: 0.5, mime: "image/jpeg", data: "test-only" },
  ],
};
const findings: ProviderResult = {
  identityConfirmed: true,
  identityExplanation: "Synthetic identity confirmation for tests only.",
  summary: "Synthetic test adapter output; no real footage assessment.",
  observations: [
    {
      category: "defense",
      metricId: "defense",
      finding: "Synthetic guard finding",
      explanation: "Only a test assertion.",
      frameIds: ["frame-2"],
      polarity: "weakness",
      correctiveAction: "Synthetic corrective action.",
    },
  ],
};
const provider: VideoAnalysisProvider = {
  name: "Synthetic test adapter",
  model: "test-only",
  analyze: async () => findings,
};
const apps: Awaited<ReturnType<typeof createBackend>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
async function start(
  options: Partial<Parameters<typeof createBackend>[0]> = {},
) {
  const app = await createBackend({
    origin: "http://localhost:5173",
    accessToken: token,
    provider,
    prepare: async () => prepared,
    ...options,
  });
  apps.push(app);
  await app.listen({ host: "127.0.0.1", port: 0 });
  return app.listeningOrigin;
}
function form(data: ReturnType<typeof metadata>) {
  const f = new FormData();
  f.append("metadata", JSON.stringify(data));
  f.append(
    "video",
    new Blob(["test"], { type: "video/webm" }),
    data.video.name,
  );
  return f;
}
async function submit(base: string, data = metadata(), key = randomUUID()) {
  const response = await fetch(base + "/analyses", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
    body: form(data),
  });
  return { response, body: await response.json(), data, key };
}
async function finish(base: string, id: string) {
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${base}/analyses/${id}/status`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const job = await response.json();
    if (!["queued", "processing"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Test job did not finish.");
}
describe("authenticated live-transport foundation (synthetic provider only)", () => {
  it("requires a session token and restricts origins", async () => {
    const base = await start();
    expect((await fetch(base + "/health")).status).toBe(401);
    expect(
      (
        await fetch(base + "/health", {
          headers: {
            authorization: `Bearer ${token}`,
            origin: "https://untrusted.example",
          },
        })
      ).status,
    ).toBe(403);
    const health = await (
      await fetch(base + "/health", {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    expect(health.limits).toEqual({
      minSeconds: 10,
      maxSeconds: 300,
      maxBytes: 100 * 1024 * 1024,
    });
    expect(health.tracking).toBe(false);
  });
  it("does not accept footage when no provider is configured", async () => {
    const base = await start({ provider: undefined });
    const { response } = await submit(base);
    expect(response.status).toBe(503);
  });
  it("preserves identity metadata, generates a validated qualitative report, and never scores", async () => {
    const analyze = vi.fn(provider.analyze);
    const base = await start({ provider: { ...provider, analyze } });
    const result = await submit(base);
    expect(result.response.status).toBe(202);
    const job = await finish(base, result.body.id);
    expect(job.status).toBe("completed");
    const report = await (
      await fetch(`${base}/analyses/${job.id}/report`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).json();
    expect(report.configuration).toEqual(result.data.configuration);
    expect(report.assessment.score).toBeNull();
    expect(
      report.metrics.every((m: { score: number | null }) => m.score === null),
    ).toBe(true);
    expect(report.evidence[0]).toMatchObject({
      verifiedTime: 0.5,
      source: "sampled-frame",
      frameId: "frame-2",
    });
    expect(analyze).toHaveBeenCalledTimes(1);
    const repeated = await submit(base, result.data, result.key);
    expect(repeated.body.id).toBe(job.id);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid duration, missing identity references, and unsupported live disciplines", async () => {
    const base = await start();
    const short = metadata();
    short.video.duration = 9;
    expect((await submit(base, short)).response.status).toBe(422);
    const long = metadata();
    long.video.duration = 301;
    expect((await submit(base, long)).response.status).toBe(422);
    const kickboxing = metadata();
    kickboxing.configuration.discipline = "kickboxing";
    kickboxing.configuration.ruleset = "k1";
    expect((await submit(base, kickboxing)).response.status).toBe(422);
    const noFrame = metadata();
    noFrame.configuration.fighter.confirmationFrames = [];
    expect((await submit(base, noFrame)).response.status).toBe(422);
  });
  it("rejects a provider response citing invented frames or an unconfirmed identity", () => {
    const d = metadata();
    expect(() =>
      buildReport(
        "test",
        d.configuration,
        d.video,
        prepared,
        { ...findings, identityConfirmed: false },
        "test",
        new Date().toISOString(),
      ),
    ).toThrow("could not confirm");
    expect(() =>
      buildReport(
        "test",
        d.configuration,
        d.video,
        prepared,
        {
          ...findings,
          observations: [
            { ...findings.observations[0], frameIds: ["invented-time"] },
          ],
        },
        "test",
        new Date().toISOString(),
      ),
    ).toThrow("unknown source frame");
    expect(
      providerResultSchema.safeParse({ ...findings, score: 99 }).success,
    ).toBe(false);
  });
  it("cancels in-flight analysis without saving a partial report", async () => {
    const stalled: VideoAnalysisProvider = {
      ...provider,
      analyze: async (_, __, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("Canceled")),
            { once: true },
          ),
        ),
    };
    const base = await start({ provider: stalled });
    const result = await submit(base);
    const canceled = await fetch(`${base}/analyses/${result.body.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(canceled.status).toBe(200);
    expect((await finish(base, result.body.id)).status).toBe("canceled");
    expect(
      (
        await fetch(`${base}/analyses/${result.body.id}/report`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(409);
  });
  it("rejects simultaneous jobs rather than consuming more provider calls", async () => {
    const stalled: VideoAnalysisProvider = {
      ...provider,
      analyze: async (_, __, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("Stopped")), {
            once: true,
          }),
        ),
    };
    const base = await start({ provider: stalled });
    const first = await submit(base);
    expect((await submit(base)).response.status).toBe(429);
    await fetch(`${base}/analyses/${first.body.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  });
  it("fails timed-out jobs and invalid evidence without saving a report", async () => {
    const stalled: VideoAnalysisProvider = {
      ...provider,
      analyze: async (_, __, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("Timed out")),
            { once: true },
          ),
        ),
    };
    const base = await start({ provider: stalled, timeoutMs: 20 });
    const first = await submit(base);
    expect((await finish(base, first.body.id)).error).toContain("timed out");
    const invalid = await start({
      provider: {
        ...provider,
        analyze: async () => ({
          ...findings,
          observations: [
            { ...findings.observations[0], frameIds: ["not-a-real-frame"] },
          ],
        }),
      },
    });
    const job = await submit(invalid);
    expect((await finish(invalid, job.body.id)).status).toBe("failed");
    expect(
      (
        await fetch(`${invalid}/analyses/${job.body.id}/report`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(409);
  });
  it("reports missing or expired results clearly", async () => {
    const base = await start({ ttlMs: 1 });
    expect(
      (
        await fetch(base + "/analyses/missing/status", {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(404);
    const result = await submit(base);
    await finish(base, result.body.id).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 5));
    expect(
      (
        await fetch(`${base}/analyses/${result.body.id}/report`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(404);
  });
});
describe("server-only Gemini adapter", () => {
  it("sends frames and identity metadata with a server header, and validates structured findings", async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: JSON.stringify(findings) }] },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const gemini = new GeminiProvider(
      "synthetic-provider-key",
      "gemini-3.5-flash-lite",
      request as typeof fetch,
    );
    expect(
      await gemini.analyze(
        prepared,
        metadata().configuration,
        new AbortController().signal,
      ),
    ).toEqual(findings);
    const init = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[0]).toContain("generativelanguage.googleapis.com");
    expect(init[1].headers).toMatchObject({
      "x-goog-api-key": "synthetic-provider-key",
    });
    expect(String(init[1].body)).toContain("identityIndependentOfPosition");
    expect(String(init[1].body)).toContain("frame-2");
  });
  it("does not substitute mock findings on provider rejection or malformed responses", async () => {
    for (const response of [
      new Response("{}", { status: 403 }),
      new Response(
        JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
      ),
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: "not JSON" }] },
            },
          ],
        }),
      ),
    ]) {
      const adapter = new GeminiProvider(
        "synthetic-key",
        "test",
        async () => response,
      );
      await expect(
        adapter.analyze(
          prepared,
          metadata().configuration,
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    }
  });
});
it("decodes real codec-test footage and derives source timestamps from ffmpeg, including a full five-minute clip", async () => {
  const dir = await mkdtemp(join(tmpdir(), "iq-media-test-"));
  try {
    for (const seconds of [10, 300]) {
      const source = join(dir, `sample-${seconds}.webm`);
      await run("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=32x32:r=2",
        "-t",
        String(seconds),
        "-c:v",
        "libvpx",
        "-threads",
        "1",
        "-y",
        source,
      ]);
      const output = await mkdtemp(join(dir, "frames-"));
      const result = await prepareVideo(
        source,
        output,
        metadata().configuration,
      );
      expect(result.duration).toBe(seconds);
      const sequence = result.frames.filter((f) => !f.identityReference);
      expect(sequence.length).toBeLessThanOrEqual(120);
      expect(sequence.at(-1)!.time).toBeGreaterThan(seconds * 0.9);
      expect(result.frames.every((f) => f.data.length > 0)).toBe(true);
      expect(result.frames.at(-1)?.identityReference).toMatchObject({
        x: 0.5,
        y: 0.5,
      });
      expect((await readFile(source)).length).toBeGreaterThan(0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
it("maps provider stylistic references to supporting report observations and rejects invented links", () => {
  const d = metadata();
  const withStyle: ProviderResult = {
    ...findings,
    styleComparisons: [
      {
        referenceId: "floyd-mayweather",
        explanation:
          "Synthetic test stylistic comparison, not a real athlete assessment.",
        observationIndexes: [0],
      },
    ],
  };
  const report = buildReport(
    "style-test",
    d.configuration,
    d.video,
    prepared,
    withStyle,
    "test-only",
    new Date().toISOString(),
  );
  expect(report.styleComparisons?.[0]).toMatchObject({
    referenceId: "floyd-mayweather",
    observationIds: ["observation-1"],
  });
  withStyle.styleComparisons![0].observationIndexes = [5];
  expect(() =>
    buildReport(
      "bad-style",
      d.configuration,
      d.video,
      prepared,
      withStyle,
      "test-only",
      new Date().toISOString(),
    ),
  ).toThrow("missing observation");
});
