import { describe, expect, it, vi } from "vitest";
import { connectAnalysisService } from "./httpAnalysis";
import { makeReport } from "../../tests/fixture";
const health = {
  schemaVersion: 1,
  protocol: "request-stream-v1",
  available: true,
  provider: "test",
  model: "test-only",
  tracking: false,
  qualitativeOnly: true,
  limits: { maxBytes: 25 * 1024 * 1024, minSeconds: 10, maxSeconds: 300 },
  message: "Synthetic contract-test response.",
};
const token = "synthetic-test-session-token-never-real";
describe("HTTP analysis contract", () => {
  it("accepts successful ordinary JSON endpoints and reports incomplete JSON clearly", async () => {
    const report = makeReport();
    const { service } = await connectAnalysisService(
      "http://localhost:8787",
      token,
      async (url) =>
        new Response(
          JSON.stringify(String(url).endsWith("/health") ? health : report),
        ),
    );
    expect(await service.report(report.id)).toEqual(report);
    await expect(
      connectAnalysisService(
        "http://localhost:8787",
        token,
        async () => new Response('{"schemaVersion":'),
      ),
    ).rejects.toThrow("unreadable or incomplete JSON");
  });
  it.each([401, 403, 413, 429, 500, 503])(
    "preserves HTTP %i errors with JSON and non-JSON bodies",
    async (status) => {
      for (const [body, message] of [
        [
          JSON.stringify({ message: "Backend diagnostic" }),
          "Backend diagnostic",
        ],
        ["upstream unavailable", `HTTP ${status}`],
      ]) {
        await expect(
          connectAnalysisService(
            "http://localhost:8787",
            token,
            async () => new Response(body, { status }),
          ),
        ).rejects.toThrow(message);
      }
    },
  );
  it("requires HTTPS outside loopback and keeps the token out of URLs", async () => {
    await expect(
      connectAnalysisService("http://remote.example", token),
    ).rejects.toThrow("HTTPS");
    await expect(
      connectAnalysisService("https://user:secret@example.test", token),
    ).rejects.toThrow("without credentials");
    const request = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(health)),
    );
    await connectAnalysisService(
      "https://api.example.test",
      token,
      request as typeof fetch,
    );
    expect(request.mock.calls[0][0]).not.toContain(token);
  });
  it("validates health and reports and rejects invalid backend responses", async () => {
    await expect(
      connectAnalysisService(
        "http://localhost:8787",
        token,
        async () => new Response("{}"),
      ),
    ).rejects.toThrow();
    const request = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(String(url).endsWith("/health") ? health : {}),
        ),
    );
    const { service } = await connectAnalysisService(
      "http://localhost:8787",
      token,
      request as typeof fetch,
    );
    await expect(service.report("bad")).rejects.toThrow();
  });
  it("sends the original file and immutable fighter metadata, with reusable idempotency keys", async () => {
    const report = makeReport();
    report.configuration.fighter.subjectId = crypto.randomUUID();
    report.configuration.fighter.confirmationFrames = [
      { time: 1, x: 0.4, y: 0.5 },
    ];
    const calls: RequestInit[] = [];
    const request = async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/health"))
        return new Response(JSON.stringify(health));
      calls.push(init!);
      const id = (init!.headers as Record<string, string>)["idempotency-key"];
      const complete = { ...report, id };
      const job = {
        id,
        configuration: report.configuration,
        video: report.video,
        status: "completed",
        reportId: id,
      };
      return new Response(
        JSON.stringify({ type: "result", job, report: complete }) + "\n",
        { headers: { "content-type": "application/x-ndjson" } },
      );
    };
    const { service } = await connectAnalysisService(
      "http://localhost:8787",
      token,
      request as typeof fetch,
    );
    const input = {
      file: new File(["test"], report.video.name, { type: "video/webm" }),
      video: report.video,
      configuration: report.configuration,
    };
    const first = await service.submit(input);
    const returned = await service.report(first.id);
    expect(returned.id).toBe(first.id);
    expect(calls).toHaveLength(1);
    await service.submit(input);
    expect(calls[0].headers).toMatchObject({
      authorization: `Bearer ${token}`,
    });
    expect(calls[0].headers).toEqual(calls[1].headers);
    const metadata = JSON.parse(
      String((calls[0].body as FormData).get("metadata")),
    );
    expect(metadata.configuration.fighter.confirmationFrames).toEqual([
      { time: 1, x: 0.4, y: 0.5 },
    ]);
  });
  it("handles non-JSON and network failures as actionable errors", async () => {
    await expect(
      connectAnalysisService("http://localhost:8787", token, async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("backend request failed");
    await expect(
      connectAnalysisService(
        "http://localhost:8787",
        token,
        async () => new Response("denied", { status: 401 }),
      ),
    ).rejects.toThrow("HTTP 401");
  });
});
it("respects a Cloud Run backend’s smaller advertised limit without starting an upload", async () => {
  const request = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          ...health,
          limits: { ...health.limits, maxBytes: 25 * 1024 * 1024 },
        }),
      ),
  );
  const { service } = await connectAnalysisService(
    "http://localhost:8787",
    token,
    request,
  );
  const report = makeReport();
  const onUploadStart = vi.fn();
  await expect(
    service.submit(
      {
        file: { size: 26 * 1024 * 1024 } as File,
        video: report.video,
        configuration: report.configuration,
      },
      undefined,
      onUploadStart,
    ),
  ).rejects.toThrow("25 MB");
  expect(request).toHaveBeenCalledTimes(1);
  expect(onUploadStart).not.toHaveBeenCalled();
});
it("refuses detached-background backends and makes no upload attempt", async () => {
  await expect(
    connectAnalysisService(
      "http://localhost:8787",
      token,
      async () =>
        new Response(JSON.stringify({ ...health, protocol: undefined })),
    ),
  ).rejects.toThrow("unsupported processing protocol");
});
it("keeps an ambiguous interrupted submission key for an explicit retry and needs no GET after inline completion", async () => {
  const report = makeReport();
  report.configuration.fighter.frame = { time: 1, x: 0.5, y: 0.5 };
  const keys: string[] = [];
  let attempts = 0;
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/health"))
      return new Response(JSON.stringify(health));
    if (init?.method !== "POST")
      throw new Error("A follow-up GET must not be required.");
    const key = (init.headers as Record<string, string>)["idempotency-key"];
    keys.push(key);
    attempts++;
    const job = {
      id: key,
      configuration: report.configuration,
      video: report.video,
      status: "processing",
      stage: "analyzing",
    };
    return new Response(
      (attempts === 1
        ? JSON.stringify({ type: "job", job })
        : JSON.stringify({
            type: "result",
            job: { ...job, status: "completed", reportId: key },
            report: { ...report, id: key },
          })) + "\n",
      { headers: { "content-type": "application/x-ndjson" } },
    );
  };
  const { service } = await connectAnalysisService(
    "http://localhost:8787",
    token,
    request,
  );
  const input = {
    file: new File(["test"], report.video.name, { type: "video/webm" }),
    video: report.video,
    configuration: report.configuration,
  };
  await expect(service.submit(input)).rejects.toThrow(
    "before a complete report",
  );
  const job = await service.submit(input);
  expect(keys[0]).toBe(keys[1]);
  expect((await service.report(job.id)).id).toBe(job.id);
});
it("canceling one submission preserves duplicate protection for another submission", async () => {
  const report = makeReport();
  report.configuration.fighter.frame = { time: 1, x: 0.5, y: 0.5 };
  const posts: { id: string; name: string }[] = [];
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith("/health"))
      return new Response(JSON.stringify(health));
    if (init?.method === "DELETE")
      return new Response(JSON.stringify({ status: "completed" }));
    const id = (init!.headers as Record<string, string>)["idempotency-key"];
    const metadata = JSON.parse(
      String((init!.body as FormData).get("metadata")),
    );
    posts.push({ id, name: metadata.configuration.fighter.name });
    return new Response(
      JSON.stringify({
        type: "result",
        job: { id, status: "completed", reportId: id, ...metadata },
        report: { ...report, id, ...metadata },
      }) + "\n",
      { headers: { "content-type": "application/x-ndjson" } },
    );
  };
  const { service } = await connectAnalysisService(
    "http://localhost:8787",
    token,
    request,
  );
  const input = {
    file: new File(["test"], report.video.name, { type: "video/webm" }),
    video: report.video,
    configuration: report.configuration,
  };
  const first = await service.submit(input);
  const other = {
    ...input,
    configuration: {
      ...input.configuration,
      fighter: {
        ...input.configuration.fighter,
        name: "Second synthetic subject",
      },
    },
  };
  await service.submit(other);
  await service.cancel(first.id);
  await service.submit(other);
  expect(posts[1].id).toBe(posts[2].id);
});
